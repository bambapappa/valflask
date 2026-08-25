/**
 * Att hitta ankaret ur uträkningens egna tal. Regeln står i `src/ankarkravet.ts`.
 *
 * Kön kunde inte producera ett lånat belopp som klarade båda grinderna: skrivs
 * numret ut fälls posten av spärren mot interna beteckningar, skrivs det inte
 * ut bryter den mot ankarkravet. 45 löften publicerades 2026-08-25 rakt in i
 * skulden. `anchor_ids` är vägen ut — ett fält, inte prosa.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { harledAnkare } from "../src/ankarkravet.ts";

const j = [
  { id: "p-2026-0001", msek_base: 8000 },
  { id: "p-2026-0002", msek_base: 300 },
  { id: "p-2026-0003", msek_base: 8000 },
];

describe("ankaret härleds ur beloppet i texten", () => {
  it("ett jämförbart löftes belopp i texten pekar ut det", () => {
    assert.deepEqual(
      harledAnkare("Jämförbart löfte anger 300 mkr per år, och nivån antas densamma.", j.slice(0, 2)),
      ["p-2026-0002"],
    );
  });

  it("miljarder och miljoner är samma tal", () => {
    assert.deepEqual(
      harledAnkare("Jämförbart löfte anger 8 mdkr/år.", [j[0]!]),
      ["p-2026-0001"],
    );
  });

  it("tusenavskiljare räknas bort", () => {
    assert.deepEqual(
      harledAnkare("Jämförbara löften ligger på 8 000 mkr.", [j[0]!]),
      ["p-2026-0001"],
    );
  });

  /** Två löften på samma belopp: talet säger inte vilket, och då gissas inte. */
  it("två jämförbara på samma belopp ger inget ankare", () => {
    assert.deepEqual(harledAnkare("Jämförbart löfte anger 8 mdkr/år.", j), []);
  });

  it("ett tal som inget jämförbart löfte bär ger inget ankare", () => {
    assert.deepEqual(harledAnkare("Jämförbart löfte anger 55 mkr.", j), []);
  });

  it("en uträkning som inte lånar får inget ankare", () => {
    assert.deepEqual(harledAnkare("1 000 hushåll × 300 mkr = 300 mkr.", j), []);
  });

  it("en tom uträkning ger inget ankare", () => {
    assert.deepEqual(harledAnkare(null, j), []);
    assert.deepEqual(harledAnkare("", j), []);
  });

  it("samma löfte två gånger i listan räknas som ett", () => {
    assert.deepEqual(
      harledAnkare("Jämförbart löfte anger 300 mkr.", [j[1]!, { id: "p-2026-0002", msek_base: 300 }]),
      ["p-2026-0002"],
    );
  });
});
