/**
 * Avvisar en LISTA av kopplingsförslag i en körning — samma beslut och samma
 * spårbarhet som `npm run granska -- avvisa`, en post i taget.
 *
 * Motstycket till godkann-lista. Beslutet är alltid en människas; skriptet
 * finns för att en människa som sagt nej till en genomgången hög inte ska
 * behöva köra 42 kommandon.
 *
 *   npm run avvisa-lista -- <fil: <koppling-id> <TAB> <skäl>> [--skriv]
 *
 * Skälet är obligatoriskt per rad och hamnar i körningens utskrift och
 * därmed i committexten — kön bär ingen avvisningslogg, spåret är gitdiffen.
 * Rader som börjar med # är kommentarer.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { avvisaForslag, findIndexByKopplingId, GranskningsFel, type KoPost } from "../src/granskning.ts";

const rot = resolve(import.meta.dirname, "../..");
const koPath = resolve(rot, "data/kopplingsforslag.json");

const [listfil] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const skriv = process.argv.includes("--skriv");
if (!listfil) {
  console.error("Ange en fil med '<koppling-id><tab><skäl>' per rad.");
  process.exit(1);
}

const rader = readFileSync(resolve(listfil), "utf8")
  .split("\n")
  .map((r) => r.trim())
  .filter((r) => r !== "" && !r.startsWith("#"))
  .map((r) => {
    const [id, ...rest] = r.split("\t");
    return { id: (id ?? "").trim(), skal: rest.join("\t").trim() };
  });

let ko: KoPost[] = JSON.parse(readFileSync(koPath, "utf8"));
const fore = ko.length;
const fel: string[] = [];
for (const { id, skal } of rader) {
  if (skal === "") {
    fel.push(`${id}: saknar skäl — en avvisning utan skäl går inte att granska i efterhand`);
    continue;
  }
  const index = findIndexByKopplingId(ko, id);
  if (index === -1) {
    fel.push(`${id}: finns inte i kön (redan avgjord?)`);
    continue;
  }
  try {
    const res = avvisaForslag(ko, index);
    ko = res.ko;
    console.log(`  ${id} ${res.post.promise_id ?? res.post.stance_id} ↔ ${res.post.handling_id} — ${skal}`);
  } catch (e) {
    fel.push(`${id}: ${e instanceof GranskningsFel ? e.message : String(e)}`);
  }
}

console.log(`${rader.length} rader — ${fore - ko.length} avvisade, ${fel.length} föll`);
for (const f of fel) console.log(`  ${f}`);

// Faller EN post är listan inte den granskaren sa nej till.
if (fel.length > 0) {
  console.error("Inget skrivet — rätta listan och kör om.");
  process.exit(1);
}
if (skriv) {
  writeFileSync(koPath, JSON.stringify(ko, null, 2) + "\n");
  console.log(`skrivet: ${koPath} (${ko.length} kvar)`);
} else {
  console.log("torrkörning — lägg till --skriv för att verkställa.");
}
