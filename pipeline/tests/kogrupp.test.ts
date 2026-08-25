/**
 * Gruppen på kö-posten. Regeln står i `src/kogrupp.ts`.
 *
 * Sjutton `delat`-beslut satt fast 2026-08-25 därför att `group_id` ingår i
 * kanon men sattes först vid godkännandet: prövningen var skriven mot en
 * grupplös version, och grinden fällde den grupperade. Proven låser fast att
 * härledningen är densamma som `approve()`:s, och att provet inte släpper
 * igenom en post som flyttas mellan grupper i tysthet.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { harledGrupp, provaKogrupprad } from "../src/kogrupp.ts";
import { kanon, kopostSomLofte } from "../src/provningar.ts";

const post = { id: "abc123", group_id: null };

describe("gruppens namn härleds som approve() härleder den", () => {
  it("målets egen grupp när den finns", () => {
    assert.equal(harledGrupp({ id: "p-2026-0357", group_id: "g-fast-lakarkontakt" }), "g-fast-lakarkontakt");
  });
  it("annars en ny grupp med målets id", () => {
    assert.equal(harledGrupp({ id: "p-2026-1902", group_id: null }), "g-p-2026-1902");
  });
});

describe("prövningen av en rad", () => {
  it("släpper igenom en grupplös post mot ett levande mål", () => {
    const p = provaKogrupprad({ id: "abc123", till: "p-2026-1902" }, post, { id: "p-2026-1902" });
    assert.equal(p.ok, true);
    assert.equal(p.hoppas, undefined);
  });

  it("hoppar över en post som redan står i rätt grupp", () => {
    const p = provaKogrupprad(
      { id: "abc123", till: "p-2026-1902" },
      { id: "abc123", group_id: "g-p-2026-1902" },
      { id: "p-2026-1902" },
    );
    assert.equal(p.ok, true);
    assert.match(p.hoppas ?? "", /står redan/u);
  });

  it("fäller en post som redan står i en ANNAN grupp — att flytta den är en läsning", () => {
    const p = provaKogrupprad(
      { id: "abc123", till: "p-2026-1902" },
      { id: "abc123", group_id: "g-nagot-annat" },
      { id: "p-2026-1902" },
    );
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /står redan i gruppen g-nagot-annat/u);
  });

  it("fäller ett indraget mål — en grupp kan inte peka på ett indraget löfte", () => {
    const p = provaKogrupprad({ id: "abc123", till: "p-2026-1902" }, post, {
      id: "p-2026-1902", status: "indraget",
    });
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /indraget/u);
  });

  it("fäller ett mål som inte finns", () => {
    const p = provaKogrupprad({ id: "abc123", till: "p-2026-9999" }, post, undefined);
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /finns inte/u);
  });

  it("en post som lämnat kön är avgjord, inte fel", () => {
    const p = provaKogrupprad({ id: "abc123", till: "p-2026-1902" }, undefined, { id: "p-2026-1902" });
    assert.equal(p.ok, true);
    assert.match(p.hoppas ?? "", /redan avgjord/u);
  });
});

describe("gruppen ändrar hashen — och det är hela skälet till att den sätts i förväg", () => {
  const kopost = {
    articleUrl: "https://ex.se/a", articleTitle: "A",
    candidate: { quote: "Ett citat.", title: "Ett löfte", parties: ["s"] },
    cost: { msek_base: 100 },
  };

  it("samma post med och utan grupp ger olika kanon", () => {
    const utan = kanon("lofte", kopostSomLofte(kopost));
    const med = kanon("lofte", kopostSomLofte({ ...kopost, group_id: "g-p-2026-0357" }));
    assert.notEqual(utan, med);
  });

  it("kö-formen läser gruppen av posten och antar den inte tom", () => {
    assert.equal(kopostSomLofte({ ...kopost, group_id: "g-x" })["group_id"], "g-x");
    assert.equal(kopostSomLofte(kopost)["group_id"], null);
  });
});
