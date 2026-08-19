import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { arDatumdom, inomFonstret } from "../scripts/datumgrind-omprovning.mts";
import { DATE_WINDOW_DAYS } from "../src/gates.ts";

describe("datumgrindens omprövning", () => {
  test("bara datumdomen väljs — inte beloppets", () => {
    // G4 bär två slags domar. Bara den som vilar på källans datum får strykas;
    // stryks beloppsdomen med släpper skriptet igenom en post ingen prövat.
    assert.equal(
      arDatumdom({
        gate: "G4",
        reason:
          "Publiceringsdatum 2012-10-17T09:30:02.000Z ligger 5053 dygn från körningen — fönstret är ±548 dygn (≈18 mån)",
      }),
      true,
    );
    assert.equal(arDatumdom({ gate: "G4", reason: "Beloppet är inte ett ändligt tal" }), false);
    assert.equal(
      arDatumdom({ gate: "G4", reason: 'Källans publiceringsdatum går inte att tolka: "i går"' }),
      false,
    );
    // Andra grindar rörs inte, hur domen än är formulerad.
    assert.equal(
      arDatumdom({ gate: "G3", reason: "Publiceringsdatum 2012-10-17 — fönstret är ±548 dygn" }),
      false,
    );
    assert.equal(arDatumdom({}), false);
  });

  test("fönstret mäts åt båda håll och stänger på gränsen", () => {
    const nu = new Date("2026-08-19T12:00:00.000Z");
    const dygn = 86_400_000;
    const iso = (d: number) => new Date(nu.getTime() + d).toISOString();

    assert.equal(inomFonstret(iso(0), nu), true);
    assert.equal(inomFonstret(iso(-(DATE_WINDOW_DAYS - 1) * dygn), nu), true);
    assert.equal(inomFonstret(iso(-(DATE_WINDOW_DAYS + 1) * dygn), nu), false);
    // Ett framtidsdatum ligger lika långt utanför som ett lika gammalt.
    assert.equal(inomFonstret(iso((DATE_WINDOW_DAYS + 1) * dygn), nu), false);
    assert.equal(inomFonstret("i går", nu), false);
  });

  test("det verkliga fallet: skapandedatum föll, uppdateringsdatum håller", () => {
    // Miljöpartiets djursida — skapad 2021, omskriven 2026-06-23.
    const nu = new Date("2026-08-19T12:00:00.000Z");
    assert.equal(inomFonstret("2021-11-19T13:16:50+01:00", nu), false);
    assert.equal(inomFonstret("2026-06-23T11:53:39+02:00", nu), true);
  });
});
