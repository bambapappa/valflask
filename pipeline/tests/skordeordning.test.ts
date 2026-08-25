/**
 * Skördeordningen: det parti vi läst minst på går först.
 *
 * Proven är skrivna mot det fel som faktiskt inträffade — KD:s katalog åt hela
 * budgeten varje körning i bokstavsordning — och inte mot funktionens form.
 */
import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import {
  laststTal,
  ordnaEfterTackning,
  partiForUrl,
} from "../src/skordeordning.ts";

const url = (u: string): string => u;
const nolla = (): number => 0;

test("partiForUrl känner igen partiets domän, med och utan www", () => {
  assert.equal(partiForUrl("https://kristdemokraterna.se/var-politik/x"), "kd");
  assert.equal(partiForUrl("https://www.socialdemokraterna.se/val-2026"), "s");
  assert.equal(partiForUrl("https://sd.se/vad-vi-vill/"), "sd");
});

test("partiForUrl tar underdomäner — pressrummet är fortfarande partiet", () => {
  assert.equal(partiForUrl("https://press.kristdemokraterna.se/nyhet"), "kd");
  assert.equal(partiForUrl("https://val2026.centerpartiet.se/"), "c");
});

test("partiForUrl svarar null för allt som inte är en partisajt", () => {
  assert.equal(partiForUrl("https://www.svt.se/nyheter/inrikes/x"), null);
  assert.equal(partiForUrl("https://data.riksdagen.se/dokumentlista/"), null);
  assert.equal(partiForUrl("inte en adress"), null);
});

test("partiForUrl luras inte av ett partinamn på främmande domän", () => {
  assert.equal(partiForUrl("https://elaksajt.se/kristdemokraterna.se/x"), null);
  assert.equal(partiForUrl("https://kristdemokraterna.se.exempel.org/x"), null);
});

test("laststTal räknar unika sidor per parti", () => {
  const seen = new Map([
    ["h1", "https://kristdemokraterna.se/a"],
    ["h2", "https://kristdemokraterna.se/b"],
    ["h3", "https://sd.se/x"],
    ["h4", "https://www.svt.se/nyhet"],
  ]);
  const tal = laststTal(seen);
  assert.equal(tal.get("kd"), 2);
  assert.equal(tal.get("sd"), 1);
  assert.equal(tal.get("s"), undefined);
});

test("laststTal räknar samma sida en gång även med och utan avslutande snedstreck", () => {
  const seen = new Map([
    ["h1", "https://sd.se/vad-vi-vill/"],
    ["h2", "https://sd.se/vad-vi-vill"],
  ]);
  assert.equal(laststTal(seen).get("sd"), 1);
});

test("FELET SOM VAR: bokstavsordning gav KD hela budgeten — nu går SD först", () => {
  // Fyra nya sidor per parti. KD är alfabetiskt först och hade tagit allt.
  const artiklar = [
    ...Array.from({ length: 4 }, (_, i) => `https://kristdemokraterna.se/var-politik/${i}`),
    ...Array.from({ length: 4 }, (_, i) => `https://sd.se/vad-vi-vill/${i}`),
  ];
  // Så såg täckningen ut den 17 augusti 2026.
  const last = new Map([
    ["kd", 270],
    ["sd", 22],
  ]);
  const ordnad = ordnaEfterTackning(artiklar, url, nolla, last);
  const budget = ordnad.slice(0, 4);
  assert.ok(
    budget.every((u) => u.includes("sd.se")),
    `budgeten skulle gått till SD, gick till: ${budget.join(", ")}`,
  );
});

test("inget parti svälts: när täckningen jämnat ut sig varvas de om vartannat", () => {
  const artiklar = [
    ...Array.from({ length: 3 }, (_, i) => `https://kristdemokraterna.se/${i}`),
    ...Array.from({ length: 3 }, (_, i) => `https://sd.se/${i}`),
  ];
  const ordnad = ordnaEfterTackning(artiklar, url, nolla, new Map([["kd", 10], ["sd", 10]]));
  const partier = ordnad.map((u) => (u.includes("sd.se") ? "sd" : "kd"));
  // Lika täckning ⇒ varannan, inte tre av ett slag följt av tre av det andra.
  assert.deepEqual(partier, ["kd", "sd", "kd", "sd", "kd", "sd"]);
});

test("partiet vi läst minst på hinner ikapp, inte förbi", () => {
  // SD ligger tre sidor efter. Efter tre platser ska KD få vara med igen.
  const artiklar = [
    ...Array.from({ length: 5 }, (_, i) => `https://kristdemokraterna.se/${i}`),
    ...Array.from({ length: 5 }, (_, i) => `https://sd.se/${i}`),
  ];
  const ordnad = ordnaEfterTackning(artiklar, url, nolla, new Map([["kd", 3], ["sd", 0]]));
  const partier = ordnad.map((u) => (u.includes("sd.se") ? "sd" : "kd"));
  assert.deepEqual(partier.slice(0, 3), ["sd", "sd", "sd"], "de tre första jämnar ut");
  assert.ok(partier.slice(3, 5).includes("kd"), "sedan släpps KD in igen");
});

test("prioritetsgrupperna hålls isär — utjämningen sker inom en grupp", () => {
  const artiklar = [
    "https://data.riksdagen.se/dok/1",
    "https://kristdemokraterna.se/var-politik/x",
  ];
  const prio = (u: string): number => (u.includes("riksdagen") ? 1 : 0);
  const ordnad = ordnaEfterTackning(artiklar, url, prio, new Map([["kd", 999]]));
  assert.ok(
    ordnad[0]!.includes("kristdemokraterna"),
    "partisidor ligger i grupp 0 och går före riksdagen hur illa täckta de än är",
  );
});

test("artiklar utan parti hamnar sist inom sin grupp, inte först", () => {
  const artiklar = [
    "https://www.svt.se/nyhet",
    "https://sd.se/vad-vi-vill/x",
  ];
  const ordnad = ordnaEfterTackning(artiklar, url, nolla, new Map([["sd", 500]]));
  assert.ok(ordnad[0]!.includes("sd.se"), "ett parti med täckning går ändå före ett utan parti");
});

test("samma indata ger samma ordning", () => {
  const artiklar = [
    "https://mp.se/politik/b",
    "https://sd.se/vad-vi-vill/a",
    "https://mp.se/politik/a",
    "https://moderaterna.se/var-politik/a",
  ];
  const last = new Map([["mp", 4], ["sd", 4], ["m", 4]]);
  const ett = ordnaEfterTackning(artiklar, url, nolla, last);
  const tva = ordnaEfterTackning([...artiklar].reverse(), url, nolla, last);
  assert.deepEqual(ett, tva, "ordningen får inte bero på hur artiklarna råkade komma in");
});

describe("rundgång: täckningen väger inte", () => {
  const artiklar = [
    { url: "https://www.liberalerna.se/politik/monarki" },
    { url: "https://www.liberalerna.se/politik/vindkraft" },
    { url: "https://www.liberalerna.se/politik/kultur" },
    { url: "https://www.centerpartiet.se/centerpartiets-politik/skatt" },
    { url: "https://www.centerpartiet.se/centerpartiets-politik/vard" },
  ];
  // L har läst mycket mer än C — och är just det parti som har oläst kvar.
  const last = new Map([["l", 616], ["c", 245]]);

  it("utan rundgång går det minst lästa partiet först, hela vägen", () => {
    const ut = ordnaEfterTackning(artiklar, (a) => a.url, () => 0, last).map((a) => a.url);
    assert.match(ut[0]!, /centerpartiet/u);
    assert.match(ut[1]!, /centerpartiet/u);
    assert.match(ut[2]!, /liberalerna/u);
  });

  /**
   * Det verkliga fallet 2026-08-25: fyra extra körningar flyttade backlogen två
   * sidor, därför att partiet med oläst kvar också var det vi läst mest hos.
   */
  it("med rundgång varvas partierna — en var, sedan nästa", () => {
    const ut = ordnaEfterTackning(artiklar, (a) => a.url, () => 0, last, { rundgang: true }).map((a) => a.url);
    assert.match(ut[0]!, /centerpartiet/u);
    assert.match(ut[1]!, /liberalerna/u);
    assert.match(ut[2]!, /centerpartiet/u);
    assert.match(ut[3]!, /liberalerna/u);
    assert.match(ut[4]!, /liberalerna/u);
  });

  it("prioritetsgrupperna respekteras även i rundgång", () => {
    const blandat = [
      { url: "https://www.liberalerna.se/politik/monarki", p: 0 },
      { url: "https://data.riksdagen.se/dokument/HD1", p: 1 },
    ];
    const ut = ordnaEfterTackning(blandat, (a) => a.url, (a) => a.p, last, { rundgang: true }).map((a) => a.url);
    assert.match(ut[0]!, /liberalerna/u);
    assert.match(ut[1]!, /riksdagen/u);
  });

  it("samma indata ger samma ordning", () => {
    const a = ordnaEfterTackning(artiklar, (x) => x.url, () => 0, last, { rundgang: true });
    const b = ordnaEfterTackning(artiklar, (x) => x.url, () => 0, last, { rundgang: true });
    assert.deepEqual(a, b);
  });
});
