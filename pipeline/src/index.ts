import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { LlmClient } from "./llm.ts";
import type { ArticleSource, SourceConfig, SourceFeed } from "./fetch.ts";
import { dedup, loadSeen, sha256 } from "./fetch.ts";
import { extractFromArticle } from "./extract.ts";
import { runGates, type NormalizedArticle } from "./gates.ts";
import { verifyCandidate, type VerifyResult } from "./verify.ts";
import type { ArchiveFn } from "./archive.ts";
import { estimateCost } from "./cost.ts";
import { findPossibleDuplicate, type ExistingPromiseLite } from "./similarity.ts";
import { generateQuip } from "./copy.ts";
import { maybeGenerateWeekly, type ChronicleEntry } from "./chronicle.ts";
import {
  publish,
  type PipelinePromise,
  type NeedsReviewEntry,
  type ChangelogEntry,
} from "./publish.ts";

export interface PipelineContext {
  now: Date;
  runId: string;
  llm: LlmClient;
  articleSource: ArticleSource;
  outputDir: string;
  dataDir: string;
  allowlist: readonly string[];
  mode: "auto" | "review";
  /** Max antal NYA (osedda) artiklar att bearbeta per körning. Odefinierat = alla. */
  maxNewArticles?: number;
  archiveFn: ArchiveFn;
  models: {
    extract: string;
    verify: string;
    copy: string;
  };
}

export interface PipelineResult {
  promises: PipelinePromise[];
  needsReview: NeedsReviewEntry[];
  errors: Array<{ url: string; error: string }>;
  dataHash: string;
  changelogEntry: ChangelogEntry;
}

export interface DryRunResult {
  runId: string;
  timestamp: string;
  fetchStats: Map<string, number>;
  totalFetched: number;
  afterDedup: number;
  afterMinChars: number;
  errors: Array<{ url: string; error: string }>;
}

interface ProcessedCandidate {
  candidate: import("./gates.ts").ExtractionCandidate;
  article: NormalizedArticle;
  verifyResult: VerifyResult;
  cost: import("./cost.ts").CostEstimate;
  quip: string;
  archiveUrl: string | null;
  extractModel: string;
  verifyModel: string;
}

export async function runPipeline(
  ctx: PipelineContext,
): Promise<PipelineResult> {
  const articles = await ctx.articleSource.fetch();
  articles.sort((a, b) => a.url.localeCompare(b.url));

  const seenPath = `${ctx.dataDir}/seen.json`;
  const existingSeen = loadSeen(seenPath);
  const { newArticles } = dedup(articles, existingSeen);

  // Kapa PROCESS-budgeten på nya artiklar (inte på hämtade). URL-sortering ovan
  // ger data.riksdagen.se först → motioner/anföranden prioriteras. Endast de
  // faktiskt bearbetade markeras som sedda, så överskottet tas nästa körning.
  const toProcess =
    ctx.maxNewArticles && ctx.maxNewArticles > 0
      ? newArticles.slice(0, ctx.maxNewArticles)
      : newArticles;
  // seen byggs EFTER loopen (nedan) så att failade artiklar inte markeras sedda.

  const reviewItems: NeedsReviewEntry[] = [];
  const processedCandidates: ProcessedCandidate[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  // Befintliga löften laddas i förväg — för dublettkoll mot redan publicerade.
  let existingPromises: PipelinePromise[] = [];
  try {
    existingPromises = JSON.parse(
      readFileSync(`${ctx.dataDir}/promises.json`, "utf8"),
    ) as PipelinePromise[];
  } catch {
    existingPromises = [];
  }
  const dedupPool: ExistingPromiseLite[] = existingPromises.map((p) => ({
    id: p.id,
    title: p.title,
    parties: p.parties,
    category: p.category,
    group_id: p.group_id,
  }));

  for (const article of toProcess) {
    try {
      const candidates = await extractFromArticle(
        article,
        ctx.llm,
        ctx.models.extract,
      );

      const gateReport = runGates(article, candidates, {
        allowlist: ctx.allowlist,
        now: ctx.now,
      });

      for (const r of gateReport.review) {
        reviewItems.push({
          candidate: r.candidate,
          failures: r.failures,
          articleUrl: article.url,
          articleTitle: article.title,
        });
      }

      for (const accepted of gateReport.accepted) {
        const verifyResult = await verifyCandidate(
          accepted,
          article,
          ctx.llm,
          ctx.models.verify,
        );

        if (
          !verifyResult.is_promise ||
          verifyResult.verdict === "reject"
        ) {
          reviewItems.push({
            candidate: accepted,
            failures: [],
            articleUrl: article.url,
            articleTitle: article.title,
            verifyReason: verifyResult.reason,
          });
          continue;
        }

        if (verifyResult.verdict === "review") {
          reviewItems.push({
            candidate: accepted,
            failures: [],
            articleUrl: article.url,
            articleTitle: article.title,
            verifyReason: verifyResult.reason,
          });
          continue;
        }

        // Dublettkoll: troligen samma löfte som ett redan publicerat — eller ett
        // tidigare i samma körning? → till review för manuell länkning (delad group_id).
        const dup = findPossibleDuplicate(
          { title: accepted.title, parties: accepted.parties, category: accepted.category },
          dedupPool,
        );
        if (dup) {
          reviewItems.push({
            candidate: accepted,
            failures: [],
            articleUrl: article.url,
            articleTitle: article.title,
            duplicateOf: dup.id,
          });
          continue;
        }
        dedupPool.push({
          id: "(denna körning)",
          title: accepted.title,
          parties: accepted.parties,
          category: accepted.category,
          group_id: null,
        });

        const cost = await estimateCost(accepted, ctx.llm, ctx.models.extract);
        // Hybrid (§8, ägarbeslut): LLM-estimat går ALLTID till review så människan
        // bekräftar/justerar beloppet; även låg confidence. Kostnaden bärs med.
        if (cost.basis === "llm_estimat" || cost.confidence < 0.6) {
          reviewItems.push({
            candidate: accepted,
            failures: [],
            articleUrl: article.url,
            articleTitle: article.title,
            cost,
            costReason:
              cost.basis === "llm_estimat"
                ? `LLM-estimat (confidence ${cost.confidence}) — bekräfta/justera belopp`
                : `Låg kostnadssäkerhet: ${cost.confidence}`,
          });
          continue;
        }

        const archiveResult = await ctx.archiveFn(article.url);

        const quip = await generateQuip(
          accepted.title,
          `${cost.msek_base} msek`,
          ctx.llm,
          ctx.models.copy,
        );

        processedCandidates.push({
          candidate: accepted,
          article,
          verifyResult,
          cost,
          quip,
          archiveUrl: archiveResult.archive_url,
          extractModel: ctx.models.extract,
          verifyModel: ctx.models.verify,
        });
      }
    } catch (e) {
      errors.push({
        url: article.url,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (ctx.mode === "review") {
    for (const pc of processedCandidates.splice(0)) {
      reviewItems.push({
        candidate: pc.candidate,
        failures: [],
        articleUrl: pc.article.url,
        articleTitle: pc.article.title,
        cost: pc.cost,
        verifyReason: "PIPELINE_MODE=review: all items to review",
      });
    }
  }

  // Markera SEDDA endast artiklar som inte kastade fel — failade (rate limit/timeout)
  // lämnas osedda och provas om nästa körning. Inget partiellt resultat slängs:
  // de artiklar som lyckades publiceras/granskas; resten retas.
  const erroredUrls = new Set(errors.map((e) => e.url));
  const updatedSeen = new Map(existingSeen);
  for (const a of toProcess) {
    if (!erroredUrls.has(a.url)) updatedSeen.set(sha256(a.url), a.url);
  }

  const publishResult = publish({
    processedCandidates,
    reviewItems,
    existingPromises,
    runId: ctx.runId,
    now: ctx.now,
    outputDir: ctx.outputDir,
  });

  const seenObj: Record<string, string> = {};
  for (const [k, v] of updatedSeen) {
    seenObj[k] = v;
  }
  writeFileSync(`${ctx.outputDir}/seen.json`, JSON.stringify(seenObj, null, 2) + "\n");

  // Veckans fläsk (A4, §7 steg 7): generera/uppdatera krönikan för aktuell
  // ISO-vecka ur veckans nya löften. Best-effort — fel fäller aldrig körningen.
  try {
    const existingChronicles: ChronicleEntry[] = (() => {
      try {
        return JSON.parse(readFileSync(`${ctx.outputDir}/chronicles.json`, "utf8")) as ChronicleEntry[];
      } catch {
        return [];
      }
    })();
    const fullChangelog = JSON.parse(
      readFileSync(`${ctx.outputDir}/changelog.json`, "utf8"),
    ) as ChangelogEntry[];
    const { chronicles, generated } = await maybeGenerateWeekly({
      now: ctx.now,
      allPromises: publishResult.promises,
      changelog: fullChangelog,
      existing: existingChronicles,
      llm: ctx.llm,
      copyModel: ctx.models.copy,
      runId: ctx.runId,
    });
    if (generated) {
      writeFileSync(`${ctx.outputDir}/chronicles.json`, JSON.stringify(chronicles, null, 2) + "\n");
      console.log(`Veckans fläsk: genererade krönika ${generated.slug} (${generated.promise_ids.length} löften).`);
    }
  } catch (e) {
    console.warn("Veckokrönika hoppades över:", e instanceof Error ? e.message : e);
  }

  writeRunReport(ctx, {
    processed: publishResult.promises.length,
    review: publishResult.needsReview.length,
    errors: errors.length,
    dataHash: publishResult.dataHash,
  });

  return {
    promises: publishResult.promises,
    needsReview: publishResult.needsReview,
    errors,
    dataHash: publishResult.dataHash,
    changelogEntry: publishResult.changelogEntry,
  };
}

/* ──────────────────────── Dry-run (endast fetch+dedup) ── */

export async function runDryRunFetch(
  articleSource: ArticleSource,
  dataDir: string,
): Promise<DryRunResult> {
  const runId = `dry-run-${new Date().toISOString().slice(0, 16)}`;
  const timestamp = new Date().toISOString();

  const articles = await articleSource.fetch();
  const totalFetched = articles.length;

  const seenPath = resolve(dataDir, "seen.json");
  const existingSeen = loadSeen(seenPath);
  const { newArticles } = dedup(articles, existingSeen);

  const afterDedup = newArticles.length;
  const afterMinChars = newArticles.filter((a) => a.text.length >= 400).length;

  const stats = new Map<string, number>();
  if ("getStats" in articleSource && typeof (articleSource as { getStats?: () => Map<string, number> }).getStats === "function") {
    const sourceStats = (articleSource as { getStats: () => Map<string, number> }).getStats();
    for (const [k, v] of sourceStats) stats.set(k, v);
  }

  const result: DryRunResult = {
    runId,
    timestamp,
    fetchStats: stats,
    totalFetched,
    afterDedup,
    afterMinChars,
    errors: [],
  };

  const reportDir = resolve(dataDir, "../.report");
  try {
    mkdirSync(reportDir, { recursive: true });
    const statsObj: Record<string, number> = {};
    for (const [k, v] of stats) statsObj[k] = v;
    writeFileSync(
      `${reportDir}/${runId}.json`,
      JSON.stringify({
        ...result,
        fetchStats: statsObj,
      }, null, 2) + "\n",
    );
  } catch {
    // best-effort
  }

  console.log("\n=== DRY-RUN FETCH-RAPPORT ===");
  console.log(`Körning: ${runId}`);
  console.log(`Tidpunkt: ${timestamp}`);
  console.log(`\nArtiklar per källa:`);
  for (const [source, count] of stats) {
    console.log(`  ${source}: ${count}`);
  }
  console.log(`\nTotalt hämtade: ${totalFetched}`);
  console.log(`Efter dedup: ${afterDedup}`);
  console.log(`Efter min_chars-filtrering (≥400): ${afterMinChars}`);
  console.log(`\nInga LLM-steg körda. Ingen data commit.`);
  console.log("========================================\n");

  return result;
}

function writeRunReport(
  ctx: PipelineContext,
  stats: { processed: number; review: number; errors: number; dataHash: string | null },
): void {
  const reportDir = `${ctx.outputDir}/../.report`;
  try {
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(
      `${reportDir}/${ctx.runId}.json`,
      JSON.stringify(
        {
          run_id: ctx.runId,
          timestamp: ctx.now.toISOString(),
          ...stats,
        },
        null,
        2,
      ) + "\n",
    );
  } catch {
    // Report writing is best-effort
  }
}
