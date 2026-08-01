import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAGE_A_FONSTER,
  normalizeForVerbatim,
  provaGrindarna,
  type GrindKontext,
  type KopplingsForslag,
} from "../src/grindar.ts";
import type { Handling } from "../src/handlingar.ts";

const motion: Handling = {
  id: "h-2026-0001",
  kind: "motion",
  dok_id: "HD021234",
  datum: "2024-10-03",
  parties: ["v"],
  persons: [{ name: "Lorena Delgado Varas", party: "v", riksdagen_id: "0852475703226" }],
  titel: "Höjd a-kassa nu",
  url: "https://data.riksdagen.se/dokument/HD021234",
  archive_url: null,
};

const votering: Handling = {
  id: "h-2026-0002",
  kind: "votering",
  dok_id: "202425:AU10",
  votering_id: "V-9",
  punkt: 3,
  datum: "2025-03-12",
  parties: ["m", "s"],
  persons: [],
  titel: "Votering AU10 punkt 3 (2024/25)",
  url: "https://data.riksdagen.se/votering/V-9",
  archive_url: null,
  utfall: "bifall",
  rostfordelning: {
    s: { ja: 90, nej: 0, avstar: 0, franvarande: 17 },
    m: { ja: 0, nej: 60, avstar: 0, franvarande: 8 },
  },
};

const kalltext =
  "Riksdagen ställer sig bakom det som anförs i motionen om att taket i\n" +
  "arbetslöshetsförsäkringen bör höjas till 1 500 kronor per dag och\n" +
  "tillkännager detta för regeringen.";

function forslag(over: Partial<KopplingsForslag> = {}): KopplingsForslag {
  return {
    promise_id: "p-2026-0001",
    handling_id: "h-2026-0001",
    riktning: "stodjer",
    bevis: { citat: "taket i arbetslöshetsförsäkringen bör höjas till 1 500 kronor per dag" },
    motionstyp: "kommitte",
    method_note: "Motionens att-sats kräver samma takhöjning som löftet.",
    confidence: 0.9,
    ...over,
  };
}

function ctx(over: Partial<GrindKontext> = {}): GrindKontext {
  return { handling: motion, kalltext, malPartier: ["v"], fonster: LAGE_A_FONSTER, ...over };
}

test("normalizeForVerbatim: typografi neutraliseras, skiftläge bevaras", () => {
  assert.equal(normalizeForVerbatim("”Höjt tak” – nu…"), '"Höjt tak" - nu...');
  assert.notEqual(normalizeForVerbatim("HÖJT TAK"), normalizeForVerbatim("höjt tak"));
});

test("rent förslag passerar H1–H5 men är bara redo för granskning", () => {
  assert.deepEqual(provaGrindarna(forslag(), ctx()), []);
});

test("H1 fäller okänd handling", () => {
  const fel = provaGrindarna(forslag({ handling_id: "h-9999-9999" }), ctx({ handling: undefined }));
  assert.ok(fel.some((f) => f.grind === "H1"));
});

test("H2 fäller citat som inte står ordagrant i källtexten", () => {
  const fel = provaGrindarna(forslag({ bevis: { citat: "taket bör höjas till 2 000 kronor per dag" } }), ctx());
  assert.deepEqual(fel.map((f) => f.grind), ["H2"]);
});

test("H2 godtar typografiska olikheter men inte innehållsskillnad", () => {
  const typografi = ctx({ kalltext: kalltext.replace("1 500", "1 500").replace(/\n/gu, " ") });
  assert.deepEqual(provaGrindarna(forslag(), typografi), []);
  const skiftlage = forslag({ bevis: { citat: "Taket i arbetslöshetsförsäkringen bör höjas till 1 500 kronor per dag" } });
  assert.ok(provaGrindarna(skiftlage, ctx()).some((f) => f.grind === "H2")); // versal ändrad — ordagrant är ordagrant
});

test("H2 fäller för kort citat", () => {
  const fel = provaGrindarna(forslag({ bevis: { citat: "bör höjas" } }), ctx());
  assert.ok(fel.some((f) => f.grind === "H2"));
});

test("H3 fäller fel parti och tom partiuppgift", () => {
  assert.ok(provaGrindarna(forslag(), ctx({ malPartier: ["sd"] })).some((f) => f.grind === "H3"));
  const tomHandling = { ...motion, parties: [] };
  assert.ok(provaGrindarna(forslag(), ctx({ handling: tomHandling })).some((f) => f.grind === "H3"));
});

test("H3 prövar votering mot röstfördelningens partier", () => {
  const f = forslag({ handling_id: "h-2026-0002" });
  delete f.motionstyp;
  assert.deepEqual(provaGrindarna(f, ctx({ handling: votering, malPartier: ["s"] })), []);
  assert.ok(provaGrindarna(f, ctx({ handling: votering, malPartier: ["kd"] })).some((x) => x.grind === "H3"));
});

test("H3 räknar fråga på frågeställaren, inte den tillfrågade ministern", () => {
  // Riksdagsdatan listar både frågeställaren (V) och den tillfrågade
  // ministern (M), så handling.parties rymmer båda. Bara V är aktör.
  const fraga: Handling = {
    id: "h-2026-0003",
    kind: "skriftlig_fraga",
    dok_id: "HB02123",
    datum: "2024-11-10",
    parties: ["m", "v"],
    persons: [
      { name: "Lorena Delgado Varas", party: "v", riksdagen_id: "1" },
      { name: "Justitieminister Gunnar Strömmer", party: "m", riksdagen_id: "2" },
    ],
    titel: "Fråga om taket i a-kassan",
    url: "https://data.riksdagen.se/dokument/HB02123",
    archive_url: null,
  };
  const f = forslag({ handling_id: "h-2026-0003" });
  delete f.motionstyp;
  // Frågeställaren är V → V-löfte passerar aktörskravet
  assert.deepEqual(provaGrindarna(f, ctx({ handling: fraga, malPartier: ["v"] })), []);
  // M finns bara som tillfrågad minister → M-löfte fälls av H3
  assert.ok(provaGrindarna(f, ctx({ handling: fraga, malPartier: ["m"] })).some((x) => x.grind === "H3"));
});

test("H4 fäller datum utanför Läge A-fönstret", () => {
  const gammal = { ...motion, datum: "2021-01-15" };
  const fel = provaGrindarna(forslag(), ctx({ handling: gammal }));
  assert.ok(fel.some((f) => f.grind === "H4"));
});

test("H5 fäller tom metodnot, orimlig confidence och motion utan motionstyp", () => {
  assert.ok(provaGrindarna(forslag({ method_note: "  " }), ctx()).some((f) => f.grind === "H5"));
  assert.ok(provaGrindarna(forslag({ confidence: 1.2 }), ctx()).some((f) => f.grind === "H5"));
  const utanTyp = forslag();
  delete utanTyp.motionstyp;
  assert.ok(provaGrindarna(utanTyp, ctx()).some((f) => f.grind === "H5"));
});

test("H5 kräver att förslaget pekar på löfte eller ståndpunkt", () => {
  const utan = forslag();
  delete utan.promise_id;
  assert.ok(provaGrindarna(utan, ctx()).some((f) => f.grind === "H5"));
});
