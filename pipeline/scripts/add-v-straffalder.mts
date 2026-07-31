/**
 * Engångspublicering (ägarbeslut 2026-07-15): V:s besked om straffmyndighets-
 * åldern. Den köade V-posten (HD024230) föll på G3 — enda meningen där V
 * uttryckte sin egen hållning bar en fotnotsmarkör "[2]". Ägaren bad om ett
 * renare citat; V:s motion mot just prop. 2025/26:293 (HD024211, 2026-07-07)
 * innehåller en ordagrann, fotnotsfri mening som direkt bemöter 14-års-
 * förslaget.
 *
 * Skriptet tar INGEN genväg förbi verbatimkedjan: det hämtar källan, kör
 * kandidaten genom de RIKTIGA grindarna (runStanceGates — G2/G3/G6/G7 mot
 * källtexten) och publicerar bara om de passerar, via publishStances med
 * humanApproved (människan går i god för att beskedet följer ur citatet).
 * RS-validerar före skrivning.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runStanceGates, publishStances, type StanceCandidate } from "../src/stance-pipeline.ts";
import { validateStanceInvariants, type IssuesFile, type StanceCell } from "../src/stances.ts";
import type { NormalizedArticle } from "../src/gates.ts";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(import.meta.dirname, "../../");
const DATA = join(ROOT, "data");
const UA = "DrygastBot/1.0 (+https://drygast.nu/om)";

const SOURCE_URL = "https://data.riksdagen.se/dokument/HD024211";
const PUBLISHED = "2026-07-07T00:00:00Z";
const QUOTE =
  "Riksdagen bör avslå regeringens förslag i de delar det avser en sänkning av straffbarhetsåldern till 14 år.";

const candidate: StanceCandidate = {
  subquestion_id: "sq-lag-straffalder",
  party: "v",
  position: "nej",
  condition_note: null,
  quote: QUOTE,
  person: null,
};

// Källtext i samma form som pipelinen ser den (HTML strippas till text).
const html = await (await fetch(SOURCE_URL, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) })).text();
const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;|&#\d+;/gi, " ").replace(/\s+/g, " ").trim();

const article: NormalizedArticle = {
  url: SOURCE_URL,
  domain: "data.riksdagen.se",
  title: "Motion 2025/26:4211 av Gudrun Nordborg m.fl. (V) — med anledning av prop. 2025/26:293",
  text,
  published: PUBLISHED,
};

// Allowlist ur sources.yaml (samma källa som pipelinen).
const sources = parseYaml(readFileSync(join(DATA, "sources.yaml"), "utf8")) as { allowlist_domains: string[] };
const allowlist = sources.allowlist_domains;
const issuesFile = JSON.parse(readFileSync(join(DATA, "issues.json"), "utf8")) as IssuesFile;
const cells = JSON.parse(readFileSync(join(DATA, "stances.json"), "utf8")) as StanceCell[];
const now = new Date();

// De RIKTIGA grindarna mot den RIKTIGA källtexten (G2/G3/G6/G7).
const report = runStanceGates(article, [candidate], { allowlist, issuesFile, now });
if (report.accepted.length !== 1) {
  console.error("Kandidaten passerade INTE grindarna — inget publiceras:");
  for (const r of report.review) console.error("  ", JSON.stringify(r.failures));
  process.exit(1);
}
console.log("✓ Grindar (G2/G3/G6/G7) passerade — citatet står ordagrant i källan.");

const result = publishStances({
  processed: [{
    candidate,
    article,
    verify: { quote_on_topic: true, position_follows_from_quote_alone: true, party_correct: true, verdict: "publish", reason: "mänskligt godkänd: renare citat ur V:s motion HD024211 (ägarbeslut 2026-07-15)" },
    archiveUrl: null,
    extractModel: "manuell (renare källa)",
    verifyModel: "mänsklig granskning",
  }],
  gateReview: [],
  issuesFile,
  cells,
  existingReview: [],
  runId: "manual-v-straffalder-2026-07-15",
  now,
  mode: "auto",
  humanApproved: true,
});

if (result.stancesAdded.length === 0) {
  console.error("Inget publicerades (dublett?).");
  process.exit(1);
}
const rsErrors = validateStanceInvariants(issuesFile, result.cells);
if (rsErrors.length > 0) {
  console.error(`RS-brott — INGET skrivs:\n  ${rsErrors.join("\n  ")}`);
  process.exit(1);
}
writeFileSync(join(DATA, "stances.json"), JSON.stringify(result.cells, null, 2) + "\n");
console.log(`Publicerad: ${result.stancesAdded.join(", ")} (V · sq-lag-straffalder · nej). Kör source-page-fix för arkiv.`);
