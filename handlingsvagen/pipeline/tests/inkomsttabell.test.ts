import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseInkomsttabell,
  narmastLoftetMedPoang,
  radensBelopp,
} from "../src/inkomsttabell.ts";

/**
 * Formen är hämtad ur Centerpartiets budgetmotion HD023811 och Miljöpartiets
 * HB022689: nummer och namn i samma cell, regeringens förslag i mitten,
 * avvikelsen sist, minus som U+2212 och tusenavskiljare som hårt mellanslag.
 */
const BUDGETARET = `
<table>
<tr><th>Inkomsttitel</th><th>Regeringens förslag</th><th>Avvikelse från regeringen</th></tr>
<tr><td>1200 Indirekta skatter på arbete</td><td>814 027 500</td><td>&#8722;7 377 500</td></tr>
<tr><td>1210 Arbetsgivaravgifter</td><td>800 382 003</td><td>&#8722;200 000</td></tr>
<tr><td>1280 Nedsättningar</td><td>&#8722;13 312 716</td><td>&#8722;6 935 000</td></tr>
<tr><td>1410 Mervärdesskatt</td><td>602 172 481</td><td>±0</td></tr>
<tr><td>&nbsp;</td><td></td><td></td></tr>
</table>`;

/** De beräknade åren: samma rubrikord, ingen kolumn för regeringens förslag, miljoner. */
const BERAKNADE_AREN = `
<table>
<tr><th>Inkomsttitel</th><th colspan="2">Avvikelse från regeringen</th></tr>
<tr><td></td><td>2027</td><td>2028</td></tr>
<tr><td>1210 Arbetsgivaravgifter</td><td>&#8722;30</td><td>&#8722;50</td></tr>
</table>`;

test("raderna läses med nummer, namn och avvikelse", () => {
  const rader = parseInkomsttabell(BUDGETARET);
  assert.deepEqual(rader, [
    { titel: "1200", namn: "Indirekta skatter på arbete", avvikelse: -7377500 },
    { titel: "1210", namn: "Arbetsgivaravgifter", avvikelse: -200000 },
    { titel: "1280", namn: "Nedsättningar", avvikelse: -6935000 },
    { titel: "1410", namn: "Mervärdesskatt", avvikelse: 0 },
  ]);
});

/**
 * Regressionen som betyder mest. Budgetårets tabell anger tusental kronor, de
 * beräknade åren miljoner, och rubrikerna är i övrigt identiska. Läses fel
 * tabell blir varje belopp tusen gånger fel utan att se orimligt ut.
 */
test("bara budgetårets tabell läses — de beräknade åren har en annan enhet", () => {
  const rader = parseInkomsttabell(BERAKNADE_AREN);
  assert.deepEqual(rader, []);

  const bada = parseInkomsttabell(BUDGETARET + BERAKNADE_AREN);
  assert.equal(bada.length, 4);
  assert.equal(bada.find((r) => r.titel === "1210")?.avvikelse, -200000);
});

test("±0 är ett svar, en olastbar cell är okänd", () => {
  const rader = parseInkomsttabell(`
<table>
<tr><th>Inkomsttitel</th><th>Regeringens förslag</th><th>Avvikelse från regeringen</th></tr>
<tr><td>1410 Mervärdesskatt</td><td>602 172 481</td><td>±0</td></tr>
<tr><td>1470 Skatt på vägtrafik</td><td>21 400 145</td><td>&#8211;</td></tr>
</table>`);
  assert.equal(rader[0]!.avvikelse, 0);
  assert.equal(rader[1]!.avvikelse, null);
});

test("en tabell utan avvikelsekolumn ger inga rader — okänt får inte bli noll", () => {
  assert.deepEqual(
    parseInkomsttabell(`
<table>
<tr><th>Inkomsttitel</th><th>Regeringens förslag</th></tr>
<tr><td>1210 Arbetsgivaravgifter</td><td>800 382 003</td></tr>
</table>`),
    [],
  );
});

test("rangordningen lägger de rader som delar sakord med löftet först", () => {
  const rader = parseInkomsttabell(BUDGETARET);
  const traffar = narmastLoftetMedPoang(
    rader,
    "Vi vill slopa arbetsgivaravgiften för de första tio anställda i småföretag.",
  );
  assert.ok(traffar.every((t) => t.poang > 0));
  assert.ok(!traffar.some((t) => t.rad.titel === "1410"));
});

/**
 * Regressionen på summeringsraden. "1200 Indirekta skatter på arbete" och
 * "1210 Arbetsgivaravgifter" delar båda ordet *arbete* med löftet, och 1200
 * står först i tabellen. Utan regeln om att den snävare titeln går före hade
 * summan av alla skatter på arbete skrivits i motiveringen som den rad som bär
 * ett löfte om en enda avgift.
 */
test("vid lika ordöverlapp går den snävare titeln före summeringsraden", () => {
  const rader = parseInkomsttabell(BUDGETARET);
  const traffar = narmastLoftetMedPoang(
    rader,
    "Vi vill slopa arbetsgivaravgiften för de första tio anställda i småföretag.",
  );
  const i1200 = traffar.findIndex((t) => t.rad.titel === "1200");
  const i1210 = traffar.findIndex((t) => t.rad.titel === "1210");
  assert.equal(traffar[i1200]!.poang, traffar[i1210]!.poang, "provet förutsätter lika överlapp");
  assert.ok(i1210 < i1200);
  assert.equal(traffar[0]!.rad.titel, "1210");
});

test("beloppet skrivs i tabellens enhet med tecknet kvar och vanliga mellanslag", () => {
  assert.equal(radensBelopp({ titel: "1280", namn: "Nedsättningar", avvikelse: -6935000 }), "−6 935 000");
  assert.equal(radensBelopp({ titel: "1410", namn: "Mervärdesskatt", avvikelse: 0 }), "±0");
  assert.equal(radensBelopp({ titel: "1470", namn: "Skatt på vägtrafik", avvikelse: null }), "okänt belopp");
  assert.ok(!radensBelopp({ titel: "1280", namn: "N", avvikelse: -6935000 }).includes(" "));
});
