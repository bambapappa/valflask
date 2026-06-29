/**
 * cli-import-vallen.ts — entrypoint för seed-importen från vallen-2026.
 *
 *   pnpm import:vallen <sökväg-till-vallen-2026-checkout> [--dry-run]
 *
 * Läser DATABAS-FINAL.json + snapshots ur det privata arkivet, kör allt genom
 * importVallen (som i sin tur kör grindkedjan), och skriver resultatet via
 * publish() till data/. --dry-run skriver inget — bara statistik + totalband.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  importVallen,
  loadVallenRecords,
  loadCategoryMap,
  buildSnapshotIndex,
  buildTranscriptIndex,
} from "./import-vallen.ts";
import { publish, type PipelinePromise } from "./publish.ts";
import type { CostEstimate } from "./cost.ts";

const DATA_DIR = resolve(process.cwd(), "../data");
const REPO_ROOT = resolve(process.cwd(), "..");

function loadExistingPromises(dataDir: string): PipelinePromise[] {
  const p = resolve(dataDir, "promises.json");
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PipelinePromise[];
  } catch {
    return [];
  }
}

function loadAllowlist(dataDir: string): string[] {
  const config = parseYaml(readFileSync(resolve(dataDir, "sources.yaml"), "utf8")) as {
    allowlist_domains?: string[];
  };
  if (!config.allowlist_domains?.length) throw new Error("sources.yaml: tom allowlist_domains.");
  return config.allowlist_domains;
}

const mdkr = (m: number): string => (m / 1000).toFixed(1);

async function main(): Promise<void> {
  const vallenDir = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!vallenDir || vallenDir.startsWith("--")) {
    throw new Error("Användning: pnpm import:vallen <sökväg-till-vallen-2026> [--dry-run]");
  }
  if (!existsSync(resolve(vallenDir, "DATABAS-FINAL.json"))) {
    throw new Error(`Hittar inte DATABAS-FINAL.json i "${vallenDir}".`);
  }

  const now = new Date();
  const records = loadVallenRecords(vallenDir);
  const categoryMap = loadCategoryMap(REPO_ROOT);
  const snapshotIndex = buildSnapshotIndex(vallenDir);
  const transcriptIndex = buildTranscriptIndex(vallenDir);
  const existingPromises = loadExistingPromises(DATA_DIR);
  const allowlist = loadAllowlist(DATA_DIR);

  console.log(
    `Import vallen-2026 | poster=${records.length} | snapshots(domäner)=${snapshotIndex.size} | ` +
      `transkript(videor)=${transcriptIndex.size} | ` +
      `befintliga löften=${existingPromises.length} | ${dryRun ? "DRY-RUN" : "SKARP"}`,
  );

  const { processedCandidates, reviewItems, stats } = importVallen({
    records, categoryMap, snapshotIndex, transcriptIndex, existingPromises, allowlist, now,
  });

  console.log("\n── Statistik ──");
  console.log(`  publicerbara:       ${stats.publishable}`);
  console.log(`  till review:        ${stats.toReview}`);
  console.log(`  cross-party-grupper: ${stats.groupsLinked}`);
  console.log(`  otolkbar partikod:  ${stats.unparseableParty}`);
  console.log(`  grindfel (review):  ${JSON.stringify(stats.byGateFailure)}`);

  // Förhandsvisa totalbandet på de publicerbara (samma formel som
  // site/aggregates.totalFlasketInterval; inlinad för att hålla pipeline
  // frikopplad från sajten).
  const interval = previewInterval(processedCandidates.map((pc) => pc.cost), 0.3);
  console.log("\n── Fläsket (publicerbara, mandatperiod, ρ=0,3) ──");
  console.log(`  punktsumma: ${mdkr(interval.base)} mdkr`);
  console.log(`  80%-band:   ${mdkr(interval.low)} – ${mdkr(interval.high)} mdkr  (±${mdkr(interval.base - interval.low)})`);

  if (dryRun) {
    console.log("\nDRY-RUN: inga filer skrivna.");
    return;
  }

  const runId = `import-vallen-${now.toISOString().slice(0, 10)}`;
  const result = publish({
    processedCandidates, reviewItems, existingPromises,
    runId, now, outputDir: DATA_DIR,
  });
  console.log(
    `\nSkrivet: ${result.promises.length} löften i promises.json, ` +
      `${result.needsReview.length} i needs_review.json. data_hash=${result.dataHash.slice(0, 12)}`,
  );
}

/** Totalband-förhandsvisning (triangelvarians + ρ). Speglar site/aggregates. */
function previewInterval(
  costs: CostEstimate[],
  rho: number,
): { base: number; low: number; high: number } {
  let base = 0, sumVar = 0, sumSd = 0;
  for (const c of costs) {
    if (c.type !== "utgift" && c.type !== "intäktsminskning") continue;
    const mult = c.period === "per_ar" ? 4 : 1;
    const lo = c.msek_low * mult, ba = c.msek_base * mult, hi = c.msek_high * mult;
    base += ba;
    const v = Math.max(0, (lo * lo + ba * ba + hi * hi - lo * ba - lo * hi - ba * hi) / 18);
    sumVar += v;
    sumSd += Math.sqrt(v);
  }
  const sd = Math.sqrt(Math.max(0, (1 - rho) * sumVar + rho * sumSd * sumSd));
  return { base, low: Math.max(0, base - 1.2816 * sd), high: base + 1.2816 * sd };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("Import misslyckades:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
