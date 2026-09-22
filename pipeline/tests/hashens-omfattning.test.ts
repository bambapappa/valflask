/**
 * Vad prövningens hash faktiskt binder — och vad den inte binder.
 *
 * `provningsGrind` släpper igenom en sak vars `underlag_hash` stämmer med
 * `kanon()` av dagens innehåll. Ändras något `kanon()` INTE läser, står
 * prövningen kvar som aktuell fast den beskriver en annan version. Det är
 * ingen teoretisk risk: `anchor_ids` ändras av ett eget skript
 * (`ankarsattning.mts`) på publicerade löften, och 188 aktiva löften bär
 * ankare i dag.
 *
 * Proven nedan gör två saker.
 *
 * 1. **De pinnar luckan.** Varje fält som uppgiften pekar ut — ankare,
 *    finansiering, aktör, löftestyp — får ett prov som visar att hashen är
 *    oförändrad när fältet ändras. De proven beskriver LÄGET, inte önskemålet.
 *    När ett mänskligt beslut lägger fältet i `kanon()` — och i `logg.py`, som
 *    måste räkna samma hash — vänds påståendet i samma pass. Kostnaden för det
 *    beslutet är att samtliga 6 059 löftesprövningar blir gamla på en gång.
 *
 * 2. **De hindrar att luckan växer.** Fältlistan i `promises.schema.json`
 *    jämförs mot summan av det hashade och det medvetet undantagna. Ett nytt
 *    fält som varken hashas eller är uppskrivet fäller provet, och då är
 *    frågan ställd innan fältet finns i publicerat data.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { kanon, provningsGrind, type Provning } from "../src/provningar.ts";

const REPO = join(import.meta.dirname, "../..");

/** Ett minimalt löfte i den form `kanon` läser det. */
const LOFTE: Record<string, unknown> = {
  id: "p-2026-0001",
  title: "Ett löfte",
  quote: "Vi lovar en sak.",
  parties: ["s"],
  person: null,
  status: "aktiv",
  group_id: null,
  loftestyp: "reform",
  source: { url: "https://example.test/artikel/" },
  financing_claimed: { described: false, summary: null, msek: null },
  cost: {
    type: "utgift", period: "per_ar",
    msek_low: 1, msek_base: 2, msek_high: 3,
    basis: "granskare", calculation: "en uträkning", anchor_ids: [],
  },
};

function provningFor(obj: Record<string, unknown>): Map<string, Provning> {
  return new Map([[
    "p-2026-0001",
    { id: "p-2026-0001", slag: "lofte", datum: "2026-09-01", utfall: "haller", underlag_hash: kanon("lofte", obj) },
  ]]);
}

/** Samma löfte med ett fält bytt, utan att röra originalet. */
function med(andring: Record<string, unknown>): Record<string, unknown> {
  return { ...structuredClone(LOFTE), ...andring };
}

describe("prövningens hash följer det den uttalar sig om", () => {
  // Kontrollprov: utan det här kan proven nedan vara gröna för att mätaren är
  // trasig, inte för att fälten saknas i hashen.
  test("ett ändrat belopp gör prövningen gammal", () => {
    const provningar = provningFor(LOFTE);
    const andrat = med({ cost: { ...(LOFTE["cost"] as object), msek_base: 99 } });
    const svar = provningsGrind(provningar, ["p-2026-0001"], "lofte", andrat);
    assert.equal(svar.ok, false);
    assert.match(svar.ok === false ? svar.skal : "", /ändrat/u);
  });

  test("en ändrad period gör prövningen gammal", () => {
    const provningar = provningFor(LOFTE);
    const andrat = med({ cost: { ...(LOFTE["cost"] as object), period: "engang" } });
    assert.equal(provningsGrind(provningar, ["p-2026-0001"], "lofte", andrat).ok, false);
  });
});

describe("fält som ändras utan att prövningen blir gammal", () => {
  const luckor: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ["ankare", { cost: { ...(LOFTE["cost"] as object), anchor_ids: ["p-2026-4711"] } }],
    ["finansiering", { financing_claimed: { described: true, summary: "höjd skatt", msek: 500 } }],
    ["aktör", { person: { name: "En talesperson", party: "s" } }],
    ["löftestyp", { loftestyp: "inriktning" }],
  ];

  for (const [namn, andring] of luckor) {
    // VÄNDS när fältet läggs i kanon(): då ska hashen ändras och grinden fälla.
    test(`${namn} ändras — hashen är oförändrad och grinden släpper igenom`, () => {
      const provningar = provningFor(LOFTE);
      const andrat = med(andring);
      assert.notDeepEqual(andrat, LOFTE, "ändringen ska vara verklig");
      assert.equal(kanon("lofte", andrat), kanon("lofte", LOFTE), `${namn} ingår inte i hashen`);
      assert.equal(provningsGrind(provningar, ["p-2026-0001"], "lofte", andrat).ok, true);
    });
  }

  test("kopplingens motionstyp och tillit ligger utanför hashen", () => {
    const koppling: Record<string, unknown> = {
      id: "k-2026-0001", promise_id: "p-2026-0001", handling_id: "h-2026-0001",
      riktning: "stodjer", status: "aktiv", motionstyp: "enskild", confidence: 0.9,
      bevis: { citat: "Riksdagen ställer sig bakom det som anförs." },
    };
    const andrat = { ...koppling, motionstyp: "kommitte", confidence: 0.3 };
    assert.equal(kanon("koppling", andrat), kanon("koppling", koppling));
    // Riktningen ingår — kontrollprovet för samma mätare.
    assert.notEqual(kanon("koppling", { ...koppling, riktning: "bryter" }), kanon("koppling", koppling));
  });
});

describe("luckan får inte växa", () => {
  /** Fält `kanon()` läser för ett löfte. Håll jämn med src/provningar.ts. */
  const HASHADE = ["quote", "title", "parties", "status", "group_id", "source", "cost"] as const;

  /** Fält som medvetet står utanför hashen, med skälet utskrivet. */
  const UNDANTAGNA: Record<string, string> = {
    id: "identiteten, inte påståendet",
    slug: "härleds ur rubriken",
    history: "ändringshistorik säger inget om påståendet",
    extraction: "modell och körning, inte sak",
    comparisons: "räknas fram ur beloppet",
    quip: "kommentar, inte påstående",
    date_stated: "LUCKA — ett bytt datum åldrar inte prövningen",
    category: "LUCKA — en flyttad kategori åldrar inte prövningen",
    person: "LUCKA — aktören kan bytas utan att prövningen blir gammal",
    loftestyp: "LUCKA — reform kan bli inriktning utan att prövningen blir gammal",
    financing_claimed: "LUCKA — finansieringen kan beskrivas utan att prövningen blir gammal",
  };

  test("varje fält i schemat är antingen hashat eller uppskrivet som undantag", () => {
    const schema = JSON.parse(
      readFileSync(join(REPO, "pipeline/schemas/promises.schema.json"), "utf8"),
    ) as { items?: { properties?: Record<string, unknown> }; properties?: Record<string, unknown> };
    const falt = Object.keys(schema.items?.properties ?? schema.properties ?? {});
    assert.ok(falt.length > 0, "schemat ska ha fält");
    const kanda = new Set<string>([...HASHADE, ...Object.keys(UNDANTAGNA)]);
    const okanda = falt.filter((f) => !kanda.has(f));
    assert.deepEqual(
      okanda,
      [],
      `Nya fält i schemat: ${okanda.join(", ")}. Avgör om de ska ingå i kanon() — ` +
        "och skriv in dem här med skälet, antingen som hashade eller som undantag.",
    );
  });

  test("kalkylens fält är också uppdelade", () => {
    const HASHADE_KOSTNAD = ["type", "period", "msek_low", "msek_base", "msek_high", "basis", "calculation"];
    const UNDANTAGNA_KOSTNAD: Record<string, string> = {
      confidence: "tilltro, inte påstående",
      method_note: "beskriver metoden, inte beloppet",
      basis_url: "LUCKA — källan till grunden kan bytas utan att prövningen blir gammal",
      anchor_ids: "LUCKA — ankaret kan bytas utan att prövningen blir gammal",
    };
    const schema = JSON.parse(
      readFileSync(join(REPO, "pipeline/schemas/promises.schema.json"), "utf8"),
    ) as { items?: { properties?: { cost?: { properties?: Record<string, unknown> } } } };
    const falt = Object.keys(schema.items?.properties?.cost?.properties ?? {});
    assert.ok(falt.length > 0);
    const kanda = new Set([...HASHADE_KOSTNAD, ...Object.keys(UNDANTAGNA_KOSTNAD)]);
    assert.deepEqual(falt.filter((f) => !kanda.has(f)), []);
  });
});
