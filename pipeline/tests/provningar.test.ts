import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  kanon,
  koforslagId,
  konyckel,
  provningsGrind,
  type Provning,
  type Slag,
} from "../src/provningar.ts";

const FIXTUR = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures/provningar-kanon.json"), "utf-8"),
) as {
  kanon: { slag: Slag; obj: Record<string, unknown>; hash: string }[];
  konyckel: { url: string | null; citat: string | null; nyckel: string }[];
  koforslag_id: { post: { promise_id: string; handling_id: string }; id: string }[];
};

// ── Att de två språken räknar samma hash ──────────────────────────────
//
// Prövningarna skrivs och hashas av `logg.py` i handoff-repot; grinden här
// räknar om hashen för att se om saken ändrats sedan den prövades. Glider de
// isär ser grinden VARJE prövning som gammal och stoppar allt, medan
// `logg.py status` samtidigt påstår att täckningen är god. Fixturen är
// genererad av Python och pinnar överenskommelsen.
//
// Fällan som gjorde testet nödvändigt: Pythons `json.dumps` sätter ett
// blanksteg efter komma och kolon, `JSON.stringify` gör inte det. Inget värde
// skiljer sig — bara hashen.

test("kanon ger samma hash som logg.py", () => {
  for (const fall of FIXTUR.kanon) {
    assert.equal(
      kanon(fall.slag, fall.obj),
      fall.hash,
      `${fall.slag}: hashen skiljer sig från den logg.py räknade`,
    );
  }
});

test("konyckel ger samma nyckel som logg.py", () => {
  for (const fall of FIXTUR.konyckel) {
    assert.equal(konyckel(fall.url, fall.citat), fall.nyckel);
  }
});

test("koforslagId ger samma id som logg.py", () => {
  for (const fall of FIXTUR.koforslag_id) {
    assert.equal(koforslagId(fall.post), fall.id);
  }
});

// ── Grinden ───────────────────────────────────────────────────────────

const LOFTE = {
  quote: "Vi ska höja garantipensionen",
  title: "Höjd garantipension",
  parties: ["s"],
  status: "aktiv",
  group_id: null,
  source: { url: "https://example.se/a" },
  cost: { type: "utgift", period: "per_ar", msek_low: 1, msek_base: 2, msek_high: 3, basis: "granskare" },
};

function karta(...poster: Provning[]): Map<string, Provning> {
  return new Map(poster.map((p) => [p.id, p]));
}

function provning(over: Partial<Provning> = {}): Provning {
  return {
    id: "p-2026-0001",
    slag: "lofte",
    datum: "2026-08-07",
    utfall: "haller",
    underlag_hash: kanon("lofte", LOFTE),
    ...over,
  };
}

test("oprövat stoppas, och skälet säger hur man prövar", () => {
  const svar = provningsGrind(new Map(), ["p-2026-0001"], "lofte", LOFTE);
  assert.equal(svar.ok, false);
  assert.match(svar.ok === false ? svar.skal : "", /kvalitetsfiltret/);
  assert.match(svar.ok === false ? svar.skal : "", /underlag\.py/);
});

test("prövat och håller släpps igenom", () => {
  const svar = provningsGrind(karta(provning()), ["p-2026-0001"], "lofte", LOFTE);
  assert.equal(svar.ok, true);
});

// Hela poängen med "vägra på allt": ett löfte som är i sak riktigt men inte
// går att belägga fullt ut ska publiceras med förbehållet utskrivet, inte
// stoppas. Stoppas det bygger vi in ett skäl att hoppa över filtret.
test("håller med förbehåll släpps igenom", () => {
  const svar = provningsGrind(
    karta(provning({ utfall: "haller-med-forbehall" })),
    ["p-2026-0001"],
    "lofte",
    LOFTE,
  );
  assert.equal(svar.ok, true);
});

test("prövat och höll inte stoppas, och pekar på rättningssteget", () => {
  const svar = provningsGrind(
    karta(provning({ utfall: "haller-inte" })),
    ["p-2026-0001"],
    "lofte",
    LOFTE,
  );
  assert.equal(svar.ok, false);
  assert.match(svar.ok === false ? svar.skal : "", /fa-det-att-halla/);
});

test("ändrat belopp gör prövningen gammal och stoppar posten", () => {
  const andrat = { ...LOFTE, cost: { ...LOFTE.cost, msek_base: 999 } };
  const svar = provningsGrind(karta(provning()), ["p-2026-0001"], "lofte", andrat);
  assert.equal(svar.ok, false);
  assert.match(svar.ok === false ? svar.skal : "", /ändrats/);
});

// Prövningen sker på kö-posten, men id:t mintas först i beslutet. Hittar
// grinden bara det ena av dem faller varje godkännande som gick den vägen.
test("kö-nyckeln duger när det publicerade id:t saknas", () => {
  const nyckel = konyckel("https://example.se/a", LOFTE.quote);
  const svar = provningsGrind(
    karta(provning({ id: nyckel })),
    ["p-2026-0001", nyckel],
    "lofte",
    LOFTE,
  );
  assert.equal(svar.ok, true);
});
