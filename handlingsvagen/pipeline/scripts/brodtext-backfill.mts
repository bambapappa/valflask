/**
 * Engångsmigrering: sätter `bevis.brodtext_oppen` ur den prosa som redan står
 * i motiveringen.
 *
 * Undantaget från H2 — att ett citat får stå utanför handlingens egna lydelser
 * när yrkandena bara anvisar medel enligt en tabell — har alltid skrivits ut
 * för läsaren, men bara som löptext, och i tre former från tre verktyg. Vid
 * genomgången 2026-08-22 kunde ett svep mot riksdagens källor därför inte
 * skilja de 68 godkända undantagen från den enda verkliga bristen; det fick
 * läsas för hand. Fältet ger samma sak i prövbar form.
 *
 * Migreringen HITTAR PÅ INGENTING: den läser grunden ur prosan som redan står
 * där. En post utan prosa får inget fält, och en post med fält som saknar
 * prosa fälls av `tests/brodtextspar.test.ts`.
 *
 *   npm run brodtext-backfill              # torrkörning, alltid först
 *   npm run brodtext-backfill -- --skriv
 *
 * Detta är ingen rättelse: ingen publicerad text ändras, bara den maskinläsbara
 * spegeln av text som redan är publicerad.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { KopplingPost } from "../src/granskning.ts";
import { grundenIProsan } from "../src/brodtextspar.ts";

const skriv = process.argv.includes("--skriv");
const path = resolve(import.meta.dirname, "../../data/kopplingar.json");
const kopplingar: KopplingPost[] = JSON.parse(readFileSync(path, "utf8"));

let satta = 0;
let redan = 0;
let utan = 0;
const perGrund = new Map<string, number>();

for (const k of kopplingar) {
  const grund = grundenIProsan(k.method_note);
  if (grund === undefined) {
    // Bär posten redan ett fält utan prosa som förklarar det är det ett fel
    // migreringen inte får dölja — provet ska få se det.
    if (k.bevis.brodtext_oppen) console.warn(`⚠ ${k.id} bär fält utan prosa: ${k.bevis.brodtext_oppen}`);
    utan += 1;
    continue;
  }
  perGrund.set(grund, (perGrund.get(grund) ?? 0) + 1);
  if (k.bevis.brodtext_oppen === grund) {
    redan += 1;
    continue;
  }
  k.bevis = { ...k.bevis, brodtext_oppen: grund };
  satta += 1;
}

console.log(`${kopplingar.length} kopplingar lästa`);
for (const [grund, antal] of [...perGrund].sort()) console.log(`  ${grund}: ${antal}`);
console.log(`${satta} fält att sätta · ${redan} redan satta · ${utan} utan prosa och utan fält`);

if (!skriv) {
  console.log("\nIngenting skrivet. Kör med --skriv för att verkställa.");
  process.exit(0);
}

writeFileSync(path, JSON.stringify(kopplingar, null, 2) + "\n");
console.log(`\nSkrivet: data/kopplingar.json — ${satta} fält satta`);
