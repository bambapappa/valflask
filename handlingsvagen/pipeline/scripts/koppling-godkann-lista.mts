/**
 * Godkänner en LISTA av kopplingsförslag i en körning — samma beslut och
 * samma grindar som `npm run granska -- godkann`, en post i taget.
 *
 * Beslutet är alltid en människas. Skriptet finns för att en människa som
 * sagt ja till en genomgången hög inte ska behöva köra 175 kommandon; det
 * fattar inga egna beslut och godkänner ingenting som inte står i listan.
 *
 *   npm run godkann-lista -- <fil med ett koppling-id per rad> [--skriv]
 *
 * Utan --skriv görs allt utom skrivningen — kör alltid så först.
 * Rader som börjar med # är kommentarer.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Handling } from "../src/handlingar.ts";
import {
  findIndexByKopplingId,
  godkannForslag,
  GranskningsFel,
  type KopplingPost,
  type KoPost,
} from "../src/granskning.ts";

const rot = resolve(import.meta.dirname, "../..");
const koPath = resolve(rot, "data/kopplingsforslag.json");
const kopplingarPath = resolve(rot, "data/kopplingar.json");

const [listfil] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const skriv = process.argv.includes("--skriv");
if (!listfil) {
  console.error("Ange en fil med ett koppling-id per rad.");
  process.exit(1);
}

const idn = readFileSync(resolve(listfil), "utf8")
  .split("\n")
  .map((r) => r.trim())
  .filter((r) => r !== "" && !r.startsWith("#"));

let ko: KoPost[] = JSON.parse(readFileSync(koPath, "utf8"));
let kopplingar: KopplingPost[] = existsSync(kopplingarPath)
  ? JSON.parse(readFileSync(kopplingarPath, "utf8"))
  : [];
const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));

const fore = kopplingar.length;
const fel: string[] = [];
for (const id of idn) {
  const index = findIndexByKopplingId(ko, id);
  if (index === -1) {
    fel.push(`${id}: finns inte i kön (redan avgjord?)`);
    continue;
  }
  try {
    const res = godkannForslag(ko, index, kopplingar, handlingar, { year: 2026 });
    kopplingar = res.kopplingar;
    ko = res.ko;
  } catch (e) {
    fel.push(`${id}: ${e instanceof GranskningsFel ? e.message : String(e)}`);
  }
}

console.log(`${idn.length} id i listan — ${kopplingar.length - fore} godkända, ${fel.length} föll`);
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
