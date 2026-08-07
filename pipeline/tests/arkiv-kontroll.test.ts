/**
 * Prov för arkivkontrollen — att ögonblicksbilden öppnas och citatet prövas i
 * den, och att ett nätfel ALDRIG ser ut som ett underkänt citat.
 *
 * Den sista regeln är hela poängen. Behandlas en timeout som "citatet saknas"
 * anklagar vi en arkivkopia för vårt eget nätstrul, och en genomgång som körs
 * en dålig dag skulle dra tillbaka belägg som är felfria.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quoteInSnapshotText,
  snapshotBacksQuote,
  snapshotText,
} from "../src/archive-verify.ts";
import type { HttpFetch } from "../src/archive.ts";

function svar(kropp: string, status = 200): Response {
  return {
    url: "https://web.archive.org/web/2026/https://exempel.se",
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
    arrayBuffer: async () => new TextEncoder().encode(kropp).buffer,
  } as unknown as Response;
}

const hamtar = (kropp: string, status = 200): HttpFetch => (async () => svar(kropp, status)) as HttpFetch;
const faller = (): HttpFetch => (async () => {
  throw new Error("ECONNRESET");
}) as HttpFetch;

/* ───────────────────────── quoteInSnapshotText ── */

test("citatet räknas som funnet fast radbrytningar skiljer", () => {
  const sida = "<p>Vi vill se en omfattande\n   upprustning och fler värnpliktiga.</p>";
  assert.equal(quoteInSnapshotText(sida, "Vi vill se en omfattande upprustning och fler värnpliktiga."), true);
});

test("ett citat som inte står i sidan räknas inte som funnet", () => {
  assert.equal(quoteInSnapshotText("<p>Vi vill sänka skatten.</p>", "Vi vill höja skatten."), false);
});

test("mellanrum inskjutet mitt i ett ord är INTE samma citat", () => {
  // Textutvinningsfelet från 2026-08-06: riksdagen sätter ett span per
  // teckenformat, så "lönebidragens" kunde bli "löne bidragens". Kontrollen
  // ska säga ifrån om det — det var så felet hittades.
  assert.equal(quoteInSnapshotText("<p>lönebidragens storlek</p>", "löne bidragens storlek"), false);
});

/* ───────────────────────── snapshotText ── */

test("snapshotText ger texten ur ögonblicksbilden", async () => {
  const text = await snapshotText("https://web.archive.org/web/2026/https://exempel.se", hamtar("<p>Hej hopp</p>"));
  assert.ok(text !== null);
  assert.match(text, /Hej hopp/);
});

test("snapshotText ger null vid nätfel — inte tom text", async () => {
  assert.equal(await snapshotText("https://web.archive.org/web/2026/x", faller()), null);
});

test("snapshotText ger null vid 404 — inte tom text", async () => {
  assert.equal(await snapshotText("https://web.archive.org/web/2026/x", hamtar("borta", 404)), null);
});

/* ───────────────────────── snapshotBacksQuote ── */

test("nätfel ger null, aldrig false — en trasig hämtning är inget underkänt citat", async () => {
  assert.equal(await snapshotBacksQuote("https://web.archive.org/web/2026/x", "vad som helst", faller()), null);
});

test("en hämtad sida utan citatet ger false", async () => {
  assert.equal(
    await snapshotBacksQuote("https://web.archive.org/web/2026/x", "står inte här", hamtar("<p>något annat</p>")),
    false,
  );
});

test("en hämtad sida med citatet ger true", async () => {
  assert.equal(
    await snapshotBacksQuote("https://web.archive.org/web/2026/x", "står här", hamtar("<p>det står här i sidan</p>")),
    true,
  );
});

test("snapshotBacksQuote ger samma svar som de två delarna var för sig", async () => {
  // Uppdelningen finns för att en sida ofta bär flera citat och bara ska
  // hämtas en gång. Delarna måste svara likadant som helheten, annars är
  // svepet och den enskilda prövningen två sanningar.
  const sida = "<p>ett citat och ett till</p>";
  const helhet = await snapshotBacksQuote("https://web.archive.org/web/2026/x", "ett till", hamtar(sida));
  const text = await snapshotText("https://web.archive.org/web/2026/x", hamtar(sida));
  assert.equal(helhet, quoteInSnapshotText(text!, "ett till"));
});
