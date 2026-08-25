/**
 * Kalkylflytten. Regeln står i `src/kalkylflytt.ts`.
 *
 * Verktyget ändrar ett PUBLICERAT belopp med en kö-posts uträkning som skäl.
 * Det är den farligaste sortens ändring i hela kön: den rör vad läsaren redan
 * sett, och den utlöses av ett tangenttryck i ett gränssnitt.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  flytta,
  forandring,
  provaFlytt,
  SKAL_MIN_TECKEN,
  UTRAKNING_MAX_TECKEN,
  type Flyttrad,
  type Malpost,
} from "../src/kalkylflytt.ts";

const SKAL = "Kandidatens uträkning räknar fram nivån ur antalet mottagare; den publicerade lånade en siffra.";
const mal = (o: Partial<Malpost> = {}): Malpost => ({
  id: "p-2026-1813",
  status: "aktiv",
  title: "Återställ rätten till assistans",
  cost: { type: "utgift", period: "per_ar", msek_low: 0, msek_base: 0, msek_high: 0, calculation: "Gammal text." },
  history: [],
  ...o,
});
const rad = (o: Partial<Flyttrad> = {}): Flyttrad => ({
  fran: "abc123abc123",
  till: "p-2026-1813",
  kostnad: {
    type: "utgift", period: "per_ar",
    msek_low: 200, msek_base: 350, msek_high: 600,
    calculation: "Omkring 15 000 personer × 250–400 tkr i återställd ersättning ≈ 200–600 mkr per år.",
  },
  skal: SKAL,
  ...o,
});

describe("vad som måste stämma innan ett publicerat belopp rörs", () => {
  it("en flytt med grund godtas", () => {
    assert.deepEqual(provaFlytt(rad(), mal()).fel, []);
  });

  it("målet måste finnas", () => {
    const p = provaFlytt(rad(), undefined);
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /finns inte/u);
  });

  it("ett indraget löfte publicerar ingenting", () => {
    const p = provaFlytt(rad(), mal({ status: "tillbakadragen" }));
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /status tillbakadragen/u);
  });

  it("en kostnad utan uträkning är bara en siffra", () => {
    const p = provaFlytt(rad({ kostnad: { period: "per_ar", msek_base: 350, calculation: "  " } }), mal());
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /bara en siffra/u);
  });

  it("ett spann i oordning fälls", () => {
    const p = provaFlytt(
      rad({ kostnad: { ...rad().kostnad, msek_low: 900 } }),
      mal(),
    );
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /inte i ordning/u);
  });

  it("en uträkning över schemats tak fälls före skrivningen", () => {
    const p = provaFlytt(rad({ kostnad: { ...rad().kostnad, calculation: "x".repeat(UTRAKNING_MAX_TECKEN + 1) } }), mal());
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /tecken, och schemat tar/u);
  });

  /** Trettiofem av kö-prissättningens poster föll på just det här. */
  it("en intern beteckning i publicerad text fälls", () => {
    const p = provaFlytt(
      rad({ kostnad: { ...rad().kostnad, calculation: "Samma nivå som p-2026-0042 räknar fram." } }),
      mal(),
    );
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /interna beteckningar/u);
  });

  it("ett för kort skäl fälls", () => {
    const p = provaFlytt(rad({ skal: "bättre" }), mal());
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /rättelseloggen ska säga vad läsningen fann/u);
  });

  /**
   * Idempotens, inte ett fel. Kvalitetsfiltret stoppade passet 2026-08-25 efter
   * att fem flyttar redan skrivits, och en omkörning ska inte kräva att
   * beslutsfilen städas för hand.
   */
  it("en flytt som redan är gjord hoppas över, den fälls inte", () => {
    const m = mal({ cost: { ...rad().kostnad } });
    const p = provaFlytt(rad(), m);
    assert.deepEqual(p.fel, []);
    assert.match(p.hoppas ?? "", /redan flyttad/u);
  });

  it("en redan gjord flytt med trasigt skäl fälls ändå", () => {
    const m = mal({ cost: { ...rad().kostnad } });
    const p = provaFlytt(rad({ skal: "kort" }), m);
    assert.equal(p.ok, false);
  });
});

describe("enheten får inte byta i tysthet", () => {
  it("byter perioden utan att skälet nämner det fälls raden", () => {
    const p = provaFlytt(rad({ kostnad: { ...rad().kostnad, period: "engang" } }), mal());
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /byter period/u);
  });

  it("byter perioden och skälet säger det godtas den", () => {
    const p = provaFlytt(
      rad({
        kostnad: { ...rad().kostnad, period: "engang" },
        skal: SKAL + " Beloppet är dessutom en engångskostnad och inte årlig, vilket byter period.",
      }),
      mal(),
    );
    assert.deepEqual(p.fel, []);
  });

  it("byter kostnadstypen utan att skälet nämner det fälls raden", () => {
    const p = provaFlytt(rad({ kostnad: { ...rad().kostnad, type: "besparing" } }), mal());
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /byter kostnadstyp/u);
  });
});

describe("vad flytten lämnar efter sig", () => {
  it("beloppet, spannet och uträkningen är kandidatens", () => {
    const ut = flytta(mal(), rad(), "2026-08-24");
    assert.equal(ut.cost!.msek_base, 350);
    assert.equal(ut.cost!.msek_low, 200);
    assert.equal(ut.cost!.msek_high, 600);
    assert.match(ut.cost!.calculation!, /15 000 personer/u);
  });

  it("rubriken och statusen rörs inte — det är bara prislappen som byts", () => {
    const ut = flytta(mal(), rad(), "2026-08-24");
    assert.equal(ut.title, "Återställ rätten till assistans");
    assert.equal(ut.status, "aktiv");
  });

  /** Samma fel som nollningen gjorde: ankaret hörde till det gamla beloppet. */
  it("ankaret följer inte med — det hörde till beloppet som ersattes", () => {
    const m = mal({ cost: { ...mal().cost, anchor_ids: ["p-2026-0001"] } as never });
    const ut = flytta(m, rad(), "2026-08-24");
    assert.deepEqual(ut.cost!["anchor_ids"], []);
  });

  it("historiken säger varifrån uträkningen kom och bär skälet", () => {
    const h = flytta(mal(), rad(), "2026-08-24").history!.at(-1)!;
    assert.match(h.change, /granskningskön/u);
    assert.match(h.change, /Kandidatens uträkning räknar fram nivån/u);
    assert.equal(h.commit, "0000000");
  });

  it("ett oförändrat belopp beskrivs som en ersatt uträkning, inte som en ändring", () => {
    const m = mal({ cost: { ...mal().cost, msek_base: 350 } as never });
    const h = flytta(m, rad(), "2026-08-24").history!.at(-1)!;
    assert.match(h.change, /Uträkningen ersatt/u);
    assert.doesNotMatch(h.change, /Beloppet ändrat/u);
  });

  it("förändringen mäts över mandatperioden", () => {
    assert.equal(forandring(rad(), mal()), 1400);
  });
});

describe("skälet skrivs i historiken och läses av besökaren", () => {
  /**
   * Hände 2026-08-25: avvisningsskälet återanvändes som skäl till flytten, och
   * det skälet får bära löftets id — det går till `avvisade.json`. Historiken
   * på det publicerade löftet får det inte. Meningen blev dessutom cirkulär:
   * «publicerat, i p-2026-1268» stod I p-2026-1268.
   */
  it("ett löftes-id i skälet fälls", () => {
    const p = provaFlytt(rad({ skal: "Samma parti har redan åtagandet publicerat, i p-2026-1813." }), mal());
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /intern beteckning/u);
  });

  it("ett grupp-id i skälet fälls", () => {
    const p = provaFlytt(rad({ skal: "Hör till g-sankt-skatt-pa-arbete och räknas där." }), mal());
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /intern beteckning/u);
  });

  it("en kort not räcker — kärnan skrivs av flytten", () => {
    const p = provaFlytt(rad({ skal: "utförligare kalkyl" }), mal());
    assert.deepEqual(p.fel, []);
    assert.match(flytta(mal(), rad({ skal: "utförligare kalkyl" }), "2026-08-25").history!.at(-1)!.change,
      /granskningskön.*utförligare kalkyl/su);
  });
});

describe("sorten följer beloppet", () => {
  it("en inriktning som får ett belopp blir en reform", () => {
    const m = mal({ loftestyp: "inriktning" });
    assert.equal(flytta(m, rad(), "2026-08-25")["loftestyp"], "reform");
  });

  it("en reform förblir en reform", () => {
    const m = mal({ loftestyp: "reform" });
    assert.equal(flytta(m, rad(), "2026-08-25")["loftestyp"], "reform");
  });

  it("en inriktning som får en nolla förblir en inriktning", () => {
    const m = mal({ loftestyp: "inriktning" });
    const nollrad = rad({ kostnad: { ...rad().kostnad, msek_low: 0, msek_base: 0, msek_high: 0 } });
    assert.equal(flytta(m, nollrad, "2026-08-25")["loftestyp"], "inriktning");
  });
});
