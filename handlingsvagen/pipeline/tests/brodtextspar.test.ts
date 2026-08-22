/**
 * Vaktar att undantaget från H2 går att pröva och inte bara att läsa.
 *
 * Ett citat får stå utanför handlingens egna lydelser bara på en utskriven
 * grund. Den grunden har alltid stått i motiveringen — men i prosa, i tre
 * former från tre verktyg (anslagsbäraren, inkomstbäraren, bevisbytet). Vid
 * den oberoende genomgången 2026-08-22 prövades samtliga 792 aktiva
 * kopplingar mot riksdagens källor; 69 citat stod inte i handlingens egen
 * del, och svepet kunde inte av sig självt skilja de 68 godkända undantagen
 * från den enda verkliga bristen. Skillnaden fanns bara i löptext.
 *
 * Provet håller ihop fältet och prosan i BÅDA riktningarna, och prövar
 * dessutom att de tre verktygen fortfarande sätter fältet. Utan den andra
 * halvan skulle provet gå igenom mot ett tomt register: ett filter över
 * ingenting är tomt, och "inga brott" blir sant utan att något har lästs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GRUNDER, grundenIProsan, harProsa } from "../src/brodtextspar.ts";
import { bytBevis } from "../src/bevisbyte.ts";
import type { KopplingPost } from "../src/granskning.ts";

const rot = resolve(import.meta.dirname, "../..");
const kopplingar: KopplingPost[] = JSON.parse(
  readFileSync(resolve(rot, "data/kopplingar.json"), "utf8"),
);

test("grunden läses ur prosan, en form per verktyg", () => {
  assert.equal(
    grundenIProsan("Motionens anslagsyrkande anvisar anslagen enligt tabellen i motionen, och tabellen …"),
    "anslagsrad",
  );
  assert.equal(
    grundenIProsan("Motionens enda yrkande anvisar anslagen enligt tabellen i motionen …"),
    "anslagsrad",
  );
  assert.equal(
    grundenIProsan("Motionens yrkanden fastställer budgetens ramar, och ett av dem godkänner …"),
    "inkomstrad",
  );
  assert.equal(
    grundenIProsan(
      "Citatet står inte bland handlingens egna lydelser, och togs in på ett mänskligt beslut: " +
        "motionens enda yrkande anvisar anslagen enligt en tabell",
    ),
    "manskligt_beslut",
  );
  assert.equal(grundenIProsan("Motionen yrkar på fler poliser."), undefined);
  assert.equal(grundenIProsan(undefined), undefined);
});

test("granskarens eget beslut vinner över en tidigare utskriven rad", () => {
  // En post kan först ha fått en anslagsrad utskriven och senare ett bevisbyte
  // på granskarens skäl. Då är det granskarens beslut som beskriver det citat
  // som står där nu, och fältet ska säga det.
  const bada =
    "Motionens anslagsyrkande anvisar anslagen enligt tabellen i motionen, och tabellen … " +
    "Citatet står inte bland handlingens egna lydelser, och togs in på ett mänskligt beslut: skälet";
  assert.equal(grundenIProsan(bada), "manskligt_beslut");
});

test("bevisbytet sätter grunden, och nollställer den när undantaget inte längre behövs", () => {
  const bas = {
    id: "k-1",
    promise_id: "p-1",
    handling_id: "h-1",
    riktning: "stodjer",
    bevis: { citat: "gammalt citat som är tillräckligt långt" },
    method_note: "Motionen yrkar på saken.",
    confidence: 0.9,
    extraction: { model: "m", verified_by: "owner", run_id: "r" },
    status: "aktiv",
  } as KopplingPost;

  const paUndantag = bytBevis(bas, { id: "k-1", citat: "nytt citat ur brödtexten", brodtextSkal: "skälet" }, "2026-08-22");
  assert.equal(paUndantag.bevis.brodtext_oppen, "manskligt_beslut");
  assert.ok(harProsa(paUndantag.method_note), "prosan ska förklara fältet");

  // Byts posten sedan till en lydelse som står i handlingen finns inget
  // undantag kvar, och fältet får inte bli kvar och påstå ett som är borta.
  const utanUndantag = bytBevis(paUndantag, { id: "k-1", citat: "ett yrkande ur handlingen" }, "2026-08-23");
  assert.equal(utanUndantag.bevis.brodtext_oppen, undefined);
  assert.equal(harProsa(utanUndantag.method_note), false);
});

test("det incheckade datat: fält och prosa säger samma sak, åt båda hållen", () => {
  const utanProsa: string[] = [];
  const utanFalt: string[] = [];
  const felGrund: string[] = [];

  for (const k of kopplingar) {
    const iProsan = grundenIProsan(k.method_note);
    const iFaltet = k.bevis.brodtext_oppen;
    if (iFaltet && !iProsan) utanProsa.push(k.id);
    if (iProsan && !iFaltet) utanFalt.push(k.id);
    if (iProsan && iFaltet && iProsan !== iFaltet) felGrund.push(`${k.id}: fält ${iFaltet}, prosa ${iProsan}`);
  }

  assert.deepEqual(utanProsa, [], "fältet påstår ett undantag som motiveringen inte förklarar");
  assert.deepEqual(utanFalt, [], "motiveringen förklarar ett undantag som fältet inte bär");
  assert.deepEqual(felGrund, [], "fältet och prosan pekar på olika grunder");

  // Blankprovet: ett filter över tom data är tomt. Provet ska mäta att det
  // FINNS poster att pröva, annars intygar det ingenting.
  const med = kopplingar.filter((k) => k.bevis.brodtext_oppen);
  assert.ok(med.length >= 70, `bara ${med.length} poster bär en grund — förväntat minst 70`);
  const grunder = new Set(med.map((k) => k.bevis.brodtext_oppen));
  for (const g of GRUNDER) assert.ok(grunder.has(g), `ingen post bär grunden ${g}`);
});

test("de tre verktygen sätter fortfarande fältet", () => {
  // Mekanismen, inte bara dagens tillstånd. Tas raden bort ur något av
  // skripten slutar nya poster att få sin grund, och provet ovan skulle
  // fortsätta vara grönt tills någon råkade lägga till en post.
  const las = (p: string) => readFileSync(resolve(rot, "pipeline", p), "utf8");
  assert.match(las("scripts/anslagsbararen.mts"), /brodtext_oppen: "anslagsrad"/u);
  assert.match(las("scripts/inkomstbararen.mts"), /brodtext_oppen: "inkomstrad"/u);
  assert.match(las("src/bevisbyte.ts"), /brodtext_oppen: "manskligt_beslut"/u);
});
