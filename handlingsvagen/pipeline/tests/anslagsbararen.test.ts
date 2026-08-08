import { test } from "node:test";
import assert from "node:assert/strict";
import {
  provaAnslagsbararen,
  motiveringsnot,
  radensBelopp,
  utanTidigareAnslagsnot,
  type Anslagsmatning,
} from "../src/anslagsbararen.ts";

/**
 * Raderna nedan står i riksdagens egna motionstabeller, hämtade av
 * `anslag-tabell --klass-a` den 8 augusti 2026.
 */

const KRISBEREDSKAP = { anslag: "2:4", namn: "Krisberedskap", avvikelse: 252000 };
const IDROTT_STILLA = { anslag: "12:6", namn: "Stöd till plats för idrott", avvikelse: 0 };
const IMR = { anslag: "6:6", namn: "Institutet för mänskliga rättigheter", avvikelse: 25000 };
const OKAND = { anslag: "1:4", namn: "Ospecificerat", avvikelse: null };
const KRIMINALVARDEN = { anslag: "1:6", namn: "Kriminalvården", avvikelse: 400000 };

/** En träff med sitt ordöverlapp. Två delade ordled räcker, ett gör det inte. */
const t = (rad: { anslag: string; namn: string; avvikelse: number | null }, poang = 2) => ({ rad, poang });

function matning(over: Partial<Anslagsmatning> = {}): Anslagsmatning {
  return {
    koppling: "k-2026-0142",
    promise_id: "p-2026-0412",
    tabellrader: 24,
    traffar: [t(KRISBEREDSKAP)],
    andrade: [t(KRISBEREDSKAP)],
    fel: null,
    ...over,
  };
}

test("en rad som bär en ändring bär löftet när löftet består i pengar", () => {
  const p = provaAnslagsbararen(matning(), "pengar");
  assert.equal(p.utfall, "bar");
  assert.equal(p.drasIn, false);
  assert.equal(p.rad?.anslag, "2:4");
  assert.ok(p.innebord.includes("+252 000"), "beloppet ska stå i klartext");
});

/**
 * Regeln som är lättast att göra fel. Tabellen HAR en rad för Institutet för
 * mänskliga rättigheter, med 25 000 tusen kronor mer. Löftet är att
 * grundlagsskydda institutet — en regel. Beslutet 2026-08-07 säger att ett
 * anslagsyrkande ALDRIG kan bära ett sådant löfte, så pengarna avgör ingenting.
 * Ett svep som bara frågar "finns en rad som rör sig?" hade sagt att den bär.
 */
test("en rad som rör sig bär INTE ett löfte om en regel", () => {
  const p = provaAnslagsbararen(matning({ traffar: [t(IMR)], andrade: [t(IMR)] }), "regel");
  assert.equal(p.utfall, "loftet_ar_en_regel");
  assert.equal(p.drasIn, true);
  assert.equal(p.rad, null, "ingen rad får pekas ut som bärare");
});

test("ett skattelöfte bärs inte av en utgiftstabell", () => {
  const p = provaAnslagsbararen(matning(), "skatt");
  assert.equal(p.utfall, "loftet_ar_en_skatt");
  assert.equal(p.drasIn, true);
});

test("rader som står ±0 betyder att motionen inte begärde någon ändring", () => {
  const p = provaAnslagsbararen(matning({ traffar: [t(IDROTT_STILLA)], andrade: [] }), "pengar");
  assert.equal(p.utfall, "raden_star_stilla");
  assert.equal(p.drasIn, true);
  assert.equal(p.rad?.anslag, "12:6", "raden ska pekas ut även när den inte bär");
});

/** Ett okänt tal får varken läsas som noll eller som en ändring. */
test("en rad utan läsbart tal räknas inte som en ändring", () => {
  const p = provaAnslagsbararen(matning({ traffar: [t(OKAND)], andrade: [] }), "pengar");
  assert.equal(p.utfall, "raden_star_stilla");
});

test("ingen rad som delar sakord kräver en läsning, inte en indragning", () => {
  const p = provaAnslagsbararen(matning({ traffar: [], andrade: [] }), "pengar");
  assert.equal(p.utfall, "ingen_rad_delar_sakord");
  assert.equal(p.drasIn, false, "ordöverlapp är en läshjälp, inte ett bevis");
  assert.equal(p.kraverLasning, true);
});

test("en motion utan anslagstabell bär inget belopp", () => {
  const p = provaAnslagsbararen(matning({ tabellrader: 0, traffar: [], andrade: [] }), "pengar");
  assert.equal(p.utfall, "ingen_tabell");
  assert.equal(p.drasIn, true);
});

/** Ett nätfel får aldrig se ut som ett underkänt bevis. */
test("en tabell som inte gick att hämta är oavgjord, inte fällande", () => {
  const p = provaAnslagsbararen(matning({ fel: "hämtningen gick inte fram" }), "pengar");
  assert.equal(p.utfall, "oavgjort");
  assert.equal(p.drasIn, false);
});

/**
 * `narmastLoftet` sorterar på ordöverlapp, inte på belopp. Står den närmaste
 * träffen ±0 medan den andra bär ändringen ska motiveringen visa den som rör
 * sig — annars visas en stillastående rad som bevis för att pengar begärdes.
 */
test("bäraren väljs bland de ändrade, inte bland alla träffar", () => {
  const p = provaAnslagsbararen(
    matning({ traffar: [t(IDROTT_STILLA), t(KRISBEREDSKAP)], andrade: [t(KRISBEREDSKAP)] }),
    "pengar",
  );
  assert.equal(p.utfall, "bar");
  assert.equal(p.rad?.anslag, "2:4");
});

/**
 * Fyndet som tröskeln finns för. Anslaget "Kriminalvården" delar ordstammen
 * "kriminal" med löftet om särskilt stöd till barn och unga i riskzon för
 * kriminalitet — ett ordled, och det avgör ingenting om det löftet. Utan
 * tröskeln hade raden skrivits in i en publicerad motivering som den rad som
 * bär löftet.
 */
test("en rad som delar bara ett ordled får inte skrivas in som bärare", () => {
  const p = provaAnslagsbararen(
    matning({ traffar: [t(KRIMINALVARDEN, 1)], andrade: [t(KRIMINALVARDEN, 1)] }),
    "pengar",
  );
  assert.equal(p.utfall, "svag_traff");
  assert.equal(p.drasIn, false, "en svag träff är inget skäl att dra in heller");
  assert.equal(p.kraverLasning, true);
  assert.equal(p.rad?.anslag, "1:6", "raden ska pekas ut så att läsningen vet vad som ska prövas");
});

test("motiveringsnoten namnger raden, beloppet och enheten", () => {
  const not = motiveringsnot(KRISBEREDSKAP, "2026-08-08");
  assert.ok(not.includes("2:4 Krisberedskap"));
  assert.ok(not.includes("+252 000"));
  assert.ok(not.includes("tusental"), "enheten måste stå, annars läser någon kronor");
  assert.ok(not.includes("2026-08-08"));
});

test("en negativ avvikelse skrivs med minustecken, inte som ett positivt tal", () => {
  assert.equal(radensBelopp({ anslag: "1:1", namn: "Polismyndigheten", avvikelse: -261000 }), "−261 000");
});

test("en tidigare anslagsnot skrivs inte in två gånger", () => {
  const forsta = `Motionen stöder löftet. ${motiveringsnot(KRISBEREDSKAP, "2026-08-08")}`;
  assert.equal(utanTidigareAnslagsnot(forsta), "Motionen stöder löftet.");
  assert.equal(utanTidigareAnslagsnot("Bara en motivering."), "Bara en motivering.");
});
