/**
 * Vaktar veckosvepet som prövar om H2 mot riksdagens källor.
 *
 * Det svepet ska klara är att skilja fyra lägen åt som lätt blandas ihop:
 * citatet står där det ska, citatet står i brödtexten men på utskriven grund,
 * citatet står i brödtexten utan grund, och citatet gick inte att pröva. De
 * två sista är det som skiljer en mätning från ett nätfel — blandas de ihop
 * rapporteras en långsam morgon hos riksdagen som ett datafel.
 *
 * Sista provet håller den regel som gör tystnad ärlig: en körning där nästan
 * ingenting gick att pröva får inte skrivas som «inga fynd».
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { provaCitatet, svepstatus, svepetArTrasigt, type Sveprad } from "../src/h2svepet.ts";

const YRKANDET = "Riksdagen ställer sig bakom det som anförs i motionen om höjd ersättning till eftersöksjägare.";
const BRODTEXT = "Ersättningen till eftersöksjägare har inte höjts på tio år, och det är inte rimligt.";
const KALLA = `${BRODTEXT}\n\n${YRKANDET}`;
const handlingstext = { sort: "yrkanden" as const, delar: [YRKANDET] };

test("citat i handlingens egen del håller", () => {
  const { utfall } = provaCitatet(YRKANDET, KALLA, handlingstext, undefined);
  assert.equal(utfall, "haller");
});

test("citat som inte står i dokumentet är det allvarligaste utfallet", () => {
  const { utfall } = provaCitatet("Riksdagen avslår motionen om något helt annat.", KALLA, handlingstext, undefined);
  assert.equal(utfall, "inte_ordagrant");
});

test("brödtext utan utskriven grund är ett fynd", () => {
  const { utfall, skal } = provaCitatet(BRODTEXT, KALLA, handlingstext, undefined);
  assert.equal(utfall, "utanfor_handlingen");
  // Skälet ska vara grindens eget, inte en egen formulering: läsaren ska få
  // samma besked av svepet som av grinden och bevisbytet.
  assert.match(skal, /yrkanden/u);
});

test("brödtext på utskriven grund är inget fynd — undantaget är ett läst beslut", () => {
  const { utfall } = provaCitatet(BRODTEXT, KALLA, handlingstext, "anslagsrad");
  assert.equal(utfall, "brodtext_med_grund");
});

test("hämtningen föll är inte «citatet är borta»", () => {
  const { utfall } = provaCitatet(YRKANDET, null, handlingstext, undefined);
  assert.equal(utfall, "oprovad");
});

test("olästa lydelser fäller inte citatet — bara det ordagranna är då prövat", () => {
  const { utfall } = provaCitatet(BRODTEXT, KALLA, undefined, undefined);
  assert.equal(utfall, "oprovad");
});

const rad = (utfall: Sveprad["utfall"], id: string): Sveprad => ({
  koppling_id: id,
  handling_id: "h-1",
  dok_id: "HC01",
  utfall,
  skal: "prov",
});

test("bara de två läsbara utfallen hamnar i läslistan", () => {
  const status = svepstatus([
    rad("haller", "k-1"),
    rad("brodtext_med_grund", "k-2"),
    rad("utanfor_handlingen", "k-3"),
    rad("inte_ordagrant", "k-4"),
    rad("oprovad", "k-5"),
  ]);
  assert.equal(status.provade, 5);
  assert.deepEqual(
    status.fynd.map((f) => f.koppling_id),
    ["k-3", "k-4"],
  );
});

test("en körning som inte kunde pröva något är ett trasigt svep, inte ett friskintyg", () => {
  const nastanAllt = [rad("oprovad", "k-1"), rad("oprovad", "k-2"), rad("oprovad", "k-3"), rad("haller", "k-4")];
  assert.equal(svepetArTrasigt(svepstatus(nastanAllt)), true);
  assert.equal(svepetArTrasigt(svepstatus([rad("oprovad", "k-1"), rad("haller", "k-2"), rad("haller", "k-3")])), false);
  // Ett tomt svep är inte trasigt — det är tomt.
  assert.equal(svepetArTrasigt(svepstatus([])), false);
});
