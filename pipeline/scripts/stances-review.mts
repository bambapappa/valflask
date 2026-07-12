/**
 * Frågevågen — review-CLI för ståndpunktskön (data/stances_review.json).
 *
 *   pnpm stances:review                    lista kön med id, grindar och citat
 *   pnpm stances:review approve <id>       godkänn → statement publiceras i cellen
 *   pnpm stances:review reject <id> [skäl] avvisa → posten tas bort (skälet loggas)
 *
 * Integritetsregler (kan inte kringgås härifrån):
 *  - Poster med hårda grindfel (G1/G2/G3/G6/G7/G8) kan ALDRIG godkännas —
 *    verbatimkedjan är inte förhandlingsbar; avvisa och invänta ny källa.
 *  - Poster på delfrågor med formulation_status "utkast" kan inte godkännas
 *    förrän delfrågan är verifierad och låst i data/issues.json (UTKAST-grinden).
 *  - Godkännande av VERIFY/RIKTNINGSBYTE/MODE-poster är själva den mänskliga
 *    granskning grindarna kräver; ändringsdetekteringen (RS5) sker mekaniskt.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  publishStances,
  type StanceCandidate,
  type StanceReviewEntry,
  type StanceVerifyResult,
} from "../src/stance-pipeline.ts";
import { validateStanceInvariants, type IssuesFile, type StanceCell } from "../src/stances.ts";

const ROOT = resolve(import.meta.dirname, "../../");
const DATA = join(ROOT, "data");

const HARD_GATES = new Set(["G1", "G2", "G3", "G6", "G7", "G8"]);

export function stanceReviewId(e: StanceReviewEntry): string {
  const c = e.candidate as Partial<StanceCandidate> | null | undefined;
  return createHash("sha256")
    .update(`${e.articleUrl}::${c?.subquestion_id ?? ""}::${c?.party ?? ""}::${c?.quote ?? ""}`)
    .digest("hex")
    .slice(0, 12);
}

const queue = JSON.parse(readFileSync(join(DATA, "stances_review.json"), "utf8")) as StanceReviewEntry[];
const issuesFile = JSON.parse(readFileSync(join(DATA, "issues.json"), "utf8")) as IssuesFile;
const cells = JSON.parse(readFileSync(join(DATA, "stances.json"), "utf8")) as StanceCell[];

const [, , action, id, ...rest] = process.argv;

if (!action) {
  if (queue.length === 0) {
    console.log("Kön är tom.");
  }
  for (const e of queue) {
    const c = e.candidate as Partial<StanceCandidate>;
    const gates = e.failures.map((f) => f.gate).join(",") || "—";
    const hard = e.failures.some((f) => HARD_GATES.has(f.gate));
    console.log(
      `${stanceReviewId(e)}  [${gates}]${hard ? " (endast avvisning)" : ""}  ${c.party ?? "?"} · ${c.subquestion_id ?? "?"} · ${c.position ?? "?"}\n` +
        `              ”${(c.quote ?? "").slice(0, 90)}${(c.quote ?? "").length > 90 ? "…" : ""}”\n` +
        `              ${e.articleUrl}${e.verifyReason ? `\n              LLM B: ${e.verifyReason}` : ""}`,
    );
  }
  process.exit(0);
}

if (action !== "approve" && action !== "reject") {
  console.error(`Okänt kommando: ${action} (tillåtet: approve | reject)`);
  process.exit(1);
}
if (!id) {
  console.error("Ange post-id (kör utan argument för att lista kön).");
  process.exit(1);
}

const idx = queue.findIndex((e) => stanceReviewId(e) === id);
if (idx === -1) {
  console.error(`Ingen köpost med id ${id}.`);
  process.exit(1);
}
const entry = queue[idx]!;

if (action === "reject") {
  const reason = rest.join(" ") || "avvisad via stances:review";
  queue.splice(idx, 1);
  writeFileSync(join(DATA, "stances_review.json"), JSON.stringify(queue, null, 2) + "\n");
  console.log(`Avvisad ${id}: ${reason}`);
  process.exit(0);
}

// approve
const hardFailures = entry.failures.filter((f) => HARD_GATES.has(f.gate));
if (hardFailures.length > 0) {
  console.error(
    `Posten har hårda grindfel och kan inte godkännas (${hardFailures.map((f) => `${f.gate}: ${f.reason}`).join("; ")}).\n` +
      "Verbatimkedjan är inte förhandlingsbar — avvisa posten och invänta en källa där citatet faktiskt står.",
  );
  process.exit(1);
}

const candidate = entry.candidate as StanceCandidate;
const sq = issuesFile.issues.flatMap((i) => i.subquestions).find((s) => s.id === candidate.subquestion_id);
if (!sq || sq.formulation_status !== "verifierad") {
  console.error(
    `Delfrågan ${candidate.subquestion_id} är inte verifierad (formulation_status: ${sq?.formulation_status ?? "saknas"}).\n` +
      "Verifiera och lås formuleringen i data/issues.json (via PR) innan besked kan publiceras — UTKAST-grinden gäller även människor.",
  );
  process.exit(1);
}

const approvedVerify: StanceVerifyResult = {
  quote_on_topic: true,
  position_follows_from_quote_alone: true,
  party_correct: true,
  verdict: "publish",
  reason: `mänskligt godkänd via stances:review (${id})`,
};

const result = publishStances({
  processed: [
    {
      candidate,
      article: {
        url: entry.articleUrl,
        domain: new URL(entry.articleUrl).hostname.replace(/^www\./, ""),
        title: entry.articleTitle,
        text: candidate.quote, // citatet är redan verbatimgranskat i grindkedjan
        published: `${entry.dateStated ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`,
      },
      verify: approvedVerify,
      archiveUrl: entry.archiveUrl ?? null,
      extractModel: entry.extractModel ?? "okänd",
      verifyModel: entry.verifyModel ?? "okänd",
    },
  ],
  gateReview: [],
  issuesFile,
  cells,
  existingReview: [],
  runId: entry.runId ?? "manual-review",
  now: new Date(),
  mode: "auto",
  humanApproved: true,
});

if (result.stancesAdded.length === 0) {
  console.error("Inget publicerades — troligen dublett av redan registrerat citat. Posten lämnas i kön.");
  process.exit(1);
}

const rsErrors = validateStanceInvariants(issuesFile, result.cells);
if (rsErrors.length > 0) {
  console.error(`RS-brott efter godkännande — INGET skrivs:\n  ${rsErrors.join("\n  ")}`);
  process.exit(1);
}

queue.splice(idx, 1);
writeFileSync(join(DATA, "stances.json"), JSON.stringify(result.cells, null, 2) + "\n");
writeFileSync(join(DATA, "stances_review.json"), JSON.stringify(queue, null, 2) + "\n");
console.log(
  `Godkänd ${id}: ${result.stancesAdded.join(", ")} publicerad${result.stancesChanged.length > 0 ? ` · ändring registrerad (${result.stancesChanged.join(", ")})` : ""}.\n` +
    `Committa data/ med meddelandet "data: stance review approve ${id}".`,
);
