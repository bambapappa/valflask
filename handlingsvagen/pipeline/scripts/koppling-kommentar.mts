/**
 * Exekverar ett H6-beslut från en issue-kommentar (koppling-review.yml).
 * Läser ISSUE_TITLE + COMMENT_BODY ur miljön (aldrig via shell-interpolering
 * — kommentartext är data, inte kod), slår upp kö-posten via koppling-id i
 * titeln och kör samma godkann/avvisa som CLI:t. Skriver resultatet till
 * GITHUB_OUTPUT (result, message) så workflown kan kommentera och stänga.
 *
 *   result: approved | rejected | error
 */
import { appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Handling } from "../src/handlingar.ts";
import {
  avvisaForslag,
  findIndexByKopplingId,
  godkannForslag,
  GranskningsFel,
  parseGranskningsKommando,
  type KopplingPost,
  type KoPost,
} from "../src/granskning.ts";

const DATA_DIR = join(import.meta.dirname, "../../data");

function output(result: "approved" | "rejected" | "error", message: string): void {
  const out = process.env["GITHUB_OUTPUT"];
  const safe = message.replace(/\r?\n/gu, " ").slice(0, 900);
  if (out) {
    appendFileSync(out, `result=${result}\nmessage=${safe}\n`);
  }
  console.log(`[${result}] ${safe}`);
  // Fel = grönt jobb med förklarande kommentar (ägaren rättar kommandot och
  // försöker igen) — röda körningar reserveras för infrastrukturfel.
}

function lasJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : fallback;
}

function skrivJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

const title = process.env["ISSUE_TITLE"] ?? "";
const body = process.env["COMMENT_BODY"] ?? "";

const idMatch = title.match(/^\[koppling ([0-9a-f]{12})\]/u);
if (!idMatch) {
  output("error", "Issue-titeln saknar koppling-id — är detta verkligen ett koppling-issue?");
  process.exit(0);
}
const id = idMatch[1]!;

const cmd = parseGranskningsKommando(body);
if (!cmd) {
  output(
    "error",
    "Oklart kommando. Använd `/godkänn`, `/godkänn --motionstyp parti|kommitte|enskild` eller `/avvisa <skäl>`.",
  );
  process.exit(0);
}

const koPath = join(DATA_DIR, "kopplingsforslag.json");
const ko = lasJson<KoPost[]>(koPath, []);
const index = findIndexByKopplingId(ko, id);
if (index < 0) {
  output("error", `Posten (koppling-id ${id}) finns inte längre i kön — troligen redan hanterad. Ingen ändring gjord.`);
  process.exit(0);
}

if (cmd.action === "reject") {
  const res = avvisaForslag(ko, index);
  skrivJson(koPath, res.ko);
  output("rejected", `Avvisad: ${res.post.promise_id ?? res.post.stance_id} ↔ ${res.post.handling_id} — ${cmd.reason}`);
  process.exit(0);
}

const kopplingarPath = join(DATA_DIR, "kopplingar.json");
try {
  const res = godkannForslag(
    ko,
    index,
    lasJson<KopplingPost[]>(kopplingarPath, []),
    lasJson<Handling[]>(join(DATA_DIR, "handlingar.json"), []),
    cmd.motionstyp ? { motionstyp: cmd.motionstyp } : {},
  );
  skrivJson(kopplingarPath, res.kopplingar);
  skrivJson(koPath, res.ko);
  output(
    "approved",
    `Godkänd som **${res.koppling.id}** — ${res.koppling.promise_id ?? res.koppling.stance_id} ↔ ${res.koppling.handling_id} (${res.koppling.riktning}). Domarna räknas om vid nästa domskörning.`,
  );
} catch (e) {
  if (e instanceof GranskningsFel) {
    output("error", `Kunde inte godkänna: ${e.message}`);
    process.exit(0);
  }
  throw e;
}
