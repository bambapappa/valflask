/**
 * Exekverar ett granskningsbeslut från en issue-kommentar (review.yml).
 * Läser ISSUE_TITLE + COMMENT_BODY ur miljön (aldrig via shell-interpolering —
 * kommentartext är data, inte kod), slår upp kö-posten via review-id i titeln
 * och kör samma approve/reject som CLI:t. Skriver resultatet till
 * GITHUB_OUTPUT (result, message) så workflown kan kommentera och stänga.
 *
 *   result: approved | rejected | error
 */
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  approve,
  reject,
  parseReviewCommand,
  findIndexByReviewId,
  type ReviewCandidate,
} from "../src/review.ts";

const DATA_DIR = join(import.meta.dirname, "../../data");

function output(result: "approved" | "rejected" | "error", message: string): void {
  const out = process.env.GITHUB_OUTPUT;
  const safe = message.replace(/\r?\n/gu, " ").slice(0, 900);
  if (out) {
    appendFileSync(out, `result=${result}\nmessage=${safe}\n`);
  }
  console.log(`[${result}] ${safe}`);
  // Fel = grönt jobb med förklarande kommentar (ägaren rättar kommandot och
  // försöker igen) — röda körningar reserveras för infrastrukturfel.
}

const title = process.env.ISSUE_TITLE ?? "";
const body = process.env.COMMENT_BODY ?? "";

const idMatch = title.match(/^\[review ([0-9a-f]{12})\]/u);
if (!idMatch) {
  output("error", "Issue-titeln saknar review-id — är detta verkligen ett review-issue?");
  process.exit(0);
}
const id = idMatch[1]!;

const cmd = parseReviewCommand(body);
if (!cmd) {
  output(
    "error",
    "Oklart kommando. Använd `/godkänn`, `/godkänn <low> <base> <high>` (tre tal i msek), `/godkänn --group p-2026-XXXX` eller `/avvisa <skäl>`.",
  );
  process.exit(0);
}

const items = JSON.parse(
  readFileSync(join(DATA_DIR, "needs_review.json"), "utf8"),
) as ReviewCandidate[];
const index = findIndexByReviewId(items, id);
if (index < 0) {
  output("error", `Posten (review-id ${id}) finns inte längre i kön — troligen redan hanterad. Ingen ändring gjord.`);
  process.exit(0);
}
const entry = items[index]!;

if (cmd.action === "reject") {
  const { title: t } = reject(String(index), cmd.reason, DATA_DIR);
  output("rejected", `Avvisad: "${t}" — ${cmd.reason}`);
  process.exit(0);
}

// approve — validera det CLI:t annars process.exit(1):ar på, med vänligt svar.
if (!entry.cost && !cmd.amounts) {
  output("error", "Posten saknar föreslagen kostnad — ange belopp: `/godkänn <low> <base> <high>` (msek).");
  process.exit(0);
}
if (cmd.group) {
  // approve() process.exit(1):ar på okänt länkmål — förvalidera med vänligt svar.
  const promises = JSON.parse(
    readFileSync(join(DATA_DIR, "promises.json"), "utf8"),
  ) as Array<{ id: string }>;
  if (!promises.some((p) => p.id === cmd.group)) {
    output("error", `Hittar inget löfte med id ${cmd.group} att länka till — kontrollera id:t.`);
    process.exit(0);
  }
}

const cliArgs: string[] = [String(index)];
if (cmd.amounts) cliArgs.push(...cmd.amounts.map(String));
if (cmd.group) cliArgs.push("--group", cmd.group);

try {
  const res = approve(cliArgs, DATA_DIR);
  output(
    "approved",
    `Publicerad som **${res.id}** — "${res.title}", ${res.msekBase} msek${cmd.group ? ` (länkad till ${cmd.group})` : ""}. Livesajten uppdateras vid nästa bygge.`,
  );
} catch (e) {
  output("error", `Kunde inte godkänna: ${e instanceof Error ? e.message : e}`);
}
