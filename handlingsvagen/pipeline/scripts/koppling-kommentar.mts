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
import { hamtaAvslagsunderlag } from "../src/avslagsunderlag.ts";
import { avslagsbeslut } from "../src/grindar.ts";
import {
  avvisaForslag,
  findIndexByKopplingId,
  godkannForslag,
  GranskningsFel,
  parseGranskningsKommando,
  provaNyttBevis,
  type KopplingPost,
  type KoPost,
} from "../src/granskning.ts";
import {
  fetchDokumentText,
  fetchMotionDokId,
  fetchUtskottspunkter,
  fetchYrkanden,
} from "../src/riksdagen.ts";
import { lasProvningar } from "../../../pipeline/src/provningar.ts";

const DATA_DIR = join(import.meta.dirname, "../../data");
// Kvalitetsfiltrets index ligger i valflasks rot-data — en logg för alla tre
// vågarna, ett index.
const ROT_DATA = join(import.meta.dirname, "../../../data");

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
    "Oklart kommando. Använd `/godkänn`, `/godkänn --motionstyp parti|kommitte|enskild` eller `/avvisa <skäl>`. " +
      "Bär förslaget fel citat men dokumentet ett bättre: lägg en rad `Bevis: <citatet>` under kommandot, " +
      "så prövas det ordagrant mot källdokumentet innan det sparas.",
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

// Ett utbytt bevis prövas mot dokumentet som det ser ut NU, före allt annat.
// Håller det inte sker ingen ändring alls — varken i kön eller i kopplingarna.
const handlingar = lasJson<Handling[]>(join(DATA_DIR, "handlingar.json"), []);
const post = ko[index]!;
const handling = handlingar.find((h) => h.id === post.handling_id);
if (cmd.bevis) {
  if (!handling?.dok_id) {
    output("error", `Handlingen ${post.handling_id} saknar dokument-id — det går inte att pröva ett nytt citat mot källan.`);
    process.exit(0);
  }
  let kalltext: string;
  try {
    kalltext = await fetchDokumentText((url) => fetch(url), handling.dok_id);
  } catch (e) {
    // Nätfel är INTE ett underkänt citat. Att svara "citatet håller inte" när
    // vi inte kunnat läsa källan vore att ljuga om vad vi vet.
    output("error", `Kunde inte hämta källdokumentet ${handling.dok_id}: ${e instanceof Error ? e.message : e}. Försök igen — inget beslut är fattat.`);
    process.exit(0);
  }
  const prov = provaNyttBevis(cmd.bevis, kalltext);
  if (!prov.ok) {
    output("error", `Det angivna beviset håller inte: ${prov.skal}`);
    process.exit(0);
  }
}

let avslaget;
if (avslagsbeslut(cmd.bevis ?? post.bevis.citat)) {
  const kallDok = post.bevis.kalla_dok_id ?? handling?.dok_id;
  try {
    avslaget = (await hamtaAvslagsunderlag(id, handling?.punkt, kallDok, {
      punkter: (dokId) => fetchUtskottspunkter((url) => fetch(url), dokId),
      motionDokId: (rm, beteckning) => fetchMotionDokId((url) => fetch(url), rm, beteckning),
      yrkanden: (dokId) => fetchYrkanden((url) => fetch(url), dokId),
    })).avslaget;
  } catch (e) {
    output("error", `Kunde inte hämta vad beslutspunkten avslog: ${e instanceof Error ? e.message : e}. Inget beslut är fattat.`);
    process.exit(0);
  }
}

const kopplingarPath = join(DATA_DIR, "kopplingar.json");
try {
  const res = godkannForslag(
    ko,
    index,
    lasJson<KopplingPost[]>(kopplingarPath, []),
    handlingar,
    {
      ...(cmd.motionstyp ? { motionstyp: cmd.motionstyp } : {}),
      ...(cmd.bevis ? { bevis: cmd.bevis } : {}),
      ...(avslaget ? { avslaget } : {}),
    },
    lasProvningar(ROT_DATA),
  );
  skrivJson(kopplingarPath, res.kopplingar);
  skrivJson(koPath, res.ko);
  output(
    "approved",
    `Godkänd som **${res.koppling.id}** — ${res.koppling.promise_id ?? res.koppling.stance_id} ↔ ${res.koppling.handling_id} (${res.koppling.riktning}).` +
      (cmd.bevis
        ? ` Beviset är utbytt mot citatet du angav, kontrollerat ord för ord mot källdokumentet: "${res.koppling.bevis.citat}"`
        : "") +
      " Domarna räknas om vid nästa domskörning.",
  );
} catch (e) {
  if (e instanceof GranskningsFel) {
    output("error", `Kunde inte godkänna: ${e.message}`);
    process.exit(0);
  }
  throw e;
}
