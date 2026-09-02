/**
 * Schemat ska spegla typen — och glidningen ska synas i koden, inte i datat.
 *
 * `needs_review.schema.json` har `additionalProperties: false`. Läggs ett fält
 * till i `ReviewCandidate` utan att läggas till i schemat händer ingenting
 * alls: provsviten är grön, typkontrollen är grön, och allt ser rätt ut. Först
 * när en pipelinekörning råkar skriva fältet till `data/needs_review.json`
 * faller schemaprovet — på main, långt från den ändring som orsakade det.
 *
 * Det hände med `duplicateWithdrawn`: fältet infördes 2026-09-01, låg orört i
 * en vecka, och fällde main först när tjugo poster i kön hade fått det. Samma
 * lucka fanns kvar för `manualReason`, som ännu inte hunnit skrivas.
 *
 * Provet nedan jämför fälten i typen med egenskaperna i schemat, så att
 * glidningen fälls i samma ändring som inför den.
 *
 * FÄLLS AV: att lägga till ett fält i `ReviewCandidate` utan att lägga till
 * det i schemat.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROT = resolve(import.meta.dirname, "..");

/**
 * Fältnamnen på översta nivån i en interface-deklaration.
 *
 * Läses ur källan och inte ur typsystemet: typer finns inte kvar vid körning,
 * och att bygga en typgenerator för ett prov vore att lägga ett verktyg mellan
 * mätningen och det som mäts. Kapslade objekt hoppas över genom att bara rader
 * med exakt två blanksteg indrag räknas — samma nivå som schemats
 * `properties`.
 */
function faltenI(kalla: string, namn: string): string[] {
  const start = kalla.indexOf(`export interface ${namn} {`);
  assert.notEqual(start, -1, `hittade inte «export interface ${namn}» — har den bytt namn?`);
  const kropp = kalla.slice(start);
  const slut = kropp.indexOf("\n}");
  assert.notEqual(slut, -1, `hittade inget slut på ${namn}`);

  const ut: string[] = [];
  let djup = 0;
  for (const rad of kropp.slice(0, slut).split("\n").slice(1)) {
    const f = /^ {2}(\w+)\??:/u.exec(rad);
    if (djup === 0 && f) ut.push(f[1]!);
    // Kapslade objekt räknas inte: `candidate` är ett fält, dess innehåll är
    // det inte. Klamrarna räknas efter träffen, så fältet självt kommer med.
    djup += (rad.match(/\{/gu) ?? []).length - (rad.match(/\}/gu) ?? []).length;
  }
  return ut;
}

test("needs_review-schemat speglar ReviewCandidate", () => {
  const falten = faltenI(readFileSync(resolve(ROT, "src/review.ts"), "utf8"), "ReviewCandidate");
  const schema = JSON.parse(readFileSync(resolve(ROT, "schemas/needs_review.schema.json"), "utf8")) as {
    items: { properties: Record<string, unknown>; additionalProperties: boolean };
  };

  // Utan den här är hela provet meningslöst: tillåter schemat okända fält
  // spelar det ingen roll vad som står i det.
  assert.equal(
    schema.items.additionalProperties,
    false,
    "schemat måste stänga för okända fält — annars vaktar det ingenting",
  );

  assert.ok(falten.length >= 8, `läste bara ${falten.length} fält ur typen — har formen ändrats?`);

  const iSchemat = new Set(Object.keys(schema.items.properties));
  const saknas = falten.filter((f) => !iSchemat.has(f));
  assert.deepEqual(
    saknas,
    [],
    "fält i ReviewCandidate som saknas i schemat — pipelinen kan skriva dem, och då fälls schemaprovet på main",
  );
});

test("schemats egenskaper är antingen i typen eller uttryckligen kända", () => {
  // Åt andra hållet: ett fält i schemat som ingen skriver är dött, och ett
  // dött fält döljer att schemat inte längre beskriver verkligheten.
  //
  // `group_id` är undantaget och det är avsiktligt: det sätts på kö-posten av
  // `ko-grupp` inför ett delat löfte, inte av utvinningen, och står därför inte
  // i `ReviewCandidate`. Undantaget är skrivet i klartext just för att nästa
  // tillägg ska kräva ett medvetet beslut.
  const KANDA_UTANFOR_TYPEN = ["group_id"];
  const falten = new Set(faltenI(readFileSync(resolve(ROT, "src/review.ts"), "utf8"), "ReviewCandidate"));
  const schema = JSON.parse(readFileSync(resolve(ROT, "schemas/needs_review.schema.json"), "utf8")) as {
    items: { properties: Record<string, unknown> };
  };
  const overblivna = Object.keys(schema.items.properties).filter(
    (p) => !falten.has(p) && !KANDA_UTANFOR_TYPEN.includes(p),
  );
  assert.deepEqual(overblivna, [], "egenskaper i schemat som ingen typ bär");
});
