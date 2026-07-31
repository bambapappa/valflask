import { test } from "node:test";
import assert from "node:assert/strict";
import { stamma } from "../src/stam.ts";

/**
 * Utfallen nedan är hämtade ur referensimplementationen (snowballstemmer
 * 3.1.1, svenska). Hela vår ordlista — 7 137 unika ord ur riksdagens egna
 * handlingstitlar och löftestexterna — jämfördes ord för ord mot
 * referensen vid införandet: noll avvikelser. Facit ligger här i stället
 * för som beroende, så att indexet går att reproducera ur repot ensamt.
 */
const FACIT: Array<[string, string]> = [
  // Substantivböjning
  ["bil", "bil"],
  ["bilen", "bil"],
  ["bilar", "bil"],
  ["bilarna", "bil"],
  ["vård", "vård"],
  ["vården", "vård"],
  ["vårdplatser", "vårdplats"],
  // Verbböjning — kärnan i varför stamning behövs
  ["höja", "höj"],
  ["höjas", "höj"],
  ["bygga", "bygg"],
  ["byggas", "bygg"],
  ["byggande", "bygg"],
  // Adjektiv
  ["klok", "klok"],
  ["kloka", "klok"],
  ["klokare", "klok"],
  // Bestämd form neutrum: "-et" stryks när villkoret håller
  ["stödet", "stöd"],
  ["försvaret", "försvar"],
  // ... men skyddas av undantagen i "-itet"-ord
  ["kriminalitet", "kriminalitet"],
  // Oböjda ord som inte ska röras
  ["fjäril", "fjäril"],
  ["polis", "polis"],
  ["politik", "politik"],
  ["stöd", "stöd"],
  ["arbetslöshetsförsäkringen", "arbetslöshetsförsäkring"],
  ["krigssjukvård", "krigssjukvård"],
];

test("stamma: utfallet följer referensimplementationen", () => {
  for (const [ord, vantat] of FACIT) {
    assert.equal(stamma(ord), vantat, `${ord} skulle ge ${vantat}`);
  }
});

test("stamma: böjningsformer av samma ord möts", () => {
  for (const former of [
    ["höja", "höjas"],
    ["bygga", "byggas", "byggande"],
    ["bil", "bilen", "bilar", "bilarna"],
  ]) {
    const stammar = new Set(former.map(stamma));
    assert.equal(stammar.size, 1, `${former.join("/")} skulle ge en enda stam`);
  }
});

test("stamma: skilda ord slås inte ihop", () => {
  // Den verkliga risken med stamning — kontrollerad, inte antagen.
  for (const [a, b] of [
    ["polis", "politik"],
    ["vård", "värd"],
    ["stat", "stad"],
    ["lag", "låg"],
  ] as Array<[string, string]>) {
    assert.notEqual(stamma(a), stamma(b), `${a} och ${b} är skilda ord`);
  }
});

test("stamma: algoritmens kända luckor — bestämd form av a-ord", () => {
  // Snowball stryker inte bestämd ändelse på a-ord: "skola"/"skolan" och
  // "flicka"/"flickan" möts alltså INTE. Kontrollerat mot referensen —
  // detta är algoritmens beteende, inte en bugg hos oss. Följden för
  // indexet är en missad kandidat, aldrig en felaktig koppling.
  assert.equal(stamma("skola"), "skol");
  assert.equal(stamma("skolan"), "skolan");
  assert.notEqual(stamma("skola"), stamma("skolan"));
  // Plural möts däremot med grundformen.
  assert.equal(stamma("skolor"), "skol");
  assert.equal(stamma("skolorna"), "skol");
});

test("stamma: korta ord och främmande tecken lämnas orörda", () => {
  assert.equal(stamma("ab"), "ab");
  assert.equal(stamma("EU"), "EU"); // versaler → orört
  assert.equal(stamma("co₂"), "co₂"); // tecken utanför alfabetet → orört
});

test("stamma: är deterministisk", () => {
  const ord = "arbetslöshetsförsäkringen";
  assert.equal(stamma(ord), stamma(ord));
});
