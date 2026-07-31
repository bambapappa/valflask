/**
 * Frågevågen — engångs-backfill av ståndpunkter ur partiernas politiksidor
 * och manifest (page-källorna i sources.yaml).
 *
 * Isoleringskontrakt (testas i stance-backfill.test.ts):
 *  - Läser och skriver ALDRIG seen.json — ordinarie dedup förblir orörd och
 *    löftesflödet påverkas inte.
 *  - Rör aldrig promises.json eller needs_review.json.
 *  - Skriver endast stances.json (last_searched) och stances_review.json.
 *  - Publicerar ALDRIG: mode är hårdkodat "review" — allt går till kön,
 *    oavsett STANCES_MODE. Backfill är underlag för mänsklig granskning
 *    (steg 2–3 i ops/FRAGEVAGEN-LANSERING.md), aldrig en publiceringsväg.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LlmClient } from "./llm.ts";
import type { ArticleSource } from "./fetch.ts";
import type { ArchiveFn } from "./archive.ts";
import type { NormalizedArticle } from "./gates.ts";
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

export interface StanceBackfillContext {
  now: Date;
  runId: string;
  llm: LlmClient;
  articleSource: ArticleSource;
  dataDir: string;
  outputDir: string;
  allowlist: readonly string[];
  archiveFn: ArchiveFn;
  models: { extract: string; verify: string };
  /** Tak på antal artiklar/chunkar att processa (PDF:er chunkas). Default 80. */
  maxArticles?: number;
  /** true = rapportera enbart, skriv inga filer. */
  dryRun?: boolean;
}

export interface StanceBackfillResult {
  articles: number;
  candidates: number;
  acceptedByGates: number;
  queuedNew: number;
  errors: Array<{ url: string; error: string }>;
}

export async function runStanceBackfill(ctx: StanceBackfillContext): Promise<StanceBackfillResult> {
  const issuesFile = JSON.parse(readFileSync(join(ctx.dataDir, "issues.json"), "utf8")) as IssuesFile;
  const cells = JSON.parse(readFileSync(join(ctx.dataDir, "stances.json"), "utf8")) as StanceCell[];
  const existingReview = JSON.parse(
    readFileSync(join(ctx.dataDir, "stances_review.json"), "utf8"),
  ) as StanceReviewEntry[];

  const fetched = await ctx.articleSource.fetch();
  // Deterministisk ordning + budgettak (PDF:er chunkas till flera artiklar).
  fetched.sort((a, b) => a.url.localeCompare(b.url));
  const articles = fetched.slice(0, ctx.maxArticles ?? 80);

  const processed: ProcessedStance[] = [];
  const gateReview: Array<{ candidate: unknown; failures: StanceGateFailure[]; article: NormalizedArticle }> = [];
  const errors: StanceBackfillResult["errors"] = [];
  let candidateCount = 0;

  const subquestionText = new Map(
    issuesFile.issues.flatMap((i) => i.subquestions.map((sq) => [sq.id, sq.text] as const)),
  );

  for (const article of articles) {
    try {
      const candidates = await extractStancesFromArticle(article, issuesFile, ctx.llm, ctx.models.extract);
      candidateCount += candidates.length;
      const report = runStanceGates(article, candidates, {
        allowlist: ctx.allowlist,
        issuesFile,
        now: ctx.now,
      });
      for (const r of report.review) gateReview.push({ ...r, article });
      for (const accepted of report.accepted) {
        const verify = await verifyStance(
          accepted,
          subquestionText.get(accepted.subquestion_id) ?? "",
          article,
          ctx.llm,
          ctx.models.verify,
        );
        const archiveResult = await ctx.archiveFn(article.url);
        processed.push({
          candidate: accepted,
          article,
          verify,
          archiveUrl: archiveResult.archive_url,
          extractModel: ctx.models.extract,
          verifyModel: ctx.models.verify,
        });
      }
    } catch (e) {
      errors.push({ url: article.url, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const result = publishStances({
    processed,
    gateReview,
    issuesFile,
    cells,
    existingReview,
    runId: ctx.runId,
    now: ctx.now,
    mode: "review", // hårdkodat — backfill publicerar aldrig
  });

  if (result.stancesAdded.length > 0) {
    // Försvar på djupet: kan inte hända med mode "review", men skriv hellre
    // ingenting än publicerade besked ur en backfill.
    throw new Error(
      `Backfill försökte publicera ${result.stancesAdded.length} statements — avbrutet utan skrivning.`,
    );
  }

  if (!ctx.dryRun) {
    writeFileSync(join(ctx.outputDir, "stances.json"), JSON.stringify(result.cells, null, 2) + "\n");
    writeFileSync(
      join(ctx.outputDir, "stances_review.json"),
      JSON.stringify(result.review, null, 2) + "\n",
    );
  }

  return {
    articles: articles.length,
    candidates: candidateCount,
    acceptedByGates: processed.length,
    queuedNew: result.review.length - existingReview.length,
    errors,
  };
}
