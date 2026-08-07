import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAnslagstabell, tabelltal, tabellrader, narmastLoftet } from "../src/anslagstabell.ts";

/** Så ser riksdagens egna tabeller ut: minus som U+2212, tusenavskiljare som &#xa0;. */
const TABELL = `
<p>Motionen föreslår följande.</p>
<table>
  <tr><th>Anslag</th><th>Benämning</th><th>Regeringens förslag</th><th>Avvikelse</th></tr>
  <tr><td>1:1</td><td>Statens kulturråd</td><td>295</td><td>&#8722;400</td></tr>
  <tr><td>1:2</td><td>Bidrag till allmän kulturverksamhet</td><td>1&#xa0;100</td><td>&#177;0</td></tr>
  <tr><td>12:6</td><td>Insatser för den ideella sektorn</td><td>200</td><td>&#8722;1&#xa0;900</td></tr>
  <tr><td>3:1</td><td>Bidrag till litteratur</td><td>150</td><td>&#8212;</td></tr>
  <tr><td colspan="4">Summa</td></tr>
</table>`;

test("tabelltal läser riksdagens sifferformat", () => {
  assert.equal(tabelltal("−400"), -400);
  assert.equal(tabelltal("−1 900"), -1900);
  assert.equal(tabelltal("±0"), 0);
  assert.equal(tabelltal("+250"), 250);
  assert.equal(tabelltal("1 100"), 1100);
});

test("en cell utan läsbart tal är okänd, inte noll", () => {
  assert.equal(tabelltal("—"), null);
  assert.equal(tabelltal(""), null);
  assert.equal(tabelltal("se not 3"), null);
  assert.notEqual(tabelltal("—"), 0);
});

test("tabellrader ger cellerna per rad och struntar i löptexten", () => {
  const rader = tabellrader(TABELL);
  assert.equal(rader.length, 6);
  assert.deepEqual(rader[1], ["1:1", "Statens kulturråd", "295", "−400"]);
});

test("anslagsraderna läses med namn och avvikelse", () => {
  const rader = parseAnslagstabell(TABELL);
  assert.equal(rader.length, 4);
  assert.deepEqual(rader[0], { anslag: "1:1", namn: "Statens kulturråd", avvikelse: -400 });
  assert.deepEqual(rader[2], { anslag: "12:6", namn: "Insatser för den ideella sektorn", avvikelse: -1900 });
});

test("±0 är ett svar — motionen lämnar anslaget orört", () => {
  const rad = parseAnslagstabell(TABELL).find((r) => r.anslag === "1:2");
  assert.equal(rad?.avvikelse, 0);
});

test("en rad utan läsbar siffra får null, aldrig noll", () => {
  const rad = parseAnslagstabell(TABELL).find((r) => r.anslag === "3:1");
  assert.equal(rad?.avvikelse, null);
});

test("avvikelsen tas ur den sista sifferkolumnen, inte regeringens förslag", () => {
  const rad = parseAnslagstabell(TABELL).find((r) => r.anslag === "1:1");
  assert.equal(rad?.avvikelse, -400);
  assert.notEqual(rad?.avvikelse, 295);
});

test("rader utan anslagsbeteckning räknas inte som anslagsrader", () => {
  const anslag = parseAnslagstabell(TABELL).map((r) => r.anslag);
  assert.ok(!anslag.includes("Summa"));
  assert.deepEqual(anslag, ["1:1", "1:2", "12:6", "3:1"]);
});

test("ett dokument utan tabell ger inga rader i stället för att falla", () => {
  assert.deepEqual(parseAnslagstabell("<p>ingen tabell här</p>"), []);
});

test("narmastLoftet rangordnar men väljer inte", () => {
  const rader = parseAnslagstabell(TABELL);
  const traff = narmastLoftet(rader, "Vi vill stärka den ideella sektorn med mer pengar");
  assert.equal(traff[0]?.anslag, "12:6");
  assert.ok(traff.length < rader.length, "rader utan ordöverlapp ska inte föreslås");
});

test("ett löfte utan överlapp får inga kandidater i stället för en gissning", () => {
  const rader = parseAnslagstabell(TABELL);
  assert.deepEqual(narmastLoftet(rader, "sänkt dieselskatt för åkerinäringen"), []);
});

/**
 * Riksdagens riktiga tabeller: rubriken har TRE celler medan dataraderna har
 * fyra, eftersom "Anslag" täcker både nummer och namn. Ett kolumnindex räknat
 * från vänster landar då på regeringens förslag i stället för partiets
 * avvikelse. Så såg HD023747 ut, och så gav parsern regeringens tal som
 * partiets innan kolumnen räknades från slutet.
 */
const RIKTIG = `
<table>
  <tr><th>Anslag</th><th>Regeringens förslag</th><th>Avvikelse från regeringen</th></tr>
  <tr><td>1:1</td><td>Statens kulturråd</td><td>83&#xa0;206</td><td>&#8722;400</td></tr>
  <tr><td>12:6</td><td>Stöd till plats för idrott</td><td>250&#xa0;000</td><td>&#177;0</td></tr>
</table>`;

test("rubriken har färre celler än raderna — avvikelsen räknas från slutet", () => {
  const rader = parseAnslagstabell(RIKTIG);
  const kulturradet = rader.find((r) => r.anslag === "1:1");
  assert.equal(kulturradet?.avvikelse, -400, "ska vara partiets avvikelse");
  assert.notEqual(kulturradet?.avvikelse, 83206, "aldrig regeringens förslag");
});

test("±0 i en riktig tabell betyder att anslaget lämnas orört", () => {
  const rad = parseAnslagstabell(RIKTIG).find((r) => r.anslag === "12:6");
  assert.equal(rad?.avvikelse, 0);
  assert.equal(rad?.namn, "Stöd till plats för idrott");
});

test("sammansatt ord i löftet matchar sin del i anslagsnamnet", () => {
  const rader = parseAnslagstabell(RIKTIG);
  const traff = narmastLoftet(rader, "en nationell satsning på idrottsanläggningar och aktivitetsytor");
  assert.equal(traff[0]?.anslag, "12:6", "idrottsanläggningar ska hitta idrott");
});

test("böjd form matchar samma sak — 'idrotten' och 'idrottsanläggningar'", () => {
  const rader = parseAnslagstabell(`
    <table>
      <tr><th>Anslag</th><th>Regeringens förslag</th><th>Avvikelse från regeringen</th></tr>
      <tr><td>12:1</td><td>Stöd till idrotten</td><td>2&#xa0;152&#xa0;811</td><td>225&#xa0;000</td></tr>
      <tr><td>12:6</td><td>Stöd till plats för idrott</td><td>250&#xa0;000</td><td>&#177;0</td></tr>
      <tr><td>13:3</td><td>Bidrag till tolkutbildning</td><td>57&#xa0;331</td><td>&#177;0</td></tr>
    </table>`);
  const traff = narmastLoftet(rader, "en nationell satsning på idrottsanläggningar och aktivitetsytor");
  const anslag = traff.map((r) => r.anslag);
  assert.ok(anslag.includes("12:1"), "böjd form ska matcha: annars missas raden med pengarna");
  assert.ok(anslag.includes("12:6"));
  assert.ok(!anslag.includes("13:3"), "orelaterade anslag ska inte föreslås");
});
