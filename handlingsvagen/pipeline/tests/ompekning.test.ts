import { test } from "node:test";
import assert from "node:assert/strict";
import {
  provaOmpekning,
  pekaOm,
  malUtanKvarvarandeKoppling,
  type LoftesUppgift,
} from "../src/ompekning.ts";
import type { KopplingPost } from "../src/granskning.ts";

function koppling(over: Partial<KopplingPost> = {}): KopplingPost {
  return {
    id: "k-2026-0415",
    promise_id: "p-2026-0389",
    handling_id: "h-2026-22418",
    riktning: "stodjer",
    bevis: { citat: "Den som arbetar och gör rätt för sig ska inte utvisas." },
    method_note: "Motionen gäller kompetensutvisningar.",
    confidence: 0.9,
    status: "aktiv",
    extraction: { model: "test", verified_by: null, run_id: "test" },
    ...over,
  };
}

const FRAN: LoftesUppgift = { id: "p-2026-0389", status: "aktiv", group_id: "g-c-stoppa-kompetensutvisning" };
const TILL: LoftesUppgift = { id: "p-2026-0349", status: "aktiv", group_id: "g-c-stoppa-kompetensutvisning" };
const SKAL =
  "Samma politik som det indragna löftet. Handlingen gäller kompetensutvisningar och bokförs på den post som står kvar.";

const rad = (over: Partial<{ id: string; till: string; skal: string }> = {}) => ({
  id: "k-2026-0415",
  till: "p-2026-0349",
  skal: SKAL,
  ...over,
});

test("en giltig flytt inom samma grupp går igenom", () => {
  const svar = provaOmpekning(koppling(), FRAN, TILL, [koppling()], rad());
  assert.deepEqual(svar.fel, []);
  assert.equal(svar.ok, true);
});

test("grupplåset: en flytt till ett löfte i en annan grupp vägras", () => {
  const annan: LoftesUppgift = { id: "p-2026-0349", status: "aktiv", group_id: "g-nagot-annat" };
  const svar = provaOmpekning(koppling(), FRAN, annan, [koppling()], rad());
  assert.equal(svar.ok, false);
  assert.match(svar.fel.join(" "), /inte i samma grupp/u);
});

test("grupplåset: ett löfte utan grupp är inget mål", () => {
  const utan: LoftesUppgift = { id: "p-2026-0349", status: "aktiv", group_id: null };
  const svar = provaOmpekning(koppling(), FRAN, utan, [koppling()], rad());
  assert.equal(svar.ok, false);
  assert.match(svar.fel.join(" "), /inte i samma grupp/u);
});

test("en handling som redan är belagd på målet ska dras in, inte flyttas", () => {
  const befintlig = koppling({
    id: "k-2026-0292",
    promise_id: "p-2026-0349",
    handling_id: "h-2026-22418",
  });
  const svar = provaOmpekning(koppling(), FRAN, TILL, [koppling(), befintlig], rad());
  assert.equal(svar.ok, false);
  assert.match(svar.fel.join(" "), /ska dras in, inte flyttas/u);
});

test("ett tillbakadraget löfte är inget mål", () => {
  const dragen: LoftesUppgift = { ...TILL, status: "tillbakadragen" };
  const svar = provaOmpekning(koppling(), FRAN, dragen, [koppling()], rad());
  assert.equal(svar.ok, false);
  assert.match(svar.fel.join(" "), /status tillbakadragen/u);
});

test("en redan indragen koppling flyttas inte", () => {
  const k = koppling({ status: "indragen" });
  const svar = provaOmpekning(k, FRAN, TILL, [k], rad());
  assert.equal(svar.ok, false);
  assert.match(svar.fel.join(" "), /inte aktiv/u);
});

test("ett för kort skäl stoppar raden", () => {
  const svar = provaOmpekning(koppling(), FRAN, TILL, [koppling()], rad({ skal: "Samma sak." }));
  assert.equal(svar.ok, false);
  assert.match(svar.fel.join(" "), /minst 40 krävs/u);
});

test("en intern kod i skälet stoppar raden", () => {
  const svar = provaOmpekning(
    koppling(),
    FRAN,
    TILL,
    [koppling()],
    rad({ skal: "Flyttas enligt b-0039 eftersom politiken är densamma och handlingen står kvar." }),
  );
  assert.equal(svar.ok, false);
  assert.match(svar.fel.join(" "), /interna koden/u);
});

test("pekaOm flyttar bokföringen och lämnar beviset orört", () => {
  const ut = pekaOm(koppling(), "p-2026-0349", SKAL, "2026-08-09");
  assert.equal(ut.promise_id, "p-2026-0349");
  assert.equal(ut.handling_id, "h-2026-22418");
  assert.deepEqual(ut.bevis, koppling().bevis);
  assert.equal(ut.riktning, "stodjer");
  assert.equal(ut.status, "aktiv");
  assert.equal(ut.ompekad?.fran, "p-2026-0389");
  assert.equal(ut.ompekad?.till, "p-2026-0349");
  assert.equal(ut.ompekad?.datum, "2026-08-09");
});

test("löftet som mister sin sista koppling namnges", () => {
  const alla = [koppling()];
  const tomma = malUtanKvarvarandeKoppling(alla, new Map([["k-2026-0415", "p-2026-0349"]]));
  assert.deepEqual(tomma, ["p-2026-0389"]);
});

test("löftet som behåller en koppling namnges inte", () => {
  const alla = [koppling(), koppling({ id: "k-2026-0416", handling_id: "h-2026-22408" })];
  const tomma = malUtanKvarvarandeKoppling(alla, new Map([["k-2026-0415", "p-2026-0349"]]));
  assert.deepEqual(tomma, []);
});
