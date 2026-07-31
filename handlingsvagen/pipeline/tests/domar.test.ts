import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePartiDomar,
  computeLedamotMeriter,
  partilinjeIVotering,
  type Koppling,
} from "../src/domar.ts";
import type { Handling } from "../src/handlingar.ts";
import type { RdVoteringRad } from "../src/riksdagen.ts";

const votering: Handling = {
  id: "h-2026-0001",
  kind: "votering",
  dok_id: "202526:AU10",
  votering_id: "V-1",
  punkt: 3,
  datum: "2026-03-01",
  parties: ["s", "m", "v"],
  persons: [],
  titel: "Votering AU10 punkt 3 (2025/26)",
  url: "https://data.riksdagen.se/votering/V-1",
  archive_url: null,
  utfall: "bifall",
  rostfordelning: {
    s: { ja: 90, nej: 2, avstar: 0, franvarande: 15 },
    m: { ja: 1, nej: 60, avstar: 0, franvarande: 7 },
    v: { ja: 0, nej: 0, avstar: 20, franvarande: 4 },
  },
};

const partimotion: Handling = {
  id: "h-2026-0002",
  kind: "motion",
  dok_id: "HD02999",
  datum: "2026-02-01",
  parties: ["m"],
  persons: [{ name: "Ledare M", party: "m", riksdagen_id: "111" }],
  titel: "Partimotion",
  url: "https://data.riksdagen.se/dokument/HD02999",
  archive_url: null,
};

const enskildMotion: Handling = {
  ...partimotion,
  id: "h-2026-0003",
  dok_id: "HD02998",
  titel: "Enskild motion",
  persons: [{ name: "Enskild M", party: "m", riksdagen_id: "222" }],
};

const interpellation: Handling = {
  ...partimotion,
  id: "h-2026-0004",
  kind: "interpellation",
  dok_id: "HD10111",
  titel: "Interpellation",
  persons: [{ name: "Fragande M", party: "m", riksdagen_id: "333" }],
};

const handlingar = [votering, partimotion, enskildMotion, interpellation];

function k(partial: Partial<Koppling> & Pick<Koppling, "id" | "handling_id" | "riktning">): Koppling {
  return { promise_id: "p-2026-0001", status: "aktiv", ...partial };
}

test("votering: Ja-majoritet + stodjer → i linje; Nej-majoritet + stodjer → emot; frånvaro räknas aldrig", () => {
  const domar = computePartiDomar(
    [k({ id: "k-2026-0001", handling_id: "h-2026-0001", riktning: "stodjer" })],
    handlingar,
    { "p-2026-0001": ["s", "m", "v"] },
  );
  const by = Object.fromEntries(domar.map((d) => [d.party, d]));
  assert.equal(by["s"]!.status, "agerat_i_linje"); // 90 ja mot 2 nej trots 15 frånvarande
  assert.equal(by["m"]!.status, "agerat_emot");
  assert.equal(by["v"]!.status, "ingen_handling_annu"); // avstår är varken eller
  assert.deepEqual(by["v"]!.avstod, ["k-2026-0001"]);
});

test("votering: riktning motverkar vänder utslaget", () => {
  const domar = computePartiDomar(
    [k({ id: "k-2026-0002", handling_id: "h-2026-0001", riktning: "motverkar" })],
    handlingar,
    { "p-2026-0001": ["s", "m"] },
  );
  const by = Object.fromEntries(domar.map((d) => [d.party, d]));
  assert.equal(by["s"]!.status, "agerat_emot");
  assert.equal(by["m"]!.status, "agerat_i_linje");
});

test("partimotion ger partidom, enskild motion gör det inte (b-0007)", () => {
  const domar = computePartiDomar(
    [
      k({ id: "k-2026-0003", handling_id: "h-2026-0002", riktning: "stodjer", motionstyp: "parti" }),
      k({ id: "k-2026-0004", handling_id: "h-2026-0003", riktning: "stodjer", motionstyp: "enskild" }),
    ],
    handlingar,
    { "p-2026-0001": ["m"] },
  );
  assert.equal(domar[0]!.status, "agerat_i_linje");
  assert.deepEqual(domar[0]!.i_linje, ["k-2026-0003"]); // den enskilda syns inte här
});

test("interpellation fäller aldrig partidom (b-0009) men syns i ledamotens meritlista", () => {
  const kop = [k({ id: "k-2026-0005", handling_id: "h-2026-0004", riktning: "stodjer" })];
  const domar = computePartiDomar(kop, handlingar, { "p-2026-0001": ["m"] });
  assert.equal(domar[0]!.status, "ingen_handling_annu");
  const meriter = computeLedamotMeriter(kop, handlingar, new Map());
  assert.equal(meriter.length, 1);
  assert.equal(meriter[0]!.namn, "Fragande M");
  assert.deepEqual(meriter[0]!.i_linje, ["k-2026-0005"]);
});

test("kopplingar åt båda hållen → bade_och", () => {
  // M: partimotion stödjer löftet, men röstade Nej i en votering där
  // bifall hade stött det (Nej + stodjer → emot).
  const domar = computePartiDomar(
    [
      k({ id: "k-2026-0006", handling_id: "h-2026-0002", riktning: "stodjer", motionstyp: "parti" }),
      k({ id: "k-2026-0007", handling_id: "h-2026-0001", riktning: "stodjer" }),
    ],
    handlingar,
    { "p-2026-0001": ["m"] },
  );
  assert.equal(domar[0]!.status, "bade_och");
});

test("indragen koppling räknas inte", () => {
  const domar = computePartiDomar(
    [k({ id: "k-2026-0008", handling_id: "h-2026-0002", riktning: "stodjer", motionstyp: "parti", status: "indragen" })],
    handlingar,
    { "p-2026-0001": ["m"] },
  );
  assert.equal(domar[0]!.status, "ingen_handling_annu");
});

test("koppling mot okänd handling är ett datafel och kastar", () => {
  assert.throws(() =>
    computePartiDomar([k({ id: "k-2026-0009", handling_id: "h-9999-9999", riktning: "stodjer" })], handlingar, {
      "p-2026-0001": ["m"],
    }),
  );
});

test("partilinje: oavgjort ger inget utslag", () => {
  assert.equal(partilinjeIVotering({ ja: 5, nej: 5, avstar: 0 }), null);
  assert.equal(partilinjeIVotering({ ja: 0, nej: 0, avstar: 0 }), null);
  assert.equal(partilinjeIVotering({ ja: 0, nej: 0, avstar: 3 }), "avstar");
});

test("ledamotsmeriter: egen röst avgör, frånvaro redovisas separat", () => {
  const roster: RdVoteringRad[] = [
    { votering_id: "V-1", rm: "2025/26", beteckning: "AU10", punkt: 3, namn: "A Andersson", intressent_id: "a1", parti: "s", valkrets: "X", rost: "Nej", avser: "sakfrågan" },
    { votering_id: "V-1", rm: "2025/26", beteckning: "AU10", punkt: 3, namn: "B Berg", intressent_id: "b1", parti: "s", valkrets: "X", rost: "Frånvarande", avser: "sakfrågan" },
    { votering_id: "V-1", rm: "2025/26", beteckning: "AU10", punkt: 3, namn: "C Ceder", intressent_id: "c1", parti: "m", valkrets: "X", rost: "Ja", avser: "kvittning" },
  ];
  const meriter = computeLedamotMeriter(
    [k({ id: "k-2026-0010", handling_id: "h-2026-0001", riktning: "stodjer" })],
    handlingar,
    new Map([["V-1", roster]]),
  );
  const by = Object.fromEntries(meriter.map((m) => [m.intressent_id, m]));
  assert.deepEqual(by["a1"]!.emot, ["k-2026-0010"]); // röstade Nej mot stödjande bifall
  assert.deepEqual(by["b1"]!.franvarande, ["k-2026-0010"]);
  assert.equal(by["b1"]!.i_linje.length + by["b1"]!.emot.length, 0); // frånvaro fäller inget
  assert.equal(by["c1"], undefined); // kvittningsrader ingår inte
});
