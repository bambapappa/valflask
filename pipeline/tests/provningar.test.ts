import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  kanon,
  koforslagId,
  konyckel,
  provningsGrind,
  standpunktNyckel,
  type Provning,
  type Slag,
} from "../src/provningar.ts";

const FIXTUR = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures/provningar-kanon.json"), "utf-8"),
) as {
  kanon: { slag: Slag; obj: Record<string, unknown>; hash: string }[];
  konyckel: { url: string | null; citat: string | null; nyckel: string }[];
  koforslag_id: { post: { promise_id: string; handling_id: string }; id: string }[];
  standpunkt_nyckel: {
    url: string | null;
    sq: string | null;
    parti: string | null;
    citat: string | null;
    nyckel: string;
  }[];
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

test("standpunktNyckel ger samma nyckel som logg.py", () => {
  for (const fall of FIXTUR.standpunkt_nyckel) {
    assert.equal(standpunktNyckel(fall.url, fall.sq, fall.parti, fall.citat), fall.nyckel);
  }
});

// ── Att en ståndpunkts hash bär beskedet, inte bara cellens adress ─────
//
// Fram till 2026-08-09 läste hashen `current.position` och `current.statement_id`
// medan både kö-posten och godkännandets objekt bar citatet platt. Följden var
// två fel på en gång: hashen täckte i praktiken bara delfråga och parti, så
// grinden släppte igenom vilket besked och vilket citat som helst — och
// `statement_id` mintas i godkännandet, så prövningen blev gammal i samma stund
// beslutet verkställdes. Fem godkända ståndpunkter stod som inaktuella dagen
// efter att de publicerats.

const STANDPUNKT_PUBLICERAD = {
  subquestion_id: "sq-01",
  party: "mp",
  current: { position: "ja", statement_id: "st-9" },
  statements: [
    { id: "st-8", position: "nej", condition_note: null, quote: "Ett gammalt besked", source: { url: "https://example.se/gammal" } },
    { id: "st-9", position: "ja", condition_note: "gäller från 2027", quote: "Vi vill införa det", source: { url: "https://example.se/ny#page=3" } },
  ],
};

const STANDPUNKT_I_KO = {
  id: "sq-01/mp",
  subquestion_id: "sq-01",
  party: "mp",
  position: "ja",
  quote: "Vi vill införa det",
  condition_note: "gäller från 2027",
  source: { url: "https://example.se/ny#page=3", archive_url: "https://web.archive.org/x" },
  date_stated: "2026-05-01",
};

test("kö-postens hash överlever publiceringen", () => {
  assert.equal(
    kanon("standpunkt", STANDPUNKT_I_KO),
    kanon("standpunkt", STANDPUNKT_PUBLICERAD),
    "samma besked i kö-form och publicerad form måste ge samma hash — annars\n" +
      "blir varje prövning gammal av själva godkännandet",
  );
});

test("ett annat citat på samma cell ger en annan hash", () => {
  assert.notEqual(
    kanon("standpunkt", { ...STANDPUNKT_I_KO, quote: "Vi vill utreda det" }),
    kanon("standpunkt", STANDPUNKT_I_KO),
    "hashen måste bära citatet, annars vaktar grinden ingenting",
  );
});

test("en annan riktning på samma cell ger en annan hash", () => {
  assert.notEqual(
    kanon("standpunkt", { ...STANDPUNKT_I_KO, position: "nej" }),
    kanon("standpunkt", STANDPUNKT_I_KO),
  );
});

test("ett bytt besked i cellen gör prövningen gammal", () => {
  // Cellen pekas om till det äldre uttalandet: samma delfråga, samma parti,
  // annan riktning och ett annat citat. En prövning av det nya beskedet får
  // inte fortsätta gälla.
  const ompekad = { ...STANDPUNKT_PUBLICERAD, current: { position: "nej", statement_id: "st-8" } };
  assert.notEqual(kanon("standpunkt", ompekad), kanon("standpunkt", STANDPUNKT_PUBLICERAD));
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
