import test from "node:test";
import assert from "node:assert/strict";
import { skaSkrivas, utfallAvStatus, utfallAvText } from "../src/kallrota.ts";

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
