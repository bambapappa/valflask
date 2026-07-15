/**
 * Engångspublicering (ägarbeslut 2026-07-15): S:s och SD:s besked där de köade
 * kandidaterna var för ospecifika/fragmentariska och ägaren bad om skarpare
 * källor.
 *
 *  - S · värnplikt: köcitatet ("fler värnpliktiga") klarade inte frågans
 *    medvetna ribba "utöver redan beslutade nivåer". S:s nyhet 2025-10-30 säger
 *    uttryckligen "2 000 fler än nuvarande mål" — skarp träff.
 *  - SD · matmoms: köcitatet var ett fragment. SD:s valplattform 2026 säger
 *    rakt ut att den nedsatta matmomsen "ska bli permanent".
 *
 * Ingen genväg förbi verbatimkedjan: varje kandidat körs genom de RIKTIGA
 * grindarna (runStanceGates — G2/G3/G6/G7 mot den hämtade källtexten; PDF får
 * exakt sidankare via publishStances) och publiceras bara om de passerar, via
 * publishStances med humanApproved. RS-validerar före skrivning.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runStanceGates, publishStances, type StanceCandidate, type ProcessedStance } from "../src/stance-pipeline.ts";
import { extractPdfText } from "../src/fetch.ts";
import { validateStanceInvariants, type IssuesFile, type StanceCell } from "../src/stances.ts";
import type { NormalizedArticle } from "../src/gates.ts";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(import.meta.dirname, "../../");
const DATA = join(ROOT, "data");
const UA = "DrygastBot/1.0 (+https://drygast.nu/om)";

interface Manual {
  candidate: StanceCandidate;
  url: string;
  domain: string;
  title: string;
  published: string;
  reason: string;
  pdf?: boolean;
}

// Batchfil (JSON-array av Manual) anges som argument. Idempotent: redan
// publicerade citat (dublett) hoppas tyst över, resten publiceras.
const batchFile = process.argv[2];
if (!batchFile) { console.error("Ange batchfil: add-stances-manual.mts <candidates.json>"); process.exit(1); }
const MANUALS: Manual[] = JSON.parse(readFileSync(batchFile, "utf8"));

const sources = parseYaml(readFileSync(join(DATA, "sources.yaml"), "utf8")) as { allowlist_domains: string[] };
const allowlist = sources.allowlist_domains;
const issuesFile = JSON.parse(readFileSync(join(DATA, "issues.json"), "utf8")) as IssuesFile;
const cells = JSON.parse(readFileSync(join(DATA, "stances.json"), "utf8")) as StanceCell[];
const now = new Date();

const processed: ProcessedStance[] = [];
for (const m of MANUALS) {
  let article: NormalizedArticle;
  if (m.pdf) {
    const bytes = new Uint8Array(await (await fetch(m.url, { headers: { "User-Agent": UA, Accept: "application/pdf" }, signal: AbortSignal.timeout(60000) })).arrayBuffer());
    const pdf = await extractPdfText(bytes);
    article = {
      url: m.url, domain: m.domain, title: m.title, published: m.published,
      text: pdf.pages.join("\n\n"),
      pdfPages: { firstPage: 1, texts: pdf.pages },
    };
  } else {
    const html = await (await fetch(m.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) })).text();
    const stripped = html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;|&#\d+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    article = { url: m.url, domain: m.domain, title: m.title, published: m.published, text: stripped };
  }

  const report = runStanceGates(article, [m.candidate], { allowlist, issuesFile, now });
  if (report.accepted.length !== 1) {
    console.error(`✗ ${m.candidate.party} ${m.candidate.subquestion_id}: grindarna fällde — inget publiceras:`);
    for (const r of report.review) console.error("   ", JSON.stringify(r.failures));
    process.exit(1);
  }
  console.log(`✓ ${m.candidate.party.toUpperCase()} ${m.candidate.subquestion_id}: G2/G3/G6/G7 passerade (citatet ordagrant i källan)`);
  processed.push({
    candidate: m.candidate,
    article,
    verify: { quote_on_topic: true, position_follows_from_quote_alone: true, party_correct: true, verdict: "publish", reason: `mänskligt godkänd — ${m.reason}` },
    archiveUrl: null,
    extractModel: "manuell (skarpare källa)",
    verifyModel: "mänsklig granskning",
  });
}

const result = publishStances({
  processed, gateReview: [], issuesFile, cells, existingReview: [],
  runId: "manual-stances-2026-07-15", now, mode: "auto", humanApproved: true,
});

console.log(`Publicerade: ${result.stancesAdded.length}/${MANUALS.length} (resten dubletter av redan registrerade citat).`);
if (result.stancesAdded.length === 0) { console.error("Inget nytt publicerades."); process.exit(1); }
const rsErrors = validateStanceInvariants(issuesFile, result.cells);
if (rsErrors.length > 0) {
  console.error(`RS-brott — INGET skrivs:\n  ${rsErrors.join("\n  ")}`);
  process.exit(1);
}
writeFileSync(join(DATA, "stances.json"), JSON.stringify(result.cells, null, 2) + "\n");
console.log(`Publicerat: ${result.stancesAdded.join(", ")}. Kör source-page-fix för exakt PDF-sida + arkiv.`);
