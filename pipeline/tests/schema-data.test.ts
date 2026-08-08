import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";

/**
 * Datat mot sitt eget schema, utan att bygga sajten.
 *
 * Schemat prövades förut bara av T3, som läser den **byggda** utdatan och
 * därför bara kan köras efter ett fullt sajtbygge — i praktiken bara i
 * driftsättningen. En dataändring kunde alltså gå igenom `pnpm test`, `tsc`
 * och varenda kontroll en människa kör lokalt, och ändå fälla bygget.
 *
 * Det hände 2026-08-08: en omskriven uträkning blev 1 030 tecken mot schemats
 * tak på 800. Felet var trivialt och kostade ett helt varv genom
 * driftsättningen, för ingenting närmare arbetet mätte det.
 *
 * Provet läser samma schemafiler som T3 gör och samma datafiler som pipelinen
 * skriver. Det är alltså inte en andra sanning — det är samma sanning, mätt
 * tidigare.
 */

const ROT = resolve(import.meta.dirname, "../..");
const SCHEMAN = resolve(ROT, "pipeline/schemas");
const DATA = resolve(ROT, "data");

/** Datafilen och schemat som gäller den. Samma karta som T3 bär. */
const PAR: Array<[string, string]> = [
  ["promises.json", "promises.schema.json"],
  ["parties.json", "parties.schema.json"],
  ["people.json", "people.schema.json"],
  ["constants.json", "constants.schema.json"],
  ["changelog.json", "changelog.schema.json"],
  ["needs_review.json", "needs_review.schema.json"],
  ["seen.json", "seen.schema.json"],
  ["constellations.json", "constellations.schema.json"],
];

for (const [datafil, schemafil] of PAR) {
  test(`${datafil} håller sitt schema`, (t) => {
    const s = resolve(SCHEMAN, schemafil);
    const d = resolve(DATA, datafil);
    if (!existsSync(s) || !existsSync(d)) {
      t.skip(`${existsSync(s) ? datafil : schemafil} saknas`);
      return;
    }
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const prova = ajv.compile(JSON.parse(readFileSync(s, "utf8")));
    const ok = prova(JSON.parse(readFileSync(d, "utf8")));
    // Felet ska säga vilken post och vilket fält, inte bara att något är fel.
    // Ett schemafel utan sökväg tvingar nästa person att leta i 527 poster.
    const fel = (prova.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message} ${JSON.stringify(e.params)}`)
      .join("\n  ");
    assert.ok(ok, `${datafil} bryter mot ${schemafil}:\n  ${fel}`);
  });
}
