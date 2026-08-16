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
  // Fångar reservvarningen i stället för att skriva den till console under test.
  const reservSkal: string[] = [];
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
    onReservSvarade: (skal) => reservSkal.push(skal),
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
  return { klient, sovit, anrop, reservSkal, framat: (ms: number) => (nu += ms) };
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

test("en tyst reserv rapporteras — med primärens skäl, en gång", async () => {
  // Primären är kreditlös, reserven svarar. Utan varning ser körningen
  // frisk ut ända till reserven också tar slut — den blinda fläcken som
  // gjorde att förslagskörning 30159619034 inte gick att felsöka.
  const { klient, reservSkal } = bygg((url) =>
    url.startsWith(GO) ? svar(402, { text: "Insufficient credits" }) : svarOk("hej"),
  );
  assert.equal(await klient.complete("a", { model: "m" }), "hej");
  assert.equal(reservSkal.length, 1, "reservläget ska rapporteras");
  assert.match(reservSkal[0]!, /402/u, "skälet ska bära primärens fel");
  assert.match(reservSkal[0]!, /go\.example/u, "skälet ska peka ut primären");

  // Andra anropet går också via reserven, men varningen upprepas inte.
  assert.equal(await klient.complete("b", { model: "m" }), "hej");
  assert.equal(reservSkal.length, 1, "varningen ska komma en gång per körning");
});

test("en frisk primär rapporterar inget reservläge", async () => {
  const { klient, reservSkal } = bygg((url) => (url.startsWith(GO) ? svarOk("hej") : svar(500)));
  assert.equal(await klient.complete("x", { model: "m" }), "hej");
  assert.equal(reservSkal.length, 0, "ingen varning när primären svarar");
});

/**
 * Två led mot SAMMA bas-URL med var sin nyckel — två konton hos samma
 * leverantör, med var sin kvot. Klienten med attrapp-fetch som kan svara
 * olika beroende på vilken nyckel anropet bär.
 */
function byggSammaUrl(
  handlare: (nyckel: string) => Response | Promise<Response>,
) {
  let nu = 1_000_000;
  const nycklar: string[] = [];
  const reservSkal: string[] = [];
  const klient = new OpenRouterClient({
    apiKey: "konto-a",
    baseUrl: GO,
    fallbackBaseUrl: GO, // samma adress
    fallbackApiKey: "konto-b", // annan nyckel
    maxRetries: 1,
    baseDelayMs: 1000,
    maxBackoffMs: 20_000,
    nedkylningMs: 60_000,
    minIntervalMs: 0,
    onReservSvarade: (skal) => reservSkal.push(skal),
    httpFetch: async (_url, init) => {
      const auth = String(
        (init?.headers as Record<string, string> | undefined)?.Authorization ?? "",
      ).replace("Bearer ", "");
      nycklar.push(auth);
      return handlare(auth);
    },
    sleep: async (ms) => {
      nu += ms;
    },
    now: () => nu,
  });
  return { klient, nycklar, reservSkal };
}

test("samma adress med olika nyckel är två led — reserven frågas när primären kvotspärras", async () => {
  // Kartan var förut nycklad på adressen. Då skrevs primärens spärr på den
  // adress reserven delar, och reserven hoppades över utan ett enda anrop —
  // precis det som fällde foreslag-körningen 2026-08-16 med en påfylld reserv.
  const { klient, nycklar, reservSkal } = byggSammaUrl((nyckel) =>
    nyckel === "konto-a"
      ? svar(429, { retryAfter: "3600" })
      : svarOk("reserven svarade"),
  );

  assert.equal(await klient.complete("p", { model: "m" }), "reserven svarade");
  assert.ok(
    nycklar.includes("konto-b"),
    `reserven fick aldrig frågan — anrop: ${nycklar.join(", ")}`,
  );
  // Och reservläget ska rapporteras, fast adressen är densamma.
  assert.equal(reservSkal.length, 1);
  assert.match(reservSkal[0]!, /primär/);
});

test("spärren på ett konto följer inte med till det andra vid nästa anrop", async () => {
  const { klient, nycklar } = byggSammaUrl((nyckel) =>
    nyckel === "konto-a"
      ? svar(429, { retryAfter: "3600" })
      : svarOk("reserven svarade"),
  );

  await klient.complete("ett", { model: "m" });
  const efterForsta = nycklar.length;
  await klient.complete("tva", { model: "m" });

  // Primären är ur spel och ska hoppas över; reserven ska frågas igen.
  const nya = nycklar.slice(efterForsta);
  assert.deepEqual(nya, ["konto-b"], `andra anropet gick till: ${nya.join(", ")}`);
});

test("samma adress OCH samma nyckel är ett led — spärren delas", async () => {
  // Motsatsen ska också hålla: är det verkligen samma endpoint ska
  // kostnaden betalas en gång, inte en gång per led.
  let nu = 1_000_000;
  const anrop: string[] = [];
  const klient = new OpenRouterClient({
    apiKey: "samma",
    baseUrl: GO,
    fallbackBaseUrl: GO,
    fallbackApiKey: "samma",
    maxRetries: 1,
    baseDelayMs: 1000,
    minIntervalMs: 0,
    onReservSvarade: () => {},
    httpFetch: async (url) => {
      anrop.push(url);
      return svar(429, { retryAfter: "3600" });
    },
    sleep: async (ms) => {
      nu += ms;
    },
    now: () => nu,
  });

  await assert.rejects(klient.complete("p", { model: "m" }));
  // Två försök på ledet, sedan ur spel — reservledet är samma konto och
  // ska hoppas över, inte prövas om.
  assert.equal(anrop.length, 2, `antal anrop: ${anrop.length}`);
});
