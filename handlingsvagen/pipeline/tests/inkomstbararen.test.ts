import { test } from "node:test";
import assert from "node:assert/strict";
import {
  provaInkomstbararen,
  motiveringsnot,
  utanTidigareInkomstnot,
  type Inkomstmatning,
} from "../src/inkomstbararen.ts";
import type { Inkomstrad } from "../src/inkomsttabell.ts";

const NEDSATTNINGAR: Inkomstrad = { titel: "1280", namn: "Nedsättningar", avvikelse: -6935000 };
const MOMS: Inkomstrad = { titel: "1410", namn: "Mervärdesskatt", avvikelse: 0 };

function matning(over: Partial<Inkomstmatning> = {}): Inkomstmatning {
  const traff = { rad: NEDSATTNINGAR, poang: 2 };
  return {
    koppling: "k-2026-0665",
    promise_id: "p-2026-0345",
    bindande: true,
    tabellrader: 30,
    traffar: [traff],
    andrade: [traff],
    fel: null,
    ...over,
  };
}

test("en rad som rör sig åt löftets håll bär löftet", () => {
  const p = provaInkomstbararen(matning(), "sanker");
  assert.equal(p.utfall, "bar");
  assert.equal(p.rad?.titel, "1280");
  assert.equal(p.drasIn, false);
  assert.ok(p.innebord.includes("−6 935 000"));
});

/**
 * Skatteundantaget är ett undantag från att ramverksyrkanden inte bär något.
 * Gäller löftet ingen skatt finns undantaget inte, hur mycket en inkomsttitel
 * med liknande ord än rör sig.
 */
test("ett löfte som inte gäller en skatt faller före tabellen ens läses", () => {
  const p = provaInkomstbararen(matning(), "ingen_skatt");
  assert.equal(p.utfall, "loftet_ar_ingen_skatt");
  assert.equal(p.drasIn, true);
  assert.equal(p.rad, null);
});

test("utan ledet om lagförslag binder yrkandet inte, och då bär det inte", () => {
  const p = provaInkomstbararen(matning({ bindande: false }), "sanker");
  assert.equal(p.utfall, "yrkandet_binder_inte");
  assert.equal(p.drasIn, true);
});

test("står raden ±0 begärde motionen ingen ändring av skatten", () => {
  const p = provaInkomstbararen(
    matning({ traffar: [{ rad: MOMS, poang: 2 }], andrade: [] }),
    "sanker",
  );
  assert.equal(p.utfall, "raden_star_stilla");
  assert.equal(p.drasIn, true);
  assert.equal(p.rad?.titel, "1410");
});

test("ingen rad med sakord drar inte in — hela tabellen ska läsas först", () => {
  const p = provaInkomstbararen(matning({ traffar: [], andrade: [] }), "sanker");
  assert.equal(p.utfall, "ingen_rad_delar_sakord");
  assert.equal(p.drasIn, false);
  assert.equal(p.kraverLasning, true);
});

/**
 * Tecknet är inkomstens, inte reformens: en sänkning ska ge ett minus. Ett plus
 * på titeln när löftet sänker är alltså motsatt håll — men inkomsttitlarna är
 * breda nog att rymma flera reformer, så det kräver en läsning och inte en
 * indragning.
 */
test("en rad som går andra vägen avgörs av en läsning, inte av svepet", () => {
  const upp = { rad: { ...NEDSATTNINGAR, avvikelse: 11980000 }, poang: 2 };
  const p = provaInkomstbararen(matning({ traffar: [upp], andrade: [upp] }), "sanker");
  assert.equal(p.utfall, "raden_gar_andra_vagen");
  assert.equal(p.drasIn, false);
  assert.equal(p.kraverLasning, true);
});

test("ett höjningslöfte vill se ett plus, och ett minus är då andra vägen", () => {
  assert.equal(provaInkomstbararen(matning(), "hojer").utfall, "raden_gar_andra_vagen");
  const upp = { rad: { ...NEDSATTNINGAR, avvikelse: 1136000 }, poang: 2 };
  assert.equal(provaInkomstbararen(matning({ traffar: [upp], andrade: [upp] }), "hojer").utfall, "bar");
});

test("ett enda gemensamt ordled räcker inte för en publicerad motivering", () => {
  const svag = { rad: NEDSATTNINGAR, poang: 1 };
  const p = provaInkomstbararen(matning({ traffar: [svag], andrade: [svag] }), "sanker");
  assert.equal(p.utfall, "svag_traff");
  assert.equal(p.drasIn, false);
});

test("en misslyckad hämtning är oavgjort och säger ingenting om kopplingen", () => {
  const p = provaInkomstbararen(matning({ fel: "nätet nådde inte fram" }), "sanker");
  assert.equal(p.utfall, "oavgjort");
  assert.equal(p.drasIn, false);
});

test("saknas inkomsttabellen finns ingen rad som kan bära löftet", () => {
  const p = provaInkomstbararen(matning({ tabellrader: 0, traffar: [], andrade: [] }), "sanker");
  assert.equal(p.utfall, "ingen_inkomsttabell");
  assert.equal(p.drasIn, true);
});

test("noten skriver ut raden, enheten och vad tecknet betyder", () => {
  const not = motiveringsnot(NEDSATTNINGAR, "sanker", "2026-08-08");
  assert.ok(not.includes("1280 Nedsättningar"));
  assert.ok(not.includes("−6 935 000"));
  assert.ok(not.includes("tusental kronor"));
  assert.ok(not.includes("mindre in till staten"));
  assert.ok(not.includes("2026-08-08"));
});

test("noten dubbleras inte vid en omkörning", () => {
  const not = motiveringsnot(NEDSATTNINGAR, "sanker", "2026-08-08");
  const motivering = `Motionen föreslår att avskaffa avgiften. ${not}`;
  assert.equal(utanTidigareInkomstnot(motivering), "Motionen föreslår att avskaffa avgiften.");
  assert.equal(utanTidigareInkomstnot("Utan not."), "Utan not.");
});
