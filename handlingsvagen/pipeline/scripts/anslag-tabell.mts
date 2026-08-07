/**
 * Anslagstabellen ur en budgetmotion, lagd bredvid löftet kopplingen påstår.
 *
 * Beslutet b-0039 säger att ett anslagsyrkande kan bära ett löfte som består i
 * pengar **när motionens tabell har en rad för saken** — och att kopplingen ska
 * dras in när raden saknas. Det går inte att avgöra utan att läsa tabellen, och
 * det finns 103 sådana kopplingar. Det här verktygets enda uppgift är att göra
 * den frågan besvarbar en post i taget.
 *
 *   npm run anslag-tabell -- k-2026-0674
 *   npm run anslag-tabell -- --klass-a            # alla med bara anslagsyrkande
 *   npm run anslag-tabell -- k-2026-0674 --allt   # hela tabellen, inte bara träffarna
 *
 * **Verktyget avgör inget.** Det hämtar tabellen, rangordnar raderna efter
 * ordöverlapp mot löftet och skriver ut vad som står. Om raden bär löftet är en
 * läsning, och att byta eller dra in en publicerad koppling är en rättelse som
 * kräver ett mänskligt beslut.
 *
 * Enheten är tabellens egen — riksdagens utgiftsområdestabeller anger normalt
 * tusental kronor. Den skrivs ut som den står och räknas inte om.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Handling } from "../src/handlingar.ts";
import type { KopplingPost } from "../src/granskning.ts";
import { parseAnslagstabell, narmastLoftet, type Anslagsrad } from "../src/anslagstabell.ts";
import { cachat, politeFetch } from "./kallcache.mts";

const rot = resolve(import.meta.dirname, "../..");
const kopplingar: KopplingPost[] = JSON.parse(readFileSync(resolve(rot, "data/kopplingar.json"), "utf8"));
const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));
const loften: Array<{ id: string; quote?: string; title?: string; parties?: string[] }> = JSON.parse(
  readFileSync(resolve(rot, "../data/promises.json"), "utf8"),
);

const argv = process.argv.slice(2);
const allt = argv.includes("--allt");
const klassA = argv.includes("--klass-a");
const idn = argv.filter((a) => !a.startsWith("--"));

const handlingPerId = new Map(handlingar.map((h) => [h.id, h]));
const loftePerId = new Map(loften.map((p) => [p.id, p]));

/** Dokumentets rå-HTML — tabellen finns bara där, den utplattade texten tappar den. */
async function hamtaHtml(dokId: string): Promise<string> {
  const payload = (await cachat(`dokstatus-${dokId}`, () =>
    politeFetch(`https://data.riksdagen.se/dokumentstatus/${dokId}.json`),
  )) as { dokumentstatus?: { dokument?: { html?: unknown } } };
  const html = payload.dokumentstatus?.dokument?.html;
  if (typeof html !== "string" || html === "") throw new Error(`${dokId}: ingen dokumenttext`);
  return html;
}

function skrivRad(r: Anslagsrad): string {
  const tal = r.avvikelse === null ? "okänd" : r.avvikelse === 0 ? "±0" : String(r.avvikelse);
  return `    ${r.anslag.padEnd(7)}${tal.padStart(9)}   ${r.namn.slice(0, 62)}`;
}

const valda = klassA
  ? kopplingar.filter((k) => k.status !== "indragen" && k.motionstyp !== undefined).map((k) => k.id)
  : idn;

if (valda.length === 0) {
  console.error("Ange koppling-id, eller --klass-a. Se b-0039 för vad tabellen avgör.");
  process.exit(1);
}

let bar = 0;
let orort = 0;
let saknas = 0;

for (const id of valda) {
  const k = kopplingar.find((x) => x.id === id);
  if (!k) {
    console.log(`\n${id}  ⚠ finns inte i kopplingar.json`);
    continue;
  }
  const h = handlingPerId.get(k.handling_id);
  // En koppling utan löfte kan inte prövas mot ett löftes sakord; säg det i
  // stället för att låta tabellen se ut som ett svar på ingen fråga.
  const p = k.promise_id === undefined ? undefined : loftePerId.get(k.promise_id);
  console.log("\n" + "─".repeat(78));
  console.log(`${id}  ·  ${h?.kind ?? "?"}  ·  ${h?.dok_id ?? "?"}  ·  ${(h?.titel ?? "").slice(0, 52)}`);
  console.log(`  löfte  ${k.promise_id ?? "—"} (${(p?.parties ?? []).join(",")}): ${(p?.title ?? "").slice(0, 64)}`);
  console.log(`  citat  ${(p?.quote ?? "").slice(0, 150)}`);

  if (!h?.dok_id) {
    console.log("  ⚠ handlingen har inget dok_id — tabellen går inte att hämta");
    saknas++;
    continue;
  }

  let rader: Anslagsrad[];
  try {
    rader = parseAnslagstabell(await hamtaHtml(h.dok_id));
  } catch (fel) {
    console.log(`  ⚠ hämtningen gick inte fram: ${(fel as Error).message}`);
    saknas++;
    continue;
  }

  if (rader.length === 0) {
    console.log("  ⚠ INGEN ANSLAGSTABELL i dokumentet — då kan yrkandet inte bära ett belopp");
    saknas++;
    continue;
  }

  const traff = narmastLoftet(rader, `${p?.quote ?? ""} ${p?.title ?? ""}`);
  console.log(`\n  ANSLAGSTABELLEN — ${rader.length} rader, enheten är tabellens egen (normalt tusental kronor)`);
  if (traff.length === 0) {
    console.log("    Ingen rad delar ett sakord med löftet.");
    console.log("    → Läs hela tabellen med --allt innan du drar slutsatsen. Ordöverlapp");
    console.log("      är en läshjälp, inte ett bevis på att raden saknas.");
  } else {
    console.log("    Rader som delar ett sakord med löftet, närmast först:");
    for (const r of traff.slice(0, allt ? traff.length : 6)) console.log(skrivRad(r));
    const rort = traff.filter((r) => r.avvikelse !== null && r.avvikelse !== 0);
    if (rort.length > 0) {
      console.log(`\n    ${rort.length} av dem bär en ändring — kopplingen kan hålla efter ett bevisbyte.`);
      bar++;
    } else {
      console.log("\n    Samtliga står ±0 eller okänd: motionen begärde ingen ändring av");
      console.log("    det löftet gäller. Bär inget annat löftet är utfallet indragning.");
      orort++;
    }
  }
  if (allt) {
    console.log("\n    Hela tabellen:");
    for (const r of rader) console.log(skrivRad(r));
  }
}

if (valda.length > 1) {
  console.log("\n" + "═".repeat(78));
  console.log(`${valda.length} prövade · ${bar} har en rad med ändring · ${orort} bara ±0 · ${saknas} kunde inte läsas`);
  console.log("Talen är ingen genomgång. Varje post ska läsas innan den föreslås.");
}
