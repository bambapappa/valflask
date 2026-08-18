import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { LlmClient } from "./llm.ts";
import type { ArticleSource, SourceConfig, SourceFeed } from "./fetch.ts";
import { dedup, loadSeen, seenKey } from "./fetch.ts";
import { laststTal, ordnaEfterTackning } from "./skordeordning.ts";
import { extractFromArticle } from "./extract.ts";
import { runGates, type NormalizedArticle } from "./gates.ts";
import { verifyCandidate, type VerifyResult } from "./verify.ts";
import type { ArchiveFn } from "./archive.ts";
import { estimateCost, costDeviation } from "./cost.ts";
import { findQuoteDuplicate, findPossibleDuplicate, findCrossPartyDuplicate, findPolicyDuplicate, findComparableCosts, looksLikeUmbrella, findSamePartyInCategory, type ExistingPromiseLite, type ComparablePromiseLite } from "./similarity.ts";
import { maybeGenerateWeekly, type ChronicleEntry } from "./chronicle.ts";
import {
  publish,
  type PipelinePromise,
  type NeedsReviewEntry,
  type ChangelogEntry,
} from "./publish.ts";
import {
  extractStancesFromArticle,
  publishStances,
  runStanceGates,
  verifyStance,
  type ProcessedStance,
  type StanceGateFailure,
  type StanceReviewEntry,
} from "./stance-pipeline.ts";
import type { IssuesFile, StanceCell } from "./stances.ts";

export interface PipelineContext {
  now: Date;
  runId: string;
  llm: LlmClient;
  articleSource: ArticleSource;
  outputDir: string;
  dataDir: string;
  allowlist: readonly string[];
  /** Partiernas egna domäner — styr det lägre citatgolvet i G3. */
  partiDomaner?: readonly string[];
  mode: "auto" | "review";
  /** Max antal NYA (osedda) artiklar att bearbeta per körning. Odefinierat = alla. */
  maxNewArticles?: number;
  archiveFn: ArchiveFn;
  models: {
    extract: string;
    verify: string;
    copy: string;
  };
  /**
   * Frågevågen (SPEC-FRAGEVAGEN §5): ståndpunktspasset körs ENDAST när
   * detta är true (env STANCES_ENABLED). Default av — hård grind tills
   * en människa verifierat delfrågor och källor (mänskligt beslut 2026-07-11).
   */
  stancesEnabled?: boolean;
  /** Frågevågens egen mode-ratt (STANCES_MODE). Default "review" — löftesflödets
   *  PIPELINE_MODE styr ALDRIG ståndpunktspublicering. */
  stancesMode?: "auto" | "review" | undefined;
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
  // Processprioritet inom budgeten: (1) page och index — partiernas egna
  // skrivna manifest och deras nyheter är projektets primärkälla och ger bara
  // artiklar när innehåll är nytt/ändrat, så de får aldrig svältas ut av
  // flödesbrus. `index` ligger här av samma skäl som `page`, och för att de
  // partier som saknar flöde helt (S och C) annars aldrig hinner med;
  // (2) riksdagen (motioner/anföranden); (3) övriga. URL-sortering inom varje
  // grupp ger determinism.
  const prio = (a: NormalizedArticle): number =>
    a.feedType === "page" || a.feedType === "index" || a.feedType === "sitemap"
      ? 0
      : a.domain === "data.riksdagen.se"
        ? 1
        : 2;

  const seenPath = `${ctx.dataDir}/seen.json`;
  const existingSeen = loadSeen(seenPath);
  const { newArticles: oordnade } = dedup(articles, existingSeen);

  // Inom prioritetsgrupperna: det parti vi läst minst på går först. Sorteras
  // det på adress i stället — som det gjorde till 2026-08-17 — vinner
  // kristdemokraterna.se alfabetiskt över moderaterna.se, sd.se och allt på
  // www., och ett parti med en stor katalog äter hela budgeten varje körning
  // tills katalogen är slut. Se skordeordning.ts för vad det kostade.
  //
  // Ordnas EFTER dedup: rangen ska räknas på de sidor vi faktiskt ska
  // behandla, inte på allt som hämtades och redan var sett.
  const newArticles = ordnaEfterTackning(
    oordnade,
    (a) => a.url,
    prio,
    laststTal(existingSeen),
  );

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
    quote: p.quote,
  }));
  // Riktmärken för kostnadsankring: befintliga löften med sitt belopp, så ett
  // nytt LLM-estimat hamnar i samma storleksordning som liknande politik.
  const comparablePool: ComparablePromiseLite[] = existingPromises.map((p) => ({
    id: p.id,
    title: p.title,
    parties: p.parties,
    category: p.category,
    group_id: p.group_id,
    msek_base: p.cost.msek_base,
    period: p.cost.period,
    basis: p.cost.basis,
    status: p.status,
  }));

  // ── Frågevågen: ladda taxonomi + celler EN gång (passet delar artikelloopen,
  // annars hade seen.json redan markerat artiklarna som behandlade).
  let issuesFile: IssuesFile | null = null;
  let stanceCells: StanceCell[] = [];
  const processedStances: ProcessedStance[] = [];
  const stanceGateReview: Array<{ candidate: unknown; failures: StanceGateFailure[]; article: NormalizedArticle }> = [];
  if (ctx.stancesEnabled) {
    try {
      issuesFile = JSON.parse(readFileSync(`${ctx.dataDir}/issues.json`, "utf8")) as IssuesFile;
      stanceCells = JSON.parse(readFileSync(`${ctx.dataDir}/stances.json`, "utf8")) as StanceCell[];
    } catch (e) {
      console.error(`[stances] kunde inte ladda issues/stances — passet hoppas över: ${e instanceof Error ? e.message : String(e)}`);
      issuesFile = null;
    }
  }

  for (const article of toProcess) {
    try {
      const candidates = await extractFromArticle(
        article,
        ctx.llm,
        ctx.models.extract,
      );

      const gateReport = runGates(article, candidates, {
        allowlist: ctx.allowlist,
        partiDomaner: ctx.partiDomaner ?? [],
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
        // Tvärparti-varianten fångar SAMMA POLITIK hos annat parti (5 % av BNP går
        // bara att göra en gång) — även den till review med --group-förslag, så
        // totalen/koalitioner inte dubbelräknar när M/SD/KD släpper sina manifest.
        // Citatkollen går FÖRST och är den enda som är exakt: samma citat är
        // samma yttrande, oavsett vilken titel utvinningen råkade sätta.
        // Titelkollarna nedan är heuristiker och missar just omskördar.
        const dupKey = { title: accepted.title, parties: accepted.parties, category: accepted.category };
        // Politikkollen sist av dubblettkollarna: den letar inte efter samma
        // text utan efter samma uppgift — samma tal eller samma uttryck hos
        // samma parti, oavsett kategori. Kön 2026-08-13 gav noll på de tre
        // ovan och bar ändå fyra dubbletter; den dyraste vägde 12 000 mkr.
        const politikDup = findPolicyDuplicate(accepted, dedupPool);
        const dup =
          findQuoteDuplicate(accepted, dedupPool) ??
          findPossibleDuplicate(dupKey, dedupPool) ??
          findCrossPartyDuplicate(dupKey, dedupPool) ??
          politikDup?.match ??
          null;
        if (dup) {
          reviewItems.push({
            candidate: accepted,
            failures: [],
            articleUrl: article.url,
            articleTitle: article.title,
            duplicateOf: dup.id,
            // Skälet skrivs ut bara för politikkollen: de andra tre säger sig
            // själva (samma citat, samma titel), medan den här har läst något
            // som inte syns när man lägger de två löftena bredvid varandra.
            ...(politikDup && dup.id === politikDup.match.id
              ? { duplicateReason: politikDup.reason }
              : {}),
          });
          continue;
        }
        dedupPool.push({
          id: "(denna körning)",
          title: accepted.title,
          parties: accepted.parties,
          category: accepted.category,
          group_id: null,
          quote: accepted.quote,
        });

        // Kostnadsankring: hämta jämförbara publicerade löften (samma politik hos
        // andra partier m.m.) så estimatet hamnar i samma storleksordning, och så
        // granskaren ser riktmärkena i review-raden.
        const comparables = findComparableCosts(
          { title: accepted.title, category: accepted.category },
          comparablePool,
        );
        const cost = await estimateCost(accepted, ctx.llm, ctx.models.extract, comparables);
        // ALLT går till granskningskön. Ingen kandidat publiceras av en körning.
        //
        // Mänskligt beslut 2026-08-18, som ersätter hybrid-routningen från
        // 2026-06-24. Den lät löften med uttryckligt belopp i källtexten
        // publiceras utan mänskligt godkännande, och tjugo löften nådde sajten
        // den vägen. Sju av dem kom i en enda körning natten till 18 augusti;
        // sex höll inte, och ett bar 38,77 procent av rikssumman på ett citat
        // som var en menylänk.
        //
        // Skälet att ta bort vägen är inte bara de sju. Metodsidan lovar
        // läsaren att «inget nytt löfte och inget belopp når sajten utan att en
        // människa släppt igenom det» och att «maskinen får föreslå, inte
        // publicera». Den meningen var inte sann så länge den här grenen fanns.
        // Nu är den det, och prosans ankare `metod-sparren-granskningskon`
        // mäter den mot den här filen.
        //
        // Bieffekt värd att veta: varningarna nedan — avvikelse mot jämförbara
        // och bred uppräkning — räknades förut BARA för LLM-estimat. De löften
        // som gick förbi kön fick dem alltså aldrig, fast det var just de som
        // ingen människa läste. Nu får varje kö-post dem.
        {
          const comparablesNote =
            comparables.length > 0
              ? ` — jämförbara: ${comparables.map((c) => `${c.id} (${c.msek_base})`).join(", ")}`
              : "";
          const deviation = costDeviation(cost.msek_base, comparables);
          const deviationNote = deviation ? ` ⚠ AVVIKER: ${deviation.message}` : "";
          // Bred uppräkning ("stärk X, Y och Z") är den vanligaste källan till
          // dubbelräkning: delarna är ofta redan prissatta på partiets egna
          // löften. Vi listar dem så granskaren kan kontrollera överlapp — och
          // sätter aldrig beloppet automatiskt.
          const umbrellaNote =
            looksLikeUmbrella(accepted.title, accepted.quote) && cost.msek_base > 0
              ? (() => {
                  const own = findSamePartyInCategory(accepted, comparablePool);
                  const list = own.map((c) => `${c.id} (${c.msek_base})`).join(", ");
                  return (
                    ` ⚠ BRED UPPRÄKNING: ser ut som en sammanfattning av flera åtaganden` +
                    ` — kontrollera överlapp mot partiets egna löften` +
                    (list ? ` i samma kategori: ${list}` : "") +
                    `. Är delarna redan prissatta ska detta löfte sättas till 0.`
                  );
                })()
              : "";
          reviewItems.push({
            candidate: accepted,
            failures: [],
            articleUrl: article.url,
            articleTitle: article.title,
            cost,
            costReason:
              (cost.basis === "llm_estimat"
                ? `LLM-estimat (confidence ${cost.confidence}) — bekräfta/justera belopp`
                : cost.confidence < 0.6
                  ? `Låg kostnadssäkerhet: ${cost.confidence}`
                  : `Belopp ur källtexten (${cost.basis}) — bekräfta belopp och period`) +
              comparablesNote + deviationNote + umbrellaNote,
          });
          continue;
        }
      }

      // ── Frågevågen-passet (§5): samma artikel, egen grindkedja, egen kö.
      if (issuesFile) {
        const stanceCandidates = await extractStancesFromArticle(
          article,
          issuesFile,
          ctx.llm,
          ctx.models.extract,
        );
        const stanceReport = runStanceGates(article, stanceCandidates, {
          allowlist: ctx.allowlist,
          issuesFile,
          now: ctx.now,
        });
        for (const r of stanceReport.review) {
          stanceGateReview.push({ ...r, article });
        }
        for (const accepted of stanceReport.accepted) {
          const sq = issuesFile.issues
            .flatMap((i) => i.subquestions)
            .find((x) => x.id === accepted.subquestion_id);
          const verify = await verifyStance(
            accepted,
            sq?.text ?? "",
            article,
            ctx.llm,
            ctx.models.verify,
            sq?.fairness_note,
          );
          const archiveResult = await ctx.archiveFn(article.url);
          processedStances.push({
            candidate: accepted,
            article,
            verify,
            archiveUrl: archiveResult.archive_url,
            extractModel: ctx.models.extract,
            verifyModel: ctx.models.verify,
          });
        }
      }
    } catch (e) {
      errors.push({
        url: article.url,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // `PIPELINE_MODE=review` var vägen att stänga av autopubliceringen för en
  // körning. Sedan 2026-08-18 finns ingen autopublicering att stänga av —
  // varje kandidat går till kön ovan — så listan är alltid tom här. Ratten
  // ligger kvar därför att `mode` fortfarande styr Frågevågens flöde.
  if (processedCandidates.length > 0) {
    throw new Error(
      "Pipelinen fyllde processedCandidates. Ingen körning får publicera ett " +
        "löfte utan mänskligt godkännande — se metodsidans spärr och beslutet " +
        "2026-08-18. Kandidater ska läggas i reviewItems.",
    );
  }

  // Markera SEDDA endast artiklar som inte kastade fel — failade (rate limit/timeout)
  // lämnas osedda och provas om nästa körning. Inget partiellt resultat slängs:
  // de artiklar som lyckades publiceras/granskas; resten retas.
  const erroredUrls = new Set(errors.map((e) => e.url));
  const updatedSeen = new Map(existingSeen);
  for (const a of toProcess) {
    if (!erroredUrls.has(a.url)) updatedSeen.set(seenKey(a), a.url);
  }

  // ── Frågevågen: publicera ståndpunkter FÖRE publish() så att körningens
  // changelog-post bär stances_added/stances_changed.
  let stanceSummary: { added: string[]; changed: string[] } | undefined;
  if (issuesFile) {
    const existingStanceReview: StanceReviewEntry[] = (() => {
      try {
        return JSON.parse(readFileSync(`${ctx.outputDir}/stances_review.json`, "utf8")) as StanceReviewEntry[];
      } catch {
        return [];
      }
    })();
    const stanceResult = publishStances({
      processed: processedStances,
      gateReview: stanceGateReview,
      issuesFile,
      cells: stanceCells,
      existingReview: existingStanceReview,
      runId: ctx.runId,
      now: ctx.now,
      mode: ctx.stancesMode ?? "review",
    });
    writeFileSync(`${ctx.outputDir}/stances.json`, JSON.stringify(stanceResult.cells, null, 2) + "\n");
    writeFileSync(`${ctx.outputDir}/stances_review.json`, JSON.stringify(stanceResult.review, null, 2) + "\n");
    stanceSummary = { added: stanceResult.stancesAdded, changed: stanceResult.stancesChanged };
    console.error(
      `[stances] publicerade=${stanceResult.stancesAdded.length} ändringar=${stanceResult.stancesChanged.length} review=${stanceResult.review.length - existingStanceReview.length} (nya) omskördar=${stanceResult.stancesOmskordade.length}`,
    );
    // Bortsorterade omskördar namnges, aldrig bara räknas: en tyst
    // bortsortering är osynlig i kön och därför omöjlig att ifrågasätta.
    for (const rad of stanceResult.stancesOmskordade) console.error(`[stances] omskörd: ${rad}`);
  }

  const publishResult = publish({
    processedCandidates,
    reviewItems,
    existingPromises,
    runId: ctx.runId,
    now: ctx.now,
    outputDir: ctx.outputDir,
    stanceSummary,
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
    // Reformbudgeten (per år, ur constants.json) × 4 = mandatperiodens utrymme —
    // samma tal som startsidans "Att satsa", så krönikans gap matchar hjältegrafiken.
    const constants = JSON.parse(readFileSync(`${ctx.outputDir}/constants.json`, "utf8")) as {
      reformutrymme_msek_per_ar?: { value?: number };
    };
    const reformBudgetMsek = (constants.reformutrymme_msek_per_ar?.value ?? 0) * 4;
    const { chronicles, generated } = await maybeGenerateWeekly({
      now: ctx.now,
      allPromises: publishResult.promises,
      changelog: fullChangelog,
      existing: existingChronicles,
      llm: ctx.llm,
      copyModel: ctx.models.copy,
      runId: ctx.runId,
      reformBudgetMsek,
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
