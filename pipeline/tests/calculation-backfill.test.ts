import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { triage, markReconstructed } from "../scripts/calculation-backfill.mts";
import type { CostEstimate } from "../src/cost.ts";

function cost(low: number, base: number, high: number): CostEstimate {
  return {
    type: "utgift", period: "per_ar",
    msek_low: low, msek_base: base, msek_high: high,
    basis: "llm_estimat", basis_url: null, method_note: "x", confidence: 0.4,
  };
}

describe("triage — nära vs avvikande estimat", () => {
  it("nytt inom publicerat spann → nära", () => {
    assert.equal(triage(cost(4000, 7000, 12000), 9000).near, true);
  });
  it("nytt utanför spann men inom faktortröskeln → nära", () => {
    // publicerat 1000, nytt 1400 (1,4×) < 1,5
    assert.equal(triage(cost(900, 1000, 1100), 1400).near, true);
  });
  it("nytt avviker kraftigt → ej nära", () => {
    const t = triage(cost(400, 500, 700), 5000);
    assert.equal(t.near, false);
    assert.match(t.reason, /avviker/);
  });
  it("båda 0 → nära", () => {
    assert.equal(triage(cost(0, 0, 0), 0).near, true);
  });
  it("0-skifte (publicerat 0, nytt > 0) → ej nära", () => {
    const t = triage(cost(0, 0, 0), 3000);
    assert.equal(t.near, false);
    assert.match(t.reason, /0-skifte/);
  });
  it("symmetrisk faktor (nytt lägre) fångas", () => {
    // publicerat 5000, nytt 1000 → 5× under
    assert.equal(triage(cost(4000, 5000, 6000), 1000).near, false);
  });
});

describe("markReconstructed", () => {
  it("märker öppet och kapar till 800 tecken", () => {
    const s = markReconstructed("antag ~500 mkr");
    assert.match(s, /^Rekonstruerad i efterhand/);
    assert.ok(s.includes("antag ~500 mkr"));
    assert.ok(markReconstructed("x".repeat(1000)).length <= 800);
  });
});
