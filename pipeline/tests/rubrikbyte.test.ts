/**
 * Rubrikbytet. Regeln står i `src/rubrikbyte.ts`.
 *
 * Tyngdpunkten ligger på täckningskravet, för det är det enda ledet som gör
 * verktyget till något annat än en söktext-ersättare: en rubrik som lovar mer
 * än citatet är precis det fel bytet finns för att rätta, och den ska inte
 * kunna smygas in genom samma port.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { provaRad, tackning, tillampa, type Rubrikpost, type Rubrikrad } from "../src/rubrikbyte.ts";

const CITAT =
  "Vi vill göra försöket med utflyttad trålgräns permanent och flytta trålfisket längre ut från kusten " +
  "för att skydda kustnära fiskebestånd och havsbottnen.";

const loften = new Map<string, Rubrikpost>([
  ["p-2026-2357", { id: "p-2026-2357", status: "aktiv", title: "Förbjuda skadlig trålning", quote: CITAT }],
  ["p-2026-0001", { id: "p-2026-0001", status: "tillbakadragen", title: "Något", quote: CITAT }],
]);

const rad = (o: Partial<Rubrikrad>): Rubrikrad => ({
  id: "p-2026-2357",
  rubrik: "Göra den utflyttade trålgränsen permanent",
  skal: "rubriken beskrev en annan åtgärd än citatet",
  ...o,
});

describe("rubrikbyte", () => {
  it("godtar en rubrik som har täckning i citatet", () => {
    assert.deepEqual(provaRad(rad({}), loften), { ok: true, fel: [] });
  });

  it("fäller en rubrik som lovar något citatet inte säger", () => {
    const { ok, fel } = provaRad(rad({ rubrik: "Bygga ut höghastighetsjärnväg mellan storstäderna" }), loften);
    assert.equal(ok, false);
    assert.match(fel.join(" "), /rubrikens sakord finns i citatet/u);
  });

  it("fäller en oförändrad rubrik", () => {
    const { ok, fel } = provaRad(rad({ rubrik: "Förbjuda skadlig trålning" }), loften);
    assert.equal(ok, false);
    assert.match(fel.join(" "), /oförändrad/u);
  });

  it("fäller en intern beteckning i rubriken", () => {
    const { ok, fel } = provaRad(rad({ rubrik: "Trålgränsen enligt p-2026-2250 permanentas" }), loften);
    assert.equal(ok, false);
    assert.match(fel.join(" "), /intern beteckning/u);
  });

  it("fäller ett byte utan skäl och ett byte på en indragen post", () => {
    assert.equal(provaRad(rad({ skal: "  " }), loften).ok, false);
    assert.equal(provaRad(rad({ id: "p-2026-0001", rubrik: "Skydda kustnära fiskebestånd" }), loften).ok, false);
  });

  it("täckningen jämför på stam, inte på exakt form", () => {
    // «trålgränsen» i citatet ska räknas som täckning för «trålgräns».
    assert.ok(tackning("permanent trålgräns", CITAT) > 0.9);
    assert.equal(tackning("", CITAT), 0);
  });

  it("tillampa rör bara rubriken", () => {
    const fore = loften.get("p-2026-2357")!;
    const efter = tillampa(fore, rad({}));
    assert.equal(efter.title, "Göra den utflyttade trålgränsen permanent");
    assert.equal(efter.quote, fore.quote);
    assert.equal(efter.status, fore.status);
  });
});
