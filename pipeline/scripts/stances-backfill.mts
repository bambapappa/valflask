/**
 * Frågevågen — backfill av ståndpunkter ur partiernas politiksidor/manifest.
 *
 *   pnpm stances:backfill              hämta page-källor, fyll granskningskön
 *   pnpm stances:backfill --dry-run    rapportera enbart, skriv inget
 *   pnpm stances:backfill --limit 20   processa högst N artiklar/chunkar
 *
 * Kör ENBART ståndpunktskedjan mot page-källorna i sources.yaml. Rör aldrig
 * seen.json/promises.json/needs_review.json (isoleringskontraktet i
 * src/stance-backfill.ts) och publicerar aldrig — allt går till
 * data/stances_review.json för mänsklig granskning.
 *
 * Kräver samma env som pipelinen (OPENROUTER_API_KEY, MODEL_EXTRACT,
 * MODEL_VERIFY, MODEL_COPY) — körs enklast via Actions-workflown
 * stances-backfill.yml (workflow_dispatch).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { SourceConfig } from "../src/fetch.ts";
import { buildContextFromEnv } from "../src/cli-run.ts";
import { runStanceBackfill } from "../src/stance-backfill.ts";

const DATA_DIR = resolve(import.meta.dirname, "../../data");

const dryRun = process.argv.includes("--dry-run");
const limitIdx = process.argv.indexOf("--limit");
const limit = limitIdx !== -1 ? Number(process.argv[limitIdx + 1]) : undefined;
if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
  console.error("--limit kräver ett positivt heltal.");
  process.exit(1);
}

const fullConfig = parseYaml(readFileSync(resolve(DATA_DIR, "sources.yaml"), "utf8")) as SourceConfig;
const pageFeeds = fullConfig.feeds.filter((f) => f.type === "page");
if (pageFeeds.length === 0) {
  console.error("Inga page-källor i sources.yaml — inget att backfilla.");
  process.exit(1);
}

const ctx = buildContextFromEnv(process.env, {
  config: { ...fullConfig, feeds: pageFeeds },
  dataDir: DATA_DIR,
});

console.log(
  `Backfill ${ctx.runId} | ${pageFeeds.length} page-källor | extract=${ctx.models.extract} verify=${ctx.models.verify}${dryRun ? " | DRY-RUN" : ""}`,
);

const result = await runStanceBackfill({
  now: ctx.now,
  runId: `stances-backfill-${ctx.now.toISOString().slice(0, 10)}`,
  llm: ctx.llm,
  articleSource: ctx.articleSource,
  dataDir: DATA_DIR,
  outputDir: DATA_DIR,
  allowlist: ctx.allowlist,
  archiveFn: ctx.archiveFn,
  models: { extract: ctx.models.extract, verify: ctx.models.verify },
  ...(limit !== undefined ? { maxArticles: limit } : {}),
  dryRun,
});

console.log(
  `Klart: ${result.articles} artiklar/chunkar, ${result.candidates} kandidater, ` +
    `${result.acceptedByGates} genom grindarna, ${result.queuedNew} nya i granskningskön, ${result.errors.length} fel.`,
);
for (const e of result.errors) console.error(`  fel: ${e.url}: ${e.error}`);
if (!dryRun && result.queuedNew > 0) {
  console.log('Granska med "pnpm stances:review". Committa data/ med "data: stances backfill".');
}
