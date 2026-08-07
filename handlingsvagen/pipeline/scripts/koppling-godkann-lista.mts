/**
 * Godkänner en LISTA av kopplingsförslag i en körning — samma beslut och
 * samma grindar som `npm run granska -- godkann`, en post i taget.
 *
 * Beslutet är alltid en människas. Skriptet finns för att en människa som
 * sagt ja till en genomgången hög inte ska behöva köra 175 kommandon; det
 * fattar inga egna beslut och godkänner ingenting som inte står i listan.
 *
 *   npm run godkann-lista -- <fil med en rad per koppling> [--skriv]
 *
 * En rad är antingen bara ett koppling-id, eller id och ett nytt bevis
 * åtskilda av tabb:
 *
 *   7c56af6fd555
 *   4e1d9fd1407a<TAB>Riksdagen ställer sig bakom det som anförs i motionen om…
 *
 * Anges ett nytt bevis hämtas källdokumentet och citatet prövas ordagrant
 * mot det innan godkännandet — samma kontroll som när en granskare byter
 * bevis en post i taget. Skriptet väljer aldrig citat själv; det prövar
 * bara det som står i listan.
 *
 * Utan --skriv görs allt utom skrivningen — kör alltid så först.
 * Rader som börjar med # är kommentarer.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Handling } from "../src/handlingar.ts";
import { fetchDokumentText } from "../src/riksdagen.ts";
import { cachat, politeFetch } from "./kallcache.mts";
import {
  findIndexByKopplingId,
  godkannForslag,
  GranskningsFel,
  provaNyttBevis,
  type KopplingPost,
  type KoPost,
} from "../src/granskning.ts";
import { lasProvningar } from "../../../pipeline/src/provningar.ts";

const rot = resolve(import.meta.dirname, "../..");
const rotData = resolve(rot, "../data");
const provningar = lasProvningar(rotData);
const koPath = resolve(rot, "data/kopplingsforslag.json");
const kopplingarPath = resolve(rot, "data/kopplingar.json");

const [listfil] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const skriv = process.argv.includes("--skriv");
if (!listfil) {
  console.error("Ange en fil med ett koppling-id per rad.");
  process.exit(1);
}

const rader = readFileSync(resolve(listfil), "utf8")
  .split("\n")
  .filter((r) => r.trim() !== "" && !r.trimStart().startsWith("#"))
  .map((r) => {
    const [id, bevis] = r.split("\t");
    return { id: id!.trim(), bevis: bevis?.trim() || undefined };
  });

let ko: KoPost[] = JSON.parse(readFileSync(koPath, "utf8"));
let kopplingar: KopplingPost[] = existsSync(kopplingarPath)
  ? JSON.parse(readFileSync(kopplingarPath, "utf8"))
  : [];
const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));

const fore = kopplingar.length;
const fel: string[] = [];
let bytta = 0;
for (const { id, bevis } of rader) {
  const index = findIndexByKopplingId(ko, id);
  if (index === -1) {
    fel.push(`${id}: finns inte i kön (redan avgjord?)`);
    continue;
  }
  const post = ko[index]!;

  // Ett utbytt bevis prövas mot källdokumentet FÖRE godkännandet. Går texten
  // inte att hämta godkänns posten inte — en kontroll som tyst uteblir är
  // värre än ingen kontroll alls.
  if (bevis !== undefined) {
    const handling = handlingar.find((h) => h.id === post.handling_id);
    const kallDok = post.bevis.kalla_dok_id ?? handling?.dok_id;
    if (!kallDok) {
      fel.push(`${id}: handlingen saknar dokument-id — det nya beviset går inte att pröva`);
      continue;
    }
    const text = await cachat(`text-${kallDok}`, () => fetchDokumentText(politeFetch, kallDok));
    if (text === null) {
      fel.push(`${id}: källdokumentet ${kallDok} gick inte att hämta — beviset oprövat`);
      continue;
    }
    const prov = provaNyttBevis(bevis, text);
    if (!prov.ok) {
      fel.push(`${id}: ${prov.skal}`);
      continue;
    }
    bytta += 1;
  }

  try {
    const res = godkannForslag(
      ko,
      index,
      kopplingar,
      handlingar,
      { year: 2026, ...(bevis !== undefined ? { bevis } : {}) },
      provningar,
    );
    kopplingar = res.kopplingar;
    ko = res.ko;
  } catch (e) {
    fel.push(`${id}: ${e instanceof GranskningsFel ? e.message : String(e)}`);
  }
}

console.log(
  `${rader.length} rader i listan — ${kopplingar.length - fore} godkända ` +
    `(${bytta} med bevis utbytt och prövat ordagrant), ${fel.length} föll`,
);
for (const f of fel) console.log(`  ${f}`);
console.log(`kön: ${ko.length} kvar`);

// Faller EN post är listan inte den granskaren sa ja till. Skriv ingenting
// då — hellre ett stopp som syns än en halv verkställighet som inte gör det.
if (fel.length > 0) {
  console.error("Inget skrivet — rätta listan och kör om.");
  process.exit(1);
}
if (skriv) {
  writeFileSync(kopplingarPath, JSON.stringify(kopplingar, null, 2) + "\n");
  writeFileSync(koPath, JSON.stringify(ko, null, 2) + "\n");
  console.log(`skrivet: ${kopplingarPath}, ${koPath}`);
} else {
  console.log("torrkörning — lägg till --skriv för att verkställa.");
}
