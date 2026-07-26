import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dokumentfrekvenser,
  inverteraIndex,
  ordvikt,
  raknaTermer,
  skarvaFor,
  slaIhopSkarvor,
  taOrd,
  termPoang,
  utvinnTermer,
  type DokumentTermer,
  type Skarva,
} from "../src/nyckelord.ts";

test("taOrd: gemener, korta ord bort, svenska tecken behålls", () => {
  const ord = taOrd("Höjt TAK i a-kassan, år 2026!");
  assert.ok(ord.includes("höjt"));
  assert.ok(ord.includes("a-kassan"));
  assert.ok(!ord.includes("i")); // för kort
  assert.ok(ord.includes("2026"));
});

test("raknaTermer: riksdagens formelspråk rensas bort", () => {
  const formel =
    "Riksdagen ställer sig bakom det som anförs i motionen och tillkännager detta för regeringen.";
  assert.equal(raknaTermer(formel).size, 0, "en ren formelmening ska inte ge några termer");

  // Termerna lagras som stammar.
  const sak = raknaTermer(formel + " Taket i arbetslöshetsförsäkringen bör höjas.");
  assert.ok(sak.has("arbetslöshetsförsäkring"));
  assert.ok(sak.has("tak"));
  assert.ok(sak.has("höj"), "höjas ska ge samma stam som höja");
  assert.ok(!sak.has("riksdagen"), "formelord ska inte överleva rensningen");
});

test("raknaTermer: rena tal räknas inte som termer", () => {
  assert.ok(!raknaTermer("1234 5678").has("1234"));
});

test("utvinnTermer: frekvens styr, sorteringen är deterministisk", () => {
  const text = "vårdplatser vårdplatser vårdplatser köerna köerna sjukhus";
  const { t, n } = utvinnTermer(text, 2);
  assert.deepEqual(t, ["vårdplats", "köern"]); // stammar

  assert.equal(n, 6);
  // Samma text ska ge exakt samma lista, varje gång.
  assert.deepEqual(utvinnTermer(text, 2).t, t);
});

test("utvinnTermer: lika frekvens bryts i bokstavsordning", () => {
  const { t } = utvinnTermer("bravo alfa", 2);
  assert.deepEqual(t, ["alf", "bravo"]); // stammar, i bokstavsordning
});

test("skarvaFor: tusental ger stabila skärvnamn", () => {
  assert.equal(skarvaFor("h-2026-0001"), "00");
  assert.equal(skarvaFor("h-2026-12469"), "12");
  assert.equal(skarvaFor("something-else"), "ovrigt");
});

test("ordvikt: vanlig term väger lätt, ovanlig tungt", () => {
  const vanlig = ordvikt(1000, 1000);
  const ovanlig = ordvikt(2, 1000);
  assert.equal(vanlig, 0, "term i varje dokument skiljer ingenting");
  assert.ok(ovanlig > vanlig);
});

test("termPoang: ovanliga gemensamma ord väger tyngre än vanliga", () => {
  const index = new Map<string, DokumentTermer>([
    ["h-1", { t: ["krigssjukvård", "försvar"], n: 100 }],
    ["h-2", { t: ["försvar"], n: 100 }],
    ["h-3", { t: ["försvar"], n: 100 }],
  ]);
  const df = dokumentfrekvenser(index);
  assert.equal(df.get("försvar"), 3);
  assert.equal(df.get("krigssjukvård"), 1);

  const mal = new Set(["krigssjukvård", "försvar"]);
  const bada = termPoang(mal, index.get("h-1")!, df, index.size);
  const baraVanlig = termPoang(mal, index.get("h-2")!, df, index.size);
  assert.ok(bada > baraVanlig, "dokumentet med det ovanliga ordet ska väga tyngre");
});

test("termPoang: termer utanför målet ger inget utslag", () => {
  const index = new Map<string, DokumentTermer>([["h-1", { t: ["kultur"], n: 10 }]]);
  const df = dokumentfrekvenser(index);
  assert.equal(termPoang(new Set(["försvar"]), index.get("h-1")!, df, 1), 0);
});

test("slaIhopSkarvor: skärvor blir ett uppslagsverk", () => {
  const a: Skarva = { version: 1, handlingar: { "h-1": { t: ["x"], n: 1 } } };
  const b: Skarva = { version: 1, handlingar: { "h-2": { t: ["y"], n: 2 } } };
  const index = slaIhopSkarvor([a, b]);
  assert.equal(index.size, 2);
  assert.deepEqual(index.get("h-2"), { t: ["y"], n: 2 });
});

test("inverteraIndex: term → handlingar, sorterat", () => {
  const index = new Map<string, DokumentTermer>([
    ["h-2", { t: ["försvar"], n: 1 }],
    ["h-1", { t: ["försvar", "kultur"], n: 1 }],
  ]);
  const inv = inverteraIndex(index);
  assert.deepEqual(inv.get("försvar"), ["h-1", "h-2"]);
  assert.deepEqual(inv.get("kultur"), ["h-1"]);
});
