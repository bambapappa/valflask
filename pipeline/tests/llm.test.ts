import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenRouterClient } from "../src/llm.ts";

const GO = "https://go.example/v1";
const OR = "https://or.example/v1";

/** Svar-attrapp: status + valfria headers/kropp. */
function svar(status: number, opts: { retryAfter?: string; text?: string } = {}): Response {
  const headers = new Headers();
  if (opts.retryAfter) headers.set("retry-after", opts.retryAfter);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers,
    text: async () => opts.text ?? "",
    json: async () => JSON.parse(opts.text ?? "{}"),
  } as unknown as Response;
}

const svarOk = (innehall: string) =>
  svar(200, { text: JSON.stringify({ choices: [{ message: { content: innehall } }] }) });

/** Klient med attrapp-fetch och klocka vi styr; sömn räknas men tar ingen tid. */
function bygg(handlare: (url: string) => Response | Promise<Response>) {
  const sovit: number[] = [];
  let nu = 1_000_000;
  const anrop: string[] = [];
  const klient = new OpenRouterClient({
    apiKey: "k1",
    baseUrl: GO,
    fallbackBaseUrl: OR,
    fallbackApiKey: "k2",
    maxRetries: 2,
    baseDelayMs: 1000,
    maxBackoffMs: 20_000,
    nedkylningMs: 60_000,
    minIntervalMs: 0,
    httpFetch: async (url) => {
      anrop.push(url);
      return handlare(url);
    },
    sleep: async (ms) => {
      sovit.push(ms);
      nu += ms;
    },
    now: () => nu,
  });
  return { klient, sovit, anrop, framat: (ms: number) => (nu += ms) };
}

test("primärvägens fel maskeras inte av reservvägens", async () => {
  const { klient } = bygg((url) =>
    url.startsWith(GO)
      ? svar(429, { retryAfter: "3600" })
      : svar(402, { text: '{"error":"Insufficient credits"}' }),
  );
  const fel = await klient.complete("x", { model: "m" }).then(
    () => null,
    (e: Error) => e,
  );
  assert.ok(fel, "skulle kasta");
  // Båda vägarna ska synas i felet — annars går primärens 429 inte att se.
  assert.match(fel.message, /go\.example.*429/u);
  assert.match(fel.message, /or\.example.*402/u);
});

test("långt Retry-After sover kort per försök — väntan ligger i nedkylningen", async () => {
  const { klient, sovit } = bygg(() => svar(429, { retryAfter: "3600" }));
  await klient.complete("x", { model: "m" }).catch(() => {});
  // Utan tak skulle varje försök sova 3600s; nu kapas det till maxBackoffMs.
  assert.ok(
    sovit.every((ms) => ms <= 20_000),
    `sömn över taket: ${JSON.stringify(sovit)}`,
  );
});

test("kvotspärrad endpoint tas ur spel och frågas inte igen förrän spärren lossnar", async () => {
  const { klient, anrop, framat } = bygg((url) =>
    url.startsWith(GO) ? svar(429, { retryAfter: "600" }) : svarOk("svar"),
  );
  await klient.complete("a", { model: "m" });
  const efterForsta = anrop.filter((u) => u.startsWith(GO)).length;
  assert.ok(efterForsta > 1, "första anropet ska ha gjort omförsök mot primären");

  // Nästa par: primären är ur spel → inga nya anrop dit, reserven svarar direkt.
  const svar2 = await klient.complete("b", { model: "m" });
  assert.equal(svar2, "svar");
  assert.equal(
    anrop.filter((u) => u.startsWith(GO)).length,
    efterForsta,
    "primären skulle hoppas över helt medan spärren gäller",
  );

  // När spärren lossnat prövas primären igen.
  framat(700_000);
  await klient.complete("c", { model: "m" });
  assert.ok(
    anrop.filter((u) => u.startsWith(GO)).length > efterForsta,
    "primären ska prövas igen när nedkylningen gått ut",
  );
});

test("nyckel-/kreditfel tar endpointen ur spel resten av körningen", async () => {
  const { klient, anrop } = bygg((url) =>
    url.startsWith(GO) ? svar(402, { text: "slut kredit" }) : svarOk("ok"),
  );
  await klient.complete("a", { model: "m" });
  const efter = anrop.filter((u) => u.startsWith(GO)).length;
  assert.equal(efter, 1, "402 ska inte göra omförsök");
  await klient.complete("b", { model: "m" });
  assert.equal(
    anrop.filter((u) => u.startsWith(GO)).length,
    1,
    "en död nyckel ska inte frågas om igen",
  );
});

test("alla vägar ur spel ger snabbt fel utan nya anrop", async () => {
  const { klient, anrop } = bygg(() => svar(402, { text: "slut" }));
  await klient.complete("a", { model: "m" }).catch(() => {});
  const efterForsta = anrop.length;
  const fel = await klient.complete("b", { model: "m" }).then(
    () => null,
    (e: Error) => e,
  );
  assert.ok(fel);
  assert.match(fel.message, /ur spel/u);
  assert.equal(anrop.length, efterForsta, "inga nya nätanrop när allt är ur spel");
});

test("fungerande primär påverkas inte", async () => {
  const { klient } = bygg((url) => (url.startsWith(GO) ? svarOk("hej") : svar(500)));
  assert.equal(await klient.complete("x", { model: "m" }), "hej");
});
