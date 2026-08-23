/**
 * Nollningens verkställighet. Regeln står i `src/regelnollning.ts`.
 *
 * Provningen av raderna ligger i `utredning-med-belopp.test.ts`, som mäter
 * svepets urval. Det här provar vad `nolla()` faktiskt lämnar efter sig.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nolla } from "../src/regelnollning.ts";

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
