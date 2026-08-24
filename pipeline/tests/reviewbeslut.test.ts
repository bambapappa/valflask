/**
 * Review-beslutens spärrar. Reglerna står i `src/reviewbeslut.ts`.
 *
 * Verktyget publicerar löften, och ett publicerat löfte är det svåraste att ta
 * tillbaka. Spärrarna finns därför före skrivningen och inte efter.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  avvisningsskal,
  godkannandeArgument,
  provaBeslut,
  senaste,
  SKAL_MIN_TECKEN,
  type Beslut,
  type Kopost,
  type Lofteslage,
} from "../src/reviewbeslut.ts";

const CITAT = "Vi vill sänka skatten på arbete för alla som arbetar.";
const ko = (o: Partial<Kopost> = {}) =>
  new Map<string, Kopost>([["abc123abc123", { id: "abc123abc123", citat: CITAT, harKostnad: true, ...o }]]);
const loften = (aktiv = true) =>
  new Map<string, Lofteslage>([["p-2026-0001", { id: "p-2026-0001", aktiv }]]);
const b = (o: Partial<Beslut> = {}): Beslut => ({ id: "abc123abc123", val: "godkann", citat_da: CITAT, ...o });

describe("senaste beslutet per id", () => {
  it("den sista raden för ett id gäller", () => {
    const ut = senaste([b({ val: "godkann" }), b({ val: "dubblett" })]);
    assert.equal(ut.length, 1);
    assert.equal(ut[0]!.val, "dubblett");
  });

  it("en ångring tar bort posten ur högen", () => {
    const ut = senaste([b({ val: "godkann" }), { id: "abc123abc123", val: null }]);
    assert.deepEqual(ut, []);
  });

  it("en ångring följd av ett nytt svar räknas", () => {
    const ut = senaste([b({ val: "godkann" }), { id: "abc123abc123", val: null }, b({ val: "ejlofte" })]);
    assert.equal(ut[0]!.val, "ejlofte");
  });
});

describe("citatet måste vara detsamma som när beslutet togs", () => {
  it("oförändrat citat släpps igenom", () => {
    assert.equal(provaBeslut(b(), ko(), loften()).ok, true);
  });

  /**
   * Beslutet fattades om en text. Har texten ändrats sedan dess gällde
   * beslutet något annat — samma fälla som `sammanstall.mjs` varnar för i de
   * andra spåren, och här hade den publicerat ett löfte ingen läst.
   */
  it("ändrat citat fäller raden", () => {
    const p = provaBeslut(b({ citat_da: "En helt annan mening." }), ko(), loften());
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /citatet har ändrats/u);
  });
});

describe("godkännandet", () => {
  it("en post som lämnat kön går inte att godkänna", () => {
    const p = provaBeslut(b(), new Map(), loften());
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /finns inte i kön/u);
  });

  it("«som föreslaget» kräver att det FINNS ett förslag", () => {
    const p = provaBeslut(b(), ko({ harKostnad: false }), loften());
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /saknar föreslagen kostnad/u);
  });

  it("ett handsatt belopp kräver sin uträkning", () => {
    const p = provaBeslut(
      b({ val: "godkann_belopp", belopp: { low: 1, bas: 2, high: 3 }, not: "för lågt" }),
      ko(),
      loften(),
    );
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /måste bära sin uträkning/u);
  });

  it("ett spann i oordning fälls", () => {
    const p = provaBeslut(
      b({ val: "godkann_belopp", belopp: { low: 9, bas: 2, high: 3 }, not: "x".repeat(SKAL_MIN_TECKEN + 5) }),
      ko(),
      loften(),
    );
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /inte i ordning/u);
  });

  it("ett handsatt belopp med uträkning godtas", () => {
    const p = provaBeslut(
      b({ val: "godkann_belopp", belopp: { low: 1, bas: 2, high: 3 }, not: "x".repeat(SKAL_MIN_TECKEN + 5) }),
      ko(),
      loften(),
    );
    assert.deepEqual(p.fel, []);
  });

  it("en gruppering mot ett indraget löfte fälls", () => {
    const p = provaBeslut(b({ val: "delat", grupp_id: "p-2026-0001" }), ko(), loften(false));
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /inte aktivt/u);
  });

  it("en gruppering utan utpekat löfte fälls", () => {
    const p = provaBeslut(b({ val: "delat" }), ko(), loften());
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /inget löfte pekades ut/u);
  });
});

describe("avvisningen", () => {
  it("en dubblett skriver in vilket löfte den avsåg", () => {
    const skal = avvisningsskal(b({ val: "dubblett", narmast_da: "p-2026-2741:1" }));
    assert.match(skal, /p-2026-2741/u);
    assert.ok(skal.length >= SKAL_MIN_TECKEN, skal);
  });

  it("en dubblett utan uppslag godtas ändå — kärnan bär skälet", () => {
    const p = provaBeslut(b({ val: "dubblett" }), ko(), loften());
    assert.deepEqual(p.fel, []);
  });

  it("«inte ett löfte» utan skäl fälls", () => {
    const p = provaBeslut(b({ val: "ejlofte", not: "nej" }), ko(), loften());
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /skäl som går att läsa/u);
  });

  it("«oklart» prövas inte alls — det verkställs inte", () => {
    assert.deepEqual(provaBeslut(b({ val: "oklart" }), new Map(), loften()).fel, []);
  });
});

describe("argumenten till approve", () => {
  it("ett rent ja är bara id:t", () => {
    assert.deepEqual(godkannandeArgument(b()), ["abc123abc123"]);
  });

  it("en gruppering bär --group", () => {
    assert.deepEqual(godkannandeArgument(b({ val: "delat", grupp_id: "p-2026-0001" })),
      ["abc123abc123", "--group", "p-2026-0001"]);
  });

  it("ett handsatt belopp bär spannet och uträkningen", () => {
    assert.deepEqual(
      godkannandeArgument(b({ val: "godkann_belopp", belopp: { low: 1, bas: 2, high: 3 }, not: "  skälet  " })),
      ["abc123abc123", "1", "2", "3", "--calc", "skälet"],
    );
  });

  it("ett nej är inget godkännande", () => {
    assert.throws(() => godkannandeArgument(b({ val: "dubblett" })), /inget godkännande/u);
  });
});
