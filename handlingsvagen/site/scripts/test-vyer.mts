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
  // De två talen ERSÄTTER "utan handling ännu" på sidan, så de måste summera
  // till det. Faller den här grinden visar partisidan ett tal som inte går
  // ihop — och just den uppdelningen är hela poängen: den ena hälften betyder
  // "vi har letat", den andra "vi har inte letat".
  assert.strictEqual(
    s!.summa.sokt_utan_traff + s!.summa.ej_sokt,
    s!.summa.ingen_handling,
    `genomsökt + ej genomsökt = utan handling för ${kod}`,
  );

  // Talen högst upp måste täcka VARJE vägt löfte. Utan den här grinden kunde
  // ett utfall räknas fram utan att visas — "både och" gjorde precis det, och
  // ett löfte med en handling i linje och en emot hade då försvunnit ur alla
  // talen utan att någon märkte det.
  assert.strictEqual(
    s!.summa.i_linje + s!.summa.emot + s!.summa.bade_och + s!.summa.avstod,
    s!.summa.vagda,
    `utfallen täcker alla vägda löften för ${kod}`,
  );

  // Summan handlar om partiets EGNA löften; handlingslistan gjorde det inte.
  // Populationerna hålls isär, annars läser en nolla i toppen som ett
  // räknefel över en lista full av emot-rader.
  for (const h of s!.handlingar) {
    assert.ok(["i_linje", "emot", "avstod"].includes(h.utslag), `giltigt utslag i ${kod}`);
    assert.ok(h.eget_lofte, `${h.koppling_id} listas som eget löfte men är det inte`);
    assert.ok(h.lofte_partier.includes(kod), `${h.koppling_id}: löftet ägs inte av ${kod}`);
  }
  for (const h of s!.handlingar_andras) {
    assert.ok(!h.eget_lofte, `${h.koppling_id} listas som annans löfte men är ${kod}s eget`);
    assert.ok(!h.lofte_partier.includes(kod), `${h.koppling_id}: löftet ägs av ${kod}`);
  }

  // Varje rad ska kunna säga vems löfte den vägdes mot.
  for (const h of [...s!.handlingar, ...s!.handlingar_andras]) {
    assert.strictEqual(
      h.lofte_partinamn.length,
      h.lofte_partier.length,
      `${h.koppling_id}: partinamn saknas för löftets partier`,
    );
  }

  // Talet för emot mot andras löften måste stämma med listan under det.
  assert.strictEqual(
    s!.summa.emot_andras,
    s!.handlingar_andras.filter((h) => h.utslag === "emot").length,
    `emot-mot-andras stämmer med listan för ${kod}`,
  );

  // Ett löfte som partiet självt handlat emot ska räknas i emot eller både
  // och — aldrig hamna i listan utan att synas i talen.
  const egnaEmot = s!.handlingar.filter((h) => h.utslag === "emot").length;
  if (egnaEmot > 0) {
    assert.ok(
      s!.summa.emot + s!.summa.bade_och > 0,
      `${kod}: emot mot egna löften finns i listan men inte i talen`,
    );
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
