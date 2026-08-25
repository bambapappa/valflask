/**
 * `statedBaseMsek` — beloppet uträkningen själv drar som slutsats.
 *
 * VARFÖR PROVEN SER UT SÅ HÄR. Femton kö-poster fälldes 2026-08-25 av
 * kontrollen `belopp_avviker`, och samtliga femton var FALSKA: uträkningarna
 * var riktiga, och det var mätningen som läste fel tal. Varje prov nedan är en
 * av de femton uträkningarna, ordagrant, med det belopp den faktiskt drar.
 *
 * Sökningen larmade alltså på sina egna rätträknade löften — precis den fälla
 * modulens eget huvud säger att den gamla sökningen gick i, och som gjorde den
 * obrukbar. Provet finns för att den inte ska gå i den igen.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { statedBaseMsek } from "../src/quality-scan.ts";

/** Uträkning → basbeloppet den drar, ur de femton falska larmen. */
const FALLEN: Array<[string, number | null, string]> = [
  [
    "Sveriges försvarsbudget ~120 mdkr/år. Löftet om 'stärkt' försvar tolkas som 10–50 % ökning av försvarsanslagen: 120 000 × 0,1–0,5 ≈ 12 000–60 000 mkr/år. Bas 25 % ≈ 30 000 mkr. Osäkerhet hög pga vag formulering.",
    30000,
    "andelen är inte beloppet — men meningen bär beloppet efter tecknet",
  ],
  [
    "Antag nuvarande järnvägsunderhåll 8–12 mdkr/år. 35 % = 2,8–4,2 mdkr. Bas 3,5 mdkr = 3 500 mkr; spann 2 500–5 000 mkr.",
    3500,
    "svaret står efter likhetstecknet, inte sist i meningen",
  ],
  [
    "Netto för staten ≈ 0,5–4,5 mdkr/år; bas 2 000 msek motsvarar en reform i storlek med tidigare större utbyggnader av reseavdraget.",
    2000,
    "msek är en miljonenhet även när meningen också nämner mdkr",
  ],
  [
    "Summa bas ~1 100 msek/år; spannet räknar med nettoeffekt nära noll i lågänden och fullt tillägg i högängen.",
    1100,
    "ungefärstecknet före talet hindrar inte läsningen",
  ],
  ["Bas 10 000 kr.", null, "ett tal i kronor är aldrig ett basbelopp i miljoner"],
  [
    "Spann: 300-1000 mkr/år, base 500 mkr som mittpunkt.",
    500,
    "«base» stavat på engelska är samma ord",
  ],
  ["Bas 10 % ≈ 500 mkr/år.", 500, "andel plus svar"],
  [
    "Del 1 ≈ 50–200 msek. Del 2 ≈ 200–1 000 msek. Sammanlagt: låg ~150, mitten ~500, hög ~1 200 msek.",
    500,
    "uppräkningen låg–mitten–hög med enheten sist: mittentalet är basbeloppet",
  ],
  [
    "Låg: 1 mdkr×0,7 %+5 mkr≈12 mkr; bas: 3 mdkr×1,5 %+15 mkr≈60 mkr; hög: 6 mdkr×2,3 %+40 mkr≈180 mkr. Utlånat kapital räknas inte som kostnad.",
    60,
    "ledet slutar vid semikolonet, inte vid decimalkommat",
  ],
  [
    "Låg: 10×1=10 mkr/år, bas: 20×1.5=30 mkr/år, hög: 30×2=60 mkr/år.",
    30,
    "sista beloppet i BASENS led, inte i meningen",
  ],
  ["Bas 100 GWh → 30 mkr.", 30, "en storhet räknas om till pengar av pilen"],
  [
    "Summa: låg ~5, bas ~30, hög ~100 msek, engångskostnad.",
    30,
    "basen står namngiven mitt i uppräkningen",
  ],
  ["Låg=2, bas=10, hög=20 msek.", 10, "likhetstecknet som separator; kommat avslutar ledet"],
];

describe("de femton falska larmen läses rätt", () => {
  for (const [calc, vantat, varfor] of FALLEN) {
    it(varfor, () => {
      assert.equal(statedBaseMsek(calc), vantat, calc.slice(0, 70));
    });
  }
});

describe("styckpriser är inte basbelopp", () => {
  it("«à 1,2 mkr» efter basbeloppet är härledningen, inte svaret", () => {
    assert.equal(statedBaseMsek("Bas 300 ≈ 250 barnmorskor à 1,2 mkr."), 300);
  });
  it("«per apotek» gör talet till ett styckpris", () => {
    assert.equal(
      statedBaseMsek("Basbeloppet är en miljon kronor per apotek, alltså 300 miljoner kronor per år."),
      300,
    );
  });
  it("«per år» är en takt och räknas som basbelopp", () => {
    assert.equal(statedBaseMsek("Bas 300 mkr/år."), 300);
  });
  it("kedjan räknar till slutet: 50 × 10 mkr = 500 mkr", () => {
    assert.equal(statedBaseMsek("Bas: 50 kontor × 10 mkr = 500 mkr/år."), 500);
  });
});

describe("det som redan fungerade fungerar än", () => {
  it("ett rent basbelopp med enhet", () => {
    assert.equal(statedBaseMsek("Sammantaget 650 miljoner kronor per år."), 650);
  });
  it("miljarder skalas", () => {
    assert.equal(statedBaseMsek("Bas 3 miljarder kronor."), 3000);
  });
  it("en mening med flera belopp och ingen bas ger inget svar", () => {
    assert.equal(statedBaseMsek("Totalt någonstans mellan 100 miljoner kronor och 900 miljoner kronor."), null);
  });
});
