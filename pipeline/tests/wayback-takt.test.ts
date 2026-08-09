import test from "node:test";
import assert from "node:assert/strict";
import { GRUNDPAUS_MS, hamtaFranArkivet, pausEfterStrypning } from "../src/wayback-takt.ts";
import type { HttpFetch } from "../src/archive.ts";

const svar = (status: number, headers: Record<string, string> = {}) =>
  new Response("", { status, headers });

/* ─────────────────────────────────────── pausEfterStrypning ── */

test("Retry-After i sekunder gäller före vår egen backoff", () => {
  assert.equal(pausEfterStrypning(svar(429, { "retry-after": "30" }), 0), 30_000);
});

test("Retry-After som datum räknas om till väntetid", () => {
  const nu = Date.parse("2026-08-09T10:00:00Z");
  const om = new Date(nu + 45_000).toUTCString();
  assert.equal(pausEfterStrypning(svar(429, { "retry-after": om }), 0, nu), 45_000);
});

test("ett Retry-After som redan passerat ger noll, inte en negativ paus", () => {
  const nu = Date.parse("2026-08-09T10:00:00Z");
  const forut = new Date(nu - 60_000).toUTCString();
  assert.equal(pausEfterStrypning(svar(429, { "retry-after": forut }), 0, nu), 0);
});

test("utan Retry-After fördubblas pausen per försök", () => {
  assert.equal(pausEfterStrypning(svar(429), 0), GRUNDPAUS_MS);
  assert.equal(pausEfterStrypning(svar(429), 1), GRUNDPAUS_MS * 2);
  assert.equal(pausEfterStrypning(svar(429), 2), GRUNDPAUS_MS * 4);
});

test("pausen har ett tak — arkivet får inte parkera en körning i timmar", () => {
  assert.equal(pausEfterStrypning(svar(429, { "retry-after": "99999" }), 0), 120_000);
});

/* ─────────────────────────────────────── hamtaFranArkivet ── */

test("ett vanligt svar lämnas igenom orört", async () => {
  const hamta = (async () => svar(200)) as HttpFetch;
  const r = await hamtaFranArkivet("https://web.archive.org/save/x", hamta);
  assert.equal(r.slag, "svar");
});

test("429 följt av 200 ger svaret, inte strypt", async () => {
  let n = 0;
  const hamta = (async () => (n++ === 0 ? svar(429, { "retry-after": "0" }) : svar(200))) as HttpFetch;
  const r = await hamtaFranArkivet("https://web.archive.org/save/x", hamta);
  assert.equal(r.slag, "svar");
  assert.equal(n, 2);
});

test("idel 429 ger utfallet strypt — inte «ingen kopia finns»", async () => {
  // Skillnaden är hela poängen: en strypt begäran säger ingenting om arkivet.
  let n = 0;
  const hamta = (async () => { n++; return svar(429, { "retry-after": "0" }); }) as HttpFetch;
  const r = await hamtaFranArkivet("https://web.archive.org/save/x", hamta, {}, 3);
  assert.equal(r.slag, "strypt");
  assert.equal(n, 3);
});

test("503 räknas som strypning, inte som ett svar att tro på", async () => {
  const hamta = (async () => svar(503, { "retry-after": "0" })) as HttpFetch;
  const r = await hamtaFranArkivet("https://web.archive.org/cdx/search/cdx", hamta, {}, 2);
  assert.equal(r.slag, "strypt");
});

test("ett nätfel skiljs från en strypning", async () => {
  const hamta = (async () => { throw new Error("ECONNRESET"); }) as HttpFetch;
  const r = await hamtaFranArkivet("https://web.archive.org/save/x", hamta);
  assert.equal(r.slag, "nat");
});

test("404 är ett svar arkivet menar — det ska inte försökas om", async () => {
  let n = 0;
  const hamta = (async () => { n++; return svar(404); }) as HttpFetch;
  const r = await hamtaFranArkivet("https://web.archive.org/web/2026/x", hamta);
  assert.equal(r.slag, "svar");
  assert.equal(n, 1);
});
