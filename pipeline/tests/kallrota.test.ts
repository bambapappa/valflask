import test from "node:test";
import assert from "node:assert/strict";
import {
  andringsslag,
  hittaPassage,
  langstaKvarvarandeOrdfoljd,
  skaSkrivas,
  utfallAvStatus,
  utfallAvText,
} from "../src/kallrota.ts";

/* ─────────────────────────────────────── utfallAvStatus ── */

test("404 och 410 betyder att sidan är borta", () => {
  assert.equal(utfallAvStatus(404), "borttagen");
  assert.equal(utfallAvStatus(410), "borttagen");
});

test("429 och 5xx säger ingenting om källan", () => {
  // Strypning och serverfel är vårt problem, inte partiets. Skulle de räknas
  // som «borttagen» anklagade vi en källa för vårt eget nätstrul.
  assert.equal(utfallAvStatus(429), "obestamd");
  assert.equal(utfallAvStatus(500), "obestamd");
  assert.equal(utfallAvStatus(503), "obestamd");
});

test("ett 200 avgör ingenting — citatet gör det", () => {
  assert.equal(utfallAvStatus(200), null);
});

/* ─────────────────────────────────────── utfallAvText ── */

test("citatet står kvar ordagrant", () => {
  const sida = "<p>Vi vill se fler värnpliktiga och en upprustad försvarsmakt.</p>";
  assert.equal(utfallAvText(sida, "Vi vill se fler värnpliktiga"), "ok");
});

test("citatet står inte längre i sidan", () => {
  const sida = "<p>Vi vill se färre värnpliktiga.</p>";
  assert.equal(utfallAvText(sida, "Vi vill se fler värnpliktiga"), "andrad");
});

test("ett tomt citat går inte att avgöra — det är inte en ändrad källa", () => {
  assert.equal(utfallAvText("<p>vad som helst</p>", "   "), "obestamd");
});

test("citatets avslutande skiljetecken fäller inte källan", () => {
  // Samma lättnad som arkivgrinden fick 2026-08-09: det är orden som bär citatet.
  const sida = "<p>Vi vill höja garantipensionen, säger partiledaren.</p>";
  assert.equal(utfallAvText(sida, "Vi vill höja garantipensionen."), "ok");
});

/* ─────────────────────────────────────── skaSkrivas ── */

test("ett obestämt svar skriver aldrig något", () => {
  assert.equal(skaSkrivas("ok", "obestamd"), false);
  assert.equal(skaSkrivas(undefined, "obestamd"), false);
});

test("en oförändrad status är ingen ändring att rapportera", () => {
  assert.equal(skaSkrivas("ok", "ok"), false);
});

test("första gången en källa öppnas är en ändring", () => {
  assert.equal(skaSkrivas(undefined, "ok"), true);
});

test("en källa som gått sönder skrivs", () => {
  assert.equal(skaSkrivas("ok", "borttagen"), true);
  assert.equal(skaSkrivas("ok", "andrad"), true);
});

test("en källa som lagats skrivs också — statusen går tillbaka till ok", () => {
  // Ett tillfälligt CMS-fel ska inte lämna en permanent stämpel på sidan.
  assert.equal(skaSkrivas("borttagen", "ok"), true);
});

/* ─────────────────────────────────────── langstaKvarvarandeOrdfoljd ── */

test("ordföljden före den ändrade delen hittas", () => {
  // p-2026-0517: riksdagen skrev om «idag» till «i dag».
  const sida = "<p>Miljöpartiet anser att ungdomsreduktionen bör vara oförändrad jämfört med i dag.</p>";
  const citat = "Miljöpartiet anser att ungdomsreduktionen bör vara oförändrad jämfört med idag.";
  assert.equal(langstaKvarvarandeOrdfoljd(sida, citat), "Miljöpartiet anser att ungdomsreduktionen bör vara oförändrad jämfört med");
});

test("den längsta ordföljden vinner, även när den ligger efter ändringen", () => {
  // Ändringen sitter tidigt: svansen är längre än huvudet och ska väljas.
  const sida = "<p>Vi anser att staten bör bygga fler bostäder åt unga i hela landet.</p>";
  const citat = "Vi tycker att staten bör bygga fler bostäder åt unga i hela landet.";
  assert.equal(langstaKvarvarandeOrdfoljd(sida, citat), "att staten bör bygga fler bostäder åt unga i hela landet.");
});

test("en sida utan något av citatet ger ingen ordföljd alls", () => {
  assert.equal(langstaKvarvarandeOrdfoljd("<p>Helt annan text om helt annat.</p>", "Vi vill höja garantipensionen kraftigt under nästa mandatperiod."), "");
});

test("några enstaka gemensamma ord räknas inte som en träff", () => {
  // "att staten bör" står i var och varannan text. Ett ankare måste bära vikt,
  // annars byggs ett offentligt påstående på en slump.
  const sida = "<p>Det är rimligt att staten bör göra något helt annat än detta.</p>";
  assert.equal(langstaKvarvarandeOrdfoljd(sida, "Vi menar att staten bör höja garantipensionen."), "");
});

/* ─────────────────────────────────────── hittaPassage ── */

test("passagen är hela meningen som står där i dag", () => {
  const sida = "<p>Ett stycke före. Miljöpartiet anser att ungdomsreduktionen bör vara oförändrad jämfört med i dag. Ett stycke efter.</p>";
  const citat = "Miljöpartiet anser att ungdomsreduktionen bör vara oförändrad jämfört med idag.";
  assert.equal(
    hittaPassage(sida, citat),
    "Miljöpartiet anser att ungdomsreduktionen bör vara oförändrad jämfört med i dag.",
  );
});

test("en sida utan något av citatet ger ingen passage", () => {
  // Det är skillnaden mellan «de skrev om meningen» och «sidan är en annan
  // sida». Bara det första går att lägga fram med citatet i handen.
  assert.equal(hittaPassage("<p>Helt annan text om helt annat.</p>", "Vi vill höja garantipensionen kraftigt."), null);
});

test("passagen tas ur sidan ordagrant — vi skriver aldrig om källans ord", () => {
  const sida = "<p>Vi vill höja garantipensionen med 1 000 kronor i månaden.</p>";
  const passage = hittaPassage(sida, "Vi vill höja garantipensionen med 800 kronor i månaden.");
  assert.ok(passage !== null);
  assert.ok(sida.includes(passage), `passagen ska stå ordagrant i källan: ${passage}`);
});

/* ─────────────────────────────────────── andringsslag ── */

test("citatet omskrivet men sidan kvar är en ordalydelse", () => {
  assert.equal(andringsslag("andrad", "det som står nu"), "ordalydelse");
});

test("inget av citatet kvar betyder att sidan är utbytt", () => {
  assert.equal(andringsslag("andrad", null), "sidan-utbytt");
});

test("404 är sin egen sak, oavsett vad som gick att läsa", () => {
  assert.equal(andringsslag("borttagen", null), "sidan-borttagen");
});

test("en fungerande eller obestämd källa är inget fall att lägga fram", () => {
  assert.equal(andringsslag("ok", null), null);
  assert.equal(andringsslag("obestamd", null), null);
});
