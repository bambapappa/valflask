/*
 * Strukturgrind för partisidan (Vy 2) och ledamotssidan (Vy 3):
 * partisidan visar bara partiets egna löften och en konsekvent summa; avvikelser
 * på ledamotssidan gäller bara voteringar och aldrig frånvaro (b-0004); sökindexet
 * når partier och alla sittande ledamöter. Kör: npm test (från site/).
 */
import assert from "node:assert";
import { partiKoder, buildPartiSida, ledamotIds, buildLedamotSida } from "../src/lib/vyer.ts";
import { buildSokIndex } from "../src/lib/sok.ts";
import { getLoften, getPersoner } from "../src/lib/data.ts";

// ---- Vy 2 ----
const koder = partiKoder();
assert.strictEqual(koder.length, 8, "åtta partier");
const loftenById = new Map(getLoften().map((l) => [l.id, l]));
for (const kod of koder) {
  const s = buildPartiSida(kod);
  assert.ok(s, `partisida ${kod} saknas`);
  for (const l of s!.loften) {
    assert.ok(loftenById.get(l.id)?.parties.includes(kod), `${l.id} ägs inte av ${kod}`);
  }
  assert.strictEqual(s!.summa.total_loften, s!.loften.length, `summan stämmer för ${kod}`);
  assert.strictEqual(s!.summa.ingen_handling, s!.loften.length - s!.summa.vagda, `utan-handling stämmer för ${kod}`);
  for (const h of s!.handlingar) {
    assert.ok(["i_linje", "emot", "avstod"].includes(h.utslag), `giltigt utslag i ${kod}`);
  }
}

// ---- Vy 3 ----
const ids = ledamotIds();
assert.strictEqual(ids.length, getPersoner().length, "en sida per sittande ledamot");
assert.ok(ids.length >= 400, "runt 425 sittande");
let medMerit = 0;
let avvikelser = 0;
for (const id of ids) {
  const s = buildLedamotSida(id);
  assert.ok(s, `ledamotssida ${id} saknas`);
  if (s!.meriter.length) medMerit += 1;
  for (const m of s!.meriter) {
    for (const p of m.poster) {
      if (p.avvikelse) {
        avvikelser += 1;
        assert.strictEqual(p.handling.kind, "votering", "avvikelse gäller bara voteringar");
        assert.notStrictEqual(p.utslag, "franvarande", "frånvaro är aldrig en avvikelse");
      }
    }
  }
}
assert.ok(medMerit > 0, "minst en ledamot ska ha merit");

// ---- Sök ----
const sok = buildSokIndex();
assert.strictEqual(sok.filter((p) => p.typ === "parti").length, 8, "åtta partier i sökindex");
assert.strictEqual(sok.filter((p) => p.typ === "ledamot").length, getPersoner().length, "alla ledamöter i sökindex");
for (const p of sok.filter((p) => p.typ === "parti" || p.typ === "ledamot")) {
  assert.ok(p.url, `sökpost ${p.id} saknar url`);
}

console.log(`vyer: 8 partisidor, ${ids.length} ledamotssidor (${medMerit} med merit, ${avvikelser} avvikelser), sökindex ${sok.length} poster — alla grindar gröna`);
