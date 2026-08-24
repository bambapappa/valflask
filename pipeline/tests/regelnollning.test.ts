/**
 * Nollningens verkställighet. Regeln står i `src/regelnollning.ts`.
 *
 * Provningen av raderna ligger i `utredning-med-belopp.test.ts`, som mäter
 * svepets urval. Det här provar vad `nolla()` faktiskt lämnar efter sig.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  andring,
  nolla,
  provaNollrad,
  REGLER,
  UTRAKNING_MAX_TECKEN,
  type Lofte,
} from "../src/regelnollning.ts";

describe("ankaren följer med ut när uträkningen skrivs om", () => {
  /**
   * Regressionsprov för felet 2026-08-23: ankarpasset satte ett ankare, och
   * nästa svep nollade posten och skrev om uträkningen — men lämnade ankaret
   * kvar. Sajten renderar ankaret som en länk, så läsaren fick veta att
   * beloppet kom från ett annat löfte, intill en uträkning som säger att det
   * inte kommer någonstans ifrån.
   */
  const lofte = {
    id: "p-2026-1548",
    status: "aktiv",
    cost: {
      msek_low: 0,
      msek_base: 3,
      msek_high: 10,
      period: "engang",
      calculation: "Jämförbart löfte om styrning gav 3 msek.",
      anchor_ids: ["p-2026-0975"],
    },
  };
  const rad = {
    id: "p-2026-1548",
    regel: "utredning" as const,
    utrakning:
      "Löftet är att införa tydliga servicedirektiv i myndigheternas regleringsbrev. Regeln är att " +
      "utrednings- och planlöften prissätts till noll: arbetet utförs av statens befintliga förvaltning.",
    skal: "beloppet var arbetstid i den befintliga styrprocessen och inte en ny utgift",
  };

  it("nollar och rensar ankaret i samma drag", () => {
    const efter = nolla(lofte, rad, "2026-08-23");
    assert.equal(efter.cost.msek_base, 0);
    assert.deepEqual(efter.cost.anchor_ids, []);
  });

  it("rensar ankaret även vid en delrättelse", () => {
    // Också då är den nya uträkningen hela grunden för det som blir kvar.
    const efter = nolla(lofte, { ...rad, spann: { low: 0, base: 1, high: 5 } }, "2026-08-23");
    assert.equal(efter.cost.msek_base, 1);
    assert.deepEqual(efter.cost.anchor_ids, []);
  });
});

/**
 * De två regler som H21 behövde, och det led som gjorde en ny regel farlig.
 *
 * Rättelsenotens ord valdes tidigare av en if-kedja vars sista led var «lagar
 * och förbud». En regel som lades till utan att röra kedjan beskrevs alltså i
 * PUBLICERAD text som en lag- eller förbudsnollning. Ordlistan är numera en
 * `Record<Regel, string>`, så typkontrollen faller i stället.
 */
describe("reglerna och deras ord i noten", () => {
  it("varje regel har en egen text som säger vad den nollar", () => {
    for (const [namn, text] of Object.entries(REGLER)) {
      assert.ok(text.length > 60, `${namn}: regeltexten är för kort för att förklara något`);
      assert.match(text, /noll/u, `${namn}: regeltexten säger inte att beloppet blir noll`);
    }
  });

  it("gällande-regeln säger att det är den NYA kostnaden som räknas", () => {
    assert.match(REGLER.gallande, /nya nettokostnad/u);
  });

  it("ankarlöst säger att ingen siffra är bättre än två gissningar", () => {
    assert.match(REGLER.ankarlost, /gissningar/u);
  });

  it("en nollning enligt en ny regel beskrivs inte som en lagändring", () => {
    const lofte = {
      id: "p-2026-2431",
      status: "aktiv",
      cost: { msek_low: 7000, msek_base: 12000, msek_high: 15000, period: "per_ar", calculation: "gammal" },
      history: [],
    };
    const nytt = nolla(lofte as unknown as Lofte, {
      id: "p-2026-2431",
      regel: "gallande",
      utrakning: `Stödet löper redan. ${REGLER.gallande}`,
      skal: "citatet lovar att fortsätta, inte att öka",
    }, "2026-08-24");
    const senaste = nytt.history!.at(-1)!.change;
    assert.doesNotMatch(senaste, /lagändring|förbud/u);
    assert.match(senaste, /oförändrad nivå är ingen ny kostnad/u);
  });
});

describe("tecknet i rättelsenotens verb", () => {
  // `toLocaleString("sv-SE")` skiljer tusental med U+00A0, inte mellanslag.
  const platt = (t: string) => t.replace(/\u00a0/gu, " ");

  it("en minskning heter minskar", () => {
    assert.equal(platt(andring(20_000)), "minskar med 20 000 miljoner kronor");
  });

  /**
   * Regressionsprov för 2026-08-24: en nollad BESPARING gav ett negativt delta,
   * och noten sade «M minskar med −20 000 miljoner kronor».
   */
  it("en nollad besparing heter ökar, inte minskar med minus", () => {
    const text = andring(-20_000);
    assert.equal(platt(text), "ökar med 20 000 miljoner kronor");
    assert.doesNotMatch(text, /−|-\d/u);
  });

  it("noll får ett verb och inget tecken", () => {
    assert.doesNotMatch(andring(0), /−/u);
  });
});

describe("uträkningens längd prövas innan något skrivs", () => {
  const lofte = {
    id: "p-2026-2829",
    status: "aktiv",
    cost: { msek_base: 5000, period: "per_ar" },
  } as unknown as Lofte;

  it("en uträkning över schemats tak fäller raden", () => {
    const r = provaNollrad(lofte, {
      id: "p-2026-2829",
      regel: "ankarlost",
      utrakning: "x".repeat(UTRAKNING_MAX_TECKEN + 1),
      skal: "y".repeat(50),
    });
    assert.equal(r.ok, false);
    assert.ok(r.fel.some((f) => /tecken, och schemat tar/u.test(f)), r.fel.join(" · "));
  });

  it("exakt taket släpps igenom", () => {
    const r = provaNollrad(lofte, {
      id: "p-2026-2829",
      regel: "ankarlost",
      utrakning: "x".repeat(UTRAKNING_MAX_TECKEN),
      skal: "y".repeat(50),
    });
    assert.deepEqual(r.fel.filter((f) => /tecken/u.test(f)), []);
  });
});
