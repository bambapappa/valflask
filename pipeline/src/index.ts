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
import { generateQuip } from "./copy.ts";
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
  const { newArticles, seen: updatedSeen } = dedup(articles, existingSeen);

  const reviewItems: NeedsReviewEntry[] = [];
  const processedCandidates: ProcessedCandidate[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  for (const article of newArticles) {
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

        const cost = estimateCost(accepted);
        if (cost.confidence < 0.6) {
          reviewItems.push({
            candidate: accepted,
            failures: [],
            articleUrl: article.url,
            articleTitle: article.title,
            costReason: `Low confidence: ${cost.confidence}`,
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
        verifyReason: "PIPELINE_MODE=review: all items to review",
      });
    }
  }

  const errorRate = newArticles.length > 0
    ? errors.length / newArticles.length
    : 0;

  if (errorRate >= 0.5 && newArticles.length > 0) {
    writeRunReport(ctx, { processed: 0, review: reviewItems.length, errors: errors.length, dataHash: null });
    const result: PipelineResult = {
      promises: [],
      needsReview: reviewItems,
      errors,
      dataHash: "",
      changelogEntry: {
        run_id: ctx.runId,
        added: [],
        updated: [],
        retracted: [],
        data_hash: "",
        timestamp: ctx.now.toISOString(),
      },
    };
    return result;
  }

  let existingPromises: PipelinePromise[] = [];
  try {
    existingPromises = JSON.parse(
      readFileSync(`${ctx.dataDir}/promises.json`, "utf8"),
    ) as PipelinePromise[];
  } catch {
    existingPromises = [];
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
