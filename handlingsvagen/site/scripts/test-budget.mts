/*
 * Budgetgrind (i stil med Fläskvågens T-serie): sajten skeppar aldrig råfilerna.
 * Mäter de skivade api/hv-nyttolasterna innan de byggs — en grind, inte en
 * förhoppning. Kör: npm test (från site/).
 */
import assert from "node:assert";
import { buildSummary, lofteIds, buildLofteDetalj } from "../src/lib/rutnat.ts";
import { buildSokIndex } from "../src/lib/sok.ts";
import {
  byggHandlingSkarva, byggOrdSkarva, byggPartiTrender, byggVagda, byggVagdaDokId,
  byggVoteringSkarva, handlingSkarvor, indexFinns, ordSkarvor, voteringSkarvor,
} from "../src/lib/amne.ts";
import { partiKoder, buildPartiSida, ledamotIds, buildLedamotSida } from "../src/lib/vyer.ts";

const KB = 1024;
let fel = 0;
function grind(namn: string, bytes: number, tak: number) {
  const ok = bytes <= tak;
  console.log(`${ok ? "✓" : "✗"} ${namn}: ${(bytes / KB).toFixed(1)} KB (tak ${(tak / KB).toFixed(0)} KB)`);
  if (!ok) fel += 1;
}
function storlek(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v));
}

grind("summary.json", storlek(buildSummary()), 100 * KB);
grind("sok-index.json", storlek(buildSokIndex()), 400 * KB);
// Märkningen av den breda träfflistan. Hänger på kopplingarna, inte på
// nyckelordsindexet, och mäts därför utanför blocket längre ner.
grind("vagda-dokid.json", storlek(byggVagdaDokId()), 100 * KB);

let störst = 0;
let störstId = "";
for (const id of lofteIds()) {
  const b = storlek(buildLofteDetalj(id));
  if (b > störst) { störst = b; störstId = id; }
}
grind(`största löftesdetalj (${störstId})`, störst, 500 * KB);

let störstParti = 0;
for (const kod of partiKoder()) störstParti = Math.max(störstParti, storlek(buildPartiSida(kod)));
grind("största partisida-modell", störstParti, 300 * KB);

let störstLed = 0;
for (const id of ledamotIds()) störstLed = Math.max(störstLed, storlek(buildLedamotSida(id)));
grind("största ledamotssida-modell", störstLed, 100 * KB);

// Ämnessöket (b-0014). 23 600 handlingar får aldrig plats i en nyttolast —
// därför skärvat och hämtat på begäran. Grindarna mäter den STÖRSTA skärvan,
// för det är den en läsare faktiskt kan råka hämta.
if (indexFinns()) {
  let störstOrd = 0;
  let störstOrdNamn = "";
  for (const nyckel of ordSkarvor()) {
    const b = storlek(byggOrdSkarva(nyckel));
    if (b > störstOrd) { störstOrd = b; störstOrdNamn = nyckel; }
  }
  grind(`största ordskärva (${störstOrdNamn})`, störstOrd, 500 * KB);

  let störstHandling = 0;
  let störstHandlingNamn = "";
  for (const nyckel of handlingSkarvor()) {
    const b = storlek(byggHandlingSkarva(nyckel));
    if (b > störstHandling) { störstHandling = b; störstHandlingNamn = nyckel; }
  }
  grind(`största handlingsskärva (${störstHandlingNamn})`, störstHandling, 400 * KB);

  let störstRost = 0;
  let störstRostNamn = "";
  for (const nyckel of voteringSkarvor()) {
    const b = storlek(byggVoteringSkarva(nyckel));
    if (b > störstRost) { störstRost = b; störstRostNamn = nyckel; }
  }
  grind(`största röstskärva (${störstRostNamn})`, störstRost, 400 * KB);

  grind("vagda.json", storlek(byggVagda()), 100 * KB);
  grind("ordtrender (i sidan)", storlek(byggPartiTrender()), 60 * KB);
} else {
  console.log("— ämnesindexet inte byggt: hoppar över dess budgetgrindar");
}

assert.strictEqual(fel, 0, `${fel} budgetgrind(ar) föll`);
console.log("budget: alla grindar gröna");
