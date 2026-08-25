/**
 * Review-beslutens spärrar. Reglerna står i `src/reviewbeslut.ts`.
 *
 * Verktyget publicerar löften, och ett publicerat löfte är det svåraste att ta
 * tillbaka. Spärrarna finns därför före skrivningen och inte efter.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AVVISAR,
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
  /**
   * En post som lämnat kön är avgjord — av en tidigare körning eller av någon
   * annan som satt samma dom. Att fälla hela passet för den vore att kräva att
   * beslutsfilen städas för hand efter varje verkställighet, och filen är
   * append-only med flit. Ändrat 2026-08-25, när ett halvkört pass inte gick
   * att köra om.
   */
  it("en post som lämnat kön hoppas över, den fälls inte", () => {
    const p = provaBeslut(b(), new Map(), loften());
    assert.deepEqual(p.fel, []);
    assert.match(p.hoppas ?? "", /redan avgjord/u);
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

  /**
   * Kravet gäller det SKÄL SOM SPARAS, inte noten. Nio av 338 beslut föll
   * 2026-08-25 på ett notkrav med noter som «utförligare kalkyl» — kravet mätte
   * fel sak. Varje val bär numera en genererad kärnmening, och noten läggs till.
   */
  it("en kort not räcker: kärnan bär skälet", () => {
    const p = provaBeslut(b({ val: "ejlofte", not: "retorik" }), ko(), loften());
    assert.deepEqual(p.fel, []);
    const skal = avvisningsskal(b({ val: "ejlofte", not: "retorik" }));
    assert.match(skal, /ingen utfästelse/u);
    assert.match(skal, /retorik$/u);
  });

  it("kärnan ensam räcker när noten är tom", () => {
    const p = provaBeslut(b({ val: "ejlofte", not: "" }), ko(), loften());
    assert.deepEqual(p.fel, []);
    assert.ok(avvisningsskal(b({ val: "ejlofte" })).length >= SKAL_MIN_TECKEN);
  });

  it("varje avvisande val har en kärna som går att läsa", () => {
    for (const val of AVVISAR) {
      const skal = avvisningsskal(b({ val, kalkyl_till: "p-2026-0001", narmast_da: "p-2026-0002:1" }));
      assert.ok(skal.length >= SKAL_MIN_TECKEN, `${val}: «${skal}»`);
    }
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

describe("dubblett med flyttad kalkyl", () => {
  const b2 = (o: Partial<Beslut> = {}): Beslut =>
    ({ id: "abc123abc123", val: "dubblett_kalkyl", citat_da: CITAT, kalkyl_till: "p-2026-0001", ...o });

  it("en flytt mot ett levande löfte godtas", () => {
    assert.deepEqual(provaBeslut(b2(), ko(), loften()).fel, []);
  });

  it("utan utpekat löfte fälls raden", () => {
    const p = provaBeslut(b2({ kalkyl_till: null }), ko(), loften());
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /inget publicerat löfte pekades ut/u);
  });

  it("mot ett indraget löfte fälls raden", () => {
    const p = provaBeslut(b2(), ko(), loften(false));
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /inte aktivt/u);
  });

  it("utan kostnad finns ingenting att flytta", () => {
    const p = provaBeslut(b2(), ko({ harKostnad: false }), loften());
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /ingen kostnad att flytta/u);
  });

  it("skälet namnger löftet kalkylen flyttades till", () => {
    const skal = avvisningsskal(b2());
    assert.match(skal, /p-2026-0001/u);
    assert.match(skal, /bättre grundad/u);
  });

  it("valet räknas som en avvisning — kandidaten publiceras inte", () => {
    assert.ok(AVVISAR.includes("dubblett_kalkyl"));
  });
});

describe("«som föreslaget» gäller det förslag som lästes", () => {
  /**
   * Kö-prissättningen satte belopp på 241 poster 2026-08-24. Ett ja fattat före
   * den körningen avsåg en tom cell, inte den siffra som står där nu.
   */
  it("ett belopp som ändrats sedan beslutet fäller raden", () => {
    const p = provaBeslut(
      { id: "abc123abc123", val: "godkann", citat_da: CITAT, bas_da: null },
      new Map([["abc123abc123", { id: "abc123abc123", citat: CITAT, harKostnad: true, bas: 350 }]]),
      loften(),
    );
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /var tomt när beslutet togs och är 350 nu/u);
  });

  it("ett oförändrat belopp släpps igenom", () => {
    const p = provaBeslut(
      { id: "abc123abc123", val: "godkann", citat_da: CITAT, bas_da: 350 },
      new Map([["abc123abc123", { id: "abc123abc123", citat: CITAT, harKostnad: true, bas: 350 }]]),
      loften(),
    );
    assert.deepEqual(p.fel, []);
  });

  it("kontrollen gäller bara «som föreslaget» — ett eget belopp ersätter ju förslaget", () => {
    const p = provaBeslut(
      { id: "abc123abc123", val: "godkann_belopp", citat_da: CITAT, bas_da: null,
        belopp: { low: 1, bas: 2, high: 3 }, not: "x".repeat(SKAL_MIN_TECKEN + 5) },
      new Map([["abc123abc123", { id: "abc123abc123", citat: CITAT, harKostnad: true, bas: 350 }]]),
      loften(),
    );
    assert.deepEqual(p.fel, []);
  });
});
