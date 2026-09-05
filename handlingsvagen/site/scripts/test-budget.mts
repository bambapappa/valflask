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

// Höjt 100 → 200 KB den 2026-08-27. Datat har vuxit ~4x sedan taket sattes
// (kopplingar 786 → 1228, ~3 340 publicerade löften totalt) genom den
// avsiktliga ikappskörden av A–Ö-katalogerna — inte genom bloat i formen:
// raderna bär fortfarande bara id/titel/kategori/celler/fasetter, ingen
// citattext. summary.json mätte 132,7 KB vid höjningen; 200 KB ger
// utrymme för fortsatt skörd fram till valet utan att behöva höjas igen
// varje vecka.
//
// HÖJT 200 → 240 KB DEN 2026-09-05, och "utan att behöva höjas igen varje
// vecka" höll i nio dagar. Måttet steg 132,7 → 200,1 KB på den tiden, av
// kopplingsköerna: 633 rader i rutnätet mot 612 samma morgon. Formen är
// oförändrad — fortfarande ingen citattext, fortfarande bara det raden behöver.
//
// VAR FETTET SITTER, mätt 2026-09-05 så att nästa höjning kan avslås med en
// siffra i handen: celler 24 %, titel 22 %, och de tre fasettlistorna
// (dokumenttyper, motionstyper, riksmoten) 22 % — 28,9 KB av 200,1. Fasetterna
// är fyra, tre respektive fem möjliga värden som skrivs ut som ord på varje
// rad. Ordbokskodning av dem är den strukturella nedskärningen, och den ska
// göras INNAN taket höjs en tredje gång. Ingen extern konsument läser
// api/hv/summary.json — den byggs av index.astro och är inte dokumenterad på
// api-sidan — så formen går att ändra utan att bryta något löfte till läsaren.
//
// Sverigedemokraternas A–Ö öppnas i samma veva (245 nya sidor), men rutnätet
// växer med KOPPLINGAR och inte med löften, så den skörden slår igenom här
// först när kopplingsförslagen för de nya löftena börjar godkännas.
grind("summary.json", storlek(buildSummary()), 240 * KB);
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
