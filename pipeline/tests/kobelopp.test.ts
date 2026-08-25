/**
 * Kostnaden som granskarens belopp ger kö-posten. Regeln står i
 * `src/kobelopp.ts`, och den speglar `approve()`:s egen konstruktion.
 *
 * 231 beslut satt fast 2026-08-25 därför att prövningen skrevs mot kö-posten
 * medan `approve()` byggde en annan kostnad. Provet låser fast att de två
 * bygger samma sak.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { koKostnad } from "../src/kobelopp.ts";

const fore = {
  type: "intäktsminskning", period: "engang",
  msek_low: 1, msek_base: 2, msek_high: 3,
  basis: "llm_estimat", basis_url: "https://ex.se",
  method_note: "Beskrivning av ett annat tal.",
  calculation: "Gammal uträkning.", confidence: 0.35,
  anchor_ids: ["p-2026-0001"],
};

describe("granskarens belopp på kö-posten", () => {
  const ny = koKostnad(fore, { low: 10, bas: 20, high: 30 }, "  Ny uträkning.  ");

  it("talen är granskarens, avrundade", () => {
    assert.equal(ny.msek_low, 10);
    assert.equal(ny.msek_base, 20);
    assert.equal(ny.msek_high, 30);
  });

  it("kostnadstyp och period ärvs — granskaren satte bara talet", () => {
    assert.equal(ny.type, "intäktsminskning");
    assert.equal(ny.period, "engang");
  });

  it("basis blir granskare — etiketten får inte påstå att modellen står bakom talet", () => {
    assert.equal(ny.basis, "granskare");
    assert.equal(ny.basis_url, null);
  });

  it("noten beskriver det NYA beloppet, inte det gamla", () => {
    assert.equal(ny.method_note, "(belopp satt av granskare)");
    assert.doesNotMatch(String(ny.method_note), /ett annat tal/u);
  });

  it("uträkningen är granskarens text", () => {
    assert.equal(ny.calculation, "  Ny uträkning.  ");
  });

  it("ankaret följer inte med — det hörde till beloppet som ersattes", () => {
    assert.deepEqual(ny["anchor_ids"], []);
  });

  it("utan tidigare kostnad blir det utgift per år", () => {
    const tom = koKostnad(null, { low: 0, bas: 5, high: 9 }, "x");
    assert.equal(tom.type, "utgift");
    assert.equal(tom.period, "per_ar");
  });

  it("decimaler avrundas, precis som vid godkännandet", () => {
    const r = koKostnad(fore, { low: 1.4, bas: 2.5, high: 3.6 }, "x");
    assert.equal(r.msek_low, 1);
    assert.equal(r.msek_base, 3);
    assert.equal(r.msek_high, 4);
  });
});
