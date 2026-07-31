/*
 * Strukturgrind för rutnätet: att modellen håller neutralitetskontraktet —
 * alla åtta partier som kolumner, tomma celler ärligt utelämnade (aldrig
 * påhittade), varje koppling bär ett exakt citat och en riksdagslänk, och
 * varje status har ett utskrivet ord (färg aldrig ensam bärare). Kör: npm test.
 */
import assert from "node:assert";
import { buildSummary, lofteIds, buildLofteDetalj, riksmoteAvDatum } from "../src/lib/rutnat.ts";
import { getLoften } from "../src/lib/data.ts";

const summary = buildSummary();
const loftenIds = new Set(getLoften().map((l) => l.id));

// Filterfasetter (SKISS §3): varje rad bär härledda fasetter, och unionen
// samlas i summary.fasetter för filterbarens val.
assert.strictEqual(riksmoteAvDatum("2025-10-22"), "2025/26", "riksmöte ur höstdatum");
assert.strictEqual(riksmoteAvDatum("2023-03-01"), "2022/23", "riksmöte ur vårdatum");
for (const rad of summary.loften) {
  assert.ok(Array.isArray(rad.dokumenttyper) && rad.dokumenttyper.length > 0, `${rad.id} saknar dokumenttyp-fasett`);
  assert.ok(Array.isArray(rad.riksmoten) && rad.riksmoten.length > 0, `${rad.id} saknar riksmöte-fasett`);
  assert.ok(Array.isArray(rad.motionstyper), `${rad.id} saknar motionstyp-fasett`);
}
for (const f of ["dokumenttyper", "motionstyper", "riksmoten"] as const) {
  assert.ok(Array.isArray(summary.fasetter[f]), `summary.fasetter.${f} saknas`);
}

// Åtta partier som kolumner (b-0018 F1).
assert.strictEqual(summary.partier.length, 8, "rutnätet ska ha åtta partikolumner");
const partiKoder = new Set(summary.partier.map((p) => p.code));

// Varje status har ett utskrivet ord (F2: färg aldrig ensam bärare).
for (const [status, ord] of Object.entries(summary.statusord)) {
  assert.ok(typeof ord === "string" && ord.length > 0, `status ${status} saknar ord`);
}

// Vägda löften ⊆ registret; summan stämmer.
assert.strictEqual(summary.summa.vagda, summary.loften.length, "vagda ska vara antal rader");
assert.ok(summary.summa.total_lof >= summary.summa.vagda, "total kan inte vara mindre än vägda");
assert.strictEqual(summary.summa.utan_handling, summary.summa.total_lof - summary.summa.vagda, "utan_handling ska vara resten");

let multiParti = 0;
for (const rad of summary.loften) {
  assert.ok(loftenIds.has(rad.id), `rad ${rad.id} saknas i löftesindexet`);
  const koder = Object.keys(rad.celler);
  // Celler bara för giltiga partier, och bara där partiet visat aktivitet
  // (tomt är ärligt utelämnat, aldrig en påhittad ifylld cell).
  for (const [kod, cell] of Object.entries(rad.celler)) {
    assert.ok(partiKoder.has(kod), `okänt parti ${kod} i ${rad.id}`);
    assert.ok(cell.n_i_linje + cell.n_emot + cell.n_avstod > 0, `tom cell borde utelämnats: ${rad.id}/${kod}`);
  }
  if (koder.length > 1) multiParti += 1;
}
// De voteringskopplade löftena ger en spridning över flera partier — beviset på
// att rutnätet faktiskt fylls av varje partis egen röst, inte bara ägarens.
assert.ok(multiParti >= 1, "minst ett löfte bör ha utslag för flera partier (voteringar)");

// Varje detaljfil: minst en koppling, varje med exakt citat + riksdagslänk.
let idn = 0;
for (const id of lofteIds()) {
  const d = buildLofteDetalj(id);
  assert.ok(d, `detalj saknas för ${id}`);
  assert.ok(d!.kopplingar.length > 0, `${id} saknar kopplingar`);
  for (const k of d!.kopplingar) {
    assert.ok(k.citat && k.citat.trim().length > 0, `koppling ${k.id} saknar citat`);
    assert.ok(k.handling.url && k.handling.url.startsWith("http"), `koppling ${k.id} saknar riksdagslänk`);
  }
  for (const kod of Object.keys(d!.domar)) {
    assert.ok(partiKoder.has(kod), `okänt parti ${kod} i domar för ${id}`);
  }
  idn += 1;
}

console.log(`rutnät: ${summary.loften.length} vägda löften, ${multiParti} med flerpartispridning, ${idn} detaljfiler — alla grindar gröna`);
