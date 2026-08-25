/**
 * Byte av uträkning på ett publicerat löfte. Regeln står i
 * `src/utrakningsbyte.ts`.
 *
 * De två prov som bär modulen är också de två skäl den finns:
 *
 *   · BELOPPET RÖRS ALDRIG. Verktyget rättar texten om ett tal, inte talet.
 *   · DEN NYA TEXTEN MÅSTE LEDA FRAM TILL DET PUBLICERADE TALET. Annars är
 *     motsägelsen kvar, bara omformulerad — och det var motsägelsen som var
 *     felet.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { provaUtrakningsrad, tillampa, type Utrakningspost } from "../src/utrakningsbyte.ts";

const post: Utrakningspost = {
  id: "p-2026-0001",
  status: "aktiv",
  title: "Ett löfte",
  cost: { msek_low: 300, msek_base: 600, msek_high: 750, calculation: "Gammal text. Bas 300 msek." },
};
const loften = new Map([[post.id, post]]);
const skal = "Sista meningen var ett äldre utkast och motsade det publicerade talet.";

describe("uträkningen ska leda fram till det publicerade beloppet", () => {
  it("släpper igenom en text som namnger basbeloppet", () => {
    const p = provaUtrakningsrad(
      { id: "p-2026-0001", utrakning: "Avgiftsbortfall och utbyggnad. Bas 600 miljoner kronor per år.", skal },
      loften,
    );
    assert.deepEqual(p.fel, []);
  });

  it("fäller en text som leder till ett annat tal", () => {
    const p = provaUtrakningsrad(
      { id: "p-2026-0001", utrakning: "Avgiftsbortfall och utbyggnad. Bas 300 miljoner kronor per år.", skal },
      loften,
    );
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /leder till 300 men det publicerade basbeloppet är 600/u);
  });

  it("fäller en text som inte namnger något basbelopp alls", () => {
    const p = provaUtrakningsrad(
      { id: "p-2026-0001", utrakning: "Det här kostar en hel del pengar varje år.", skal },
      loften,
    );
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /namnger inget basbelopp/u);
  });
});

describe("spärrarna", () => {
  it("fäller en intern beteckning i texten som möter läsaren", () => {
    const p = provaUtrakningsrad(
      { id: "p-2026-0001", utrakning: "Samma nivå som p-2026-0357. Bas 600 miljoner kronor.", skal },
      loften,
    );
    assert.match(p.fel.join(" "), /intern beteckning/u);
  });

  it("fäller en oförändrad text", () => {
    const p = provaUtrakningsrad(
      { id: "p-2026-0001", utrakning: "Gammal text. Bas 300 msek.", skal },
      loften,
    );
    assert.match(p.fel.join(" "), /oförändrad/u);
  });

  it("fäller ett för kort skäl", () => {
    const p = provaUtrakningsrad(
      { id: "p-2026-0001", utrakning: "Bas 600 miljoner kronor per år.", skal: "fel" },
      loften,
    );
    assert.match(p.fel.join(" "), /minst 40 krävs/u);
  });

  it("fäller ett löfte som inte finns", () => {
    const p = provaUtrakningsrad({ id: "p-2026-9999", utrakning: "x", skal }, loften);
    assert.match(p.fel.join(" "), /finns inte/u);
  });
});

describe("bytet verkställt", () => {
  it("beloppet står stilla — verktyget rör aldrig talet", () => {
    const ny = tillampa(post, { id: post.id, utrakning: "  Bas 600 miljoner kronor.  ", skal });
    assert.equal(ny.cost.msek_low, 300);
    assert.equal(ny.cost.msek_base, 600);
    assert.equal(ny.cost.msek_high, 750);
    assert.equal(ny.cost.calculation, "Bas 600 miljoner kronor.");
  });
});
