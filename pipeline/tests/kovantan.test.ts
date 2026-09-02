/**
 * Grinden som skulle ha sett att köerna stod stilla.
 *
 * FÄLLS AV: att räkna antalet i stället för väntan, att låta en post utan
 * datum räknas som gammal, eller att höja taket.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dygn, vantan, domVantan, TAK_DYGN } from "../src/kovantan.ts";

const NU = new Date("2026-09-02T12:00:00Z");
const provad = (n: string) => n === "ko:provad";

test("dygn räknar nedåt och aldrig bakåt", () => {
  assert.equal(dygn("2026-09-02T00:00:00Z", NU), 0);
  assert.equal(dygn("2026-08-26T11:00:00Z", NU), 7);
  assert.equal(dygn("2026-08-26T13:00:00Z", NU), 6, "sex dygn och 23 timmar är sex dygn");
  // En stämpel i framtiden är en trasig klocka, inte en negativ väntan.
  assert.equal(dygn("2026-09-09T00:00:00Z", NU), 0);
  // Skräp ska inte kasta — då hade en enda trasig rad stoppat hela mätningen.
  assert.equal(dygn("inget datum", NU), 0);
});

test("bara oprövade räknas, och den äldsta pekas ut", () => {
  const v = vantan(
    [
      { nyckel: "ko:provad", skapad: "2026-01-01T00:00:00Z" },
      { nyckel: "ko:ny", skapad: "2026-09-01T00:00:00Z" },
      { nyckel: "ko:gammal", skapad: "2026-08-20T00:00:00Z" },
    ],
    provad,
    NU,
  );
  assert.deepEqual(v, { oprovade: 2, summa: 3, dagar: 13, aldst: "ko:gammal" });
});

test("en post utan datum räknas som oprövad men aldrig som gammal", () => {
  // Ett saknat fält är ingen mätning. Räknades det som noll dygn vore det ett
  // tyst godkännande; räknades det som oändligt vore det en påhittad väntan.
  const v = vantan([{ nyckel: "ko:a", skapad: null }, { nyckel: "ko:b", skapad: undefined }], provad, NU);
  assert.equal(v.oprovade, 2);
  assert.equal(v.dagar, null);
  assert.deepEqual(domVantan(v, "kön"), { ok: true });
});

test("en tom kö och en helt prövad kö går igenom", () => {
  assert.deepEqual(domVantan(vantan([], provad, NU), "kön"), { ok: true });
  assert.deepEqual(
    domVantan(vantan([{ nyckel: "ko:provad", skapad: "2026-01-01T00:00:00Z" }], provad, NU), "kön"),
    { ok: true },
  );
});

test("taket fäller vid sex dygn men inte vid fem", () => {
  const post = (skapad: string) => [{ nyckel: "ko:x", skapad }];
  const fem = domVantan(vantan(post("2026-08-28T12:00:00Z"), provad, NU), "kön");
  assert.equal(fem.ok, true, "fem dygn är inom taket");
  const sex = domVantan(vantan(post("2026-08-27T12:00:00Z"), provad, NU), "kön");
  assert.equal(sex.ok, false);
  assert.match((sex as { skal: string }).skal, /6 dygn/u);
  assert.match((sex as { skal: string }).skal, /taket höjs inte/u);
});

test("taket biter på det läge det skrevs för", () => {
  // Den längsta väntan i kopplingskön 2026-09-02 var sju dygn. Ett tak som
  // släpper igenom just det fallet är inget tak — det är därför talet är fem
  // och inte sju, och det är därför det står som ett eget prov.
  const drift = vantan([{ nyckel: "ko:x", skapad: "2026-08-26T07:51:59Z" }], provad, NU);
  assert.equal(drift.dagar, 7);
  assert.equal(domVantan(drift, "kopplingskön").ok, false, "sju dygns väntan ska fällas");
  assert.equal(TAK_DYGN, 5);
});
