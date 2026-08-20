import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OpenRouterClient } from "../src/llm.ts";

function resp(status: number, body: unknown, retryAfter?: string): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (h: string) =>
        h.toLowerCase() === "retry-after" ? (retryAfter ?? null) : null,
    },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function ok(content: string): Response {
  return resp(200, { choices: [{ message: { content } }] });
}

const fast = {
  maxRetries: 3,
  baseDelayMs: 0,
  minIntervalMs: 0,
  sleep: async () => {},
};

describe("OpenRouterClient resiliens", () => {
  it("retryar 429 och lyckas sedan", async () => {
    let calls = 0;
    const httpFetch = async () => {
      calls++;
      return calls === 1 ? resp(429, "rate limited", "0") : ok("HEJ");
    };
    const c = new OpenRouterClient({ led: [{ namn: "primär", baseUrl: "https://openrouter.ai/api/v1", apiKey: "k" }], httpFetch, ...fast });
    assert.equal(await c.complete("p", { model: "m" }), "HEJ");
    assert.equal(calls, 2);
  });

  it("retryar 5xx upp till gränsen och kastar sedan", async () => {
    let calls = 0;
    const httpFetch = async () => {
      calls++;
      return resp(500, "boom");
    };
    const c = new OpenRouterClient({ led: [{ namn: "primär", baseUrl: "https://openrouter.ai/api/v1", apiKey: "k" }], httpFetch, ...fast, maxRetries: 2 });
    await assert.rejects(() => c.complete("p"), /HTTP 500/);
    assert.equal(calls, 3); // 1 + 2 retries
  });

  it("retryar nätfel/timeout", async () => {
    let calls = 0;
    const httpFetch = async () => {
      calls++;
      if (calls === 1) throw new Error("The operation was aborted due to timeout");
      return ok("OK");
    };
    const c = new OpenRouterClient({ led: [{ namn: "primär", baseUrl: "https://openrouter.ai/api/v1", apiKey: "k" }], httpFetch, ...fast });
    assert.equal(await c.complete("p"), "OK");
    assert.equal(calls, 2);
  });

  it("faller till fallback vid icke-retrybart primärfel (402 utan kredit)", async () => {
    const urls: string[] = [];
    const httpFetch = async (url: string) => {
      urls.push(url);
      return url.includes("openrouter") ? resp(402, "no credit") : ok("FALLBACK");
    };
    const c = new OpenRouterClient({
      led: [
        { namn: "primär", baseUrl: "https://openrouter.ai/api/v1", apiKey: "k" },
        { namn: "sekundär", baseUrl: "https://opencode.ai/zen/go/v1", apiKey: "f" },
      ],
      httpFetch,
      ...fast,
    });
    assert.equal(await c.complete("p", { model: "m" }), "FALLBACK");
    assert.ok(urls[0]?.includes("openrouter"), "primär provas först");
    assert.ok(urls.some((u) => u.includes("opencode")), "fallback provas sedan");
    // Icke-retrybart primärfel ska INTE retrya primären i onödan.
    assert.equal(urls.filter((u) => u.includes("openrouter")).length, 1);
  });

  /**
   * Faller BÅDA endpointerna ska felet bära bådas orsak. Tidigare låg en
   * enda `lastError` som varje endpoint skrev över, så det som kastades var
   * alltid den sist provade endpointens fel — reservens. I drift betydde
   * det att varje misslyckande såg ut att bero på reservens kreditsaldo,
   * oavsett vad som fällde primären, och primärens orsak gick inte att få
   * fram ur loggen alls.
   */
  it("bär bådas felorsak när både primär och fallback faller", async () => {
    const httpFetch = async (url: string) =>
      url.includes("openrouter") ? resp(401, "bad key") : resp(402, "no credit");
    const c = new OpenRouterClient({
      led: [
        { namn: "primär", baseUrl: "https://openrouter.ai/api/v1", apiKey: "k" },
        { namn: "sekundär", baseUrl: "https://opencode.ai/zen/go/v1", apiKey: "f" },
      ],
      httpFetch,
      ...fast,
    });
    await assert.rejects(() => c.complete("p", { model: "m" }), (e: Error) => {
      assert.match(e.message, /openrouter\.ai/, "primärens värd ska stå med");
      assert.match(e.message, /401/, "primärens orsak ska stå med");
      assert.match(e.message, /opencode\.ai/, "reservens värd ska stå med");
      assert.match(e.message, /402/, "reservens orsak ska stå med");
      assert.ok(
        e.message.indexOf("openrouter.ai") < e.message.indexOf("opencode.ai"),
        "i den ordning de provades",
      );
      assert.doesNotMatch(e.message, /Bearer|\bk\b|\bf\b/u, "aldrig nycklar i felet");
      return true;
    });
  });

  it("översätter modell-ID per led via ledets egna modellnamn", async () => {
    const sent: Array<{ url: string; model: string }> = [];
    const httpFetch = async (url: string, init?: RequestInit) => {
      const model = JSON.parse(String(init?.body)).model as string;
      sent.push({ url, model });
      // Primären svarar 404 (känner inte igen primär-slugen) → faller till fallback.
      return url.includes("openrouter") ? resp(404, "unknown model") : ok("OK");
    };
    const c = new OpenRouterClient({
      led: [
        { namn: "primär", baseUrl: "https://openrouter.ai/api/v1", apiKey: "k" },
        { namn: "sekundär", baseUrl: "https://opencode.ai/zen/go/v1", apiKey: "f", modell: { "deepseek/deepseek-v4-pro": "deepseek-v4-pro" } },
      ],
      httpFetch,
      ...fast,
    });
    assert.equal(
      await c.complete("p", { model: "deepseek/deepseek-v4-pro" }),
      "OK",
    );
    const primary = sent.find((s) => s.url.includes("openrouter"));
    const fallback = sent.find((s) => s.url.includes("opencode"));
    assert.equal(primary?.model, "deepseek/deepseek-v4-pro", "primär oförändrad");
    assert.equal(fallback?.model, "deepseek-v4-pro", "fallback översatt");
  });

  it("använder primär-strängen på fallbacken när ingen mappning finns", async () => {
    const sent: Array<{ url: string; model: string }> = [];
    const httpFetch = async (url: string, init?: RequestInit) => {
      sent.push({ url, model: JSON.parse(String(init?.body)).model as string });
      return url.includes("openrouter") ? resp(404, "unknown model") : ok("OK");
    };
    const c = new OpenRouterClient({
      led: [
        { namn: "primär", baseUrl: "https://openrouter.ai/api/v1", apiKey: "k" },
        { namn: "sekundär", baseUrl: "https://opencode.ai/zen/go/v1", apiKey: "f" },
      ],
      httpFetch,
      ...fast,
    });
    assert.equal(await c.complete("p", { model: "m" }), "OK");
    assert.equal(sent.find((s) => s.url.includes("opencode"))?.model, "m");
  });

  /**
   * En del modeller tillåter bara sitt eget default-temperature och avvisar
   * 0 med 400. Primären föll på precis det i drift ("invalid temperature:
   * only 1 is allowed for this model"), gick vidare till reserven, och
   * reservens kreditfel blev det enda som syntes — så felet såg ut att handla
   * om pengar när det handlade om en parameter.
   */
  it("provar om utan temperature när modellen avvisar den, på samma endpoint", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const httpFetch = async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      sent.push(body);
      if ("temperature" in body) {
        return resp(400, { error: { message: "invalid temperature: only 1 is allowed for this model" } });
      }
      return ok("OK");
    };
    const c = new OpenRouterClient({
      led: [
        { namn: "primär", baseUrl: "https://opencode.ai/zen/go/v1", apiKey: "k" },
        { namn: "sekundär", baseUrl: "https://openrouter.ai/api/v1", apiKey: "f" },
      ],
      httpFetch,
      ...fast,
    });
    assert.equal(await c.complete("p", { model: "m" }), "OK");
    assert.equal(sent.length, 2, "ett anrop med temperature, ett utan");
    assert.equal(sent[0]?.temperature, 0);
    assert.ok(!("temperature" in (sent[1] ?? {})), "andra anropet saknar temperature");
    // Reserven ska ALDRIG behöva anropas — primären klarade det själv.
    assert.equal(sent.length, 2);
  });

  /**
   * Verifieringen är den oberoende kontrollen av att ett citat återges ord
   * för ord. Samma underlag ska ge samma utfall — annars är grinden ett
   * lotteri. Tar modellen inte emot temperature ska anropet FALLA, inte
   * tyst köra på modellens eget default: det vore att lossa citatgrinden
   * utan att någon bett om det.
   */
  it("gör INGET omförsök utan temperature när svaret måste vara reproducerbart", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const httpFetch = async (url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return resp(400, { error: { message: "invalid temperature: only 1 is allowed for this model" } });
    };
    const c = new OpenRouterClient({
      led: [{ namn: "primär", baseUrl: "https://opencode.ai/zen/go/v1", apiKey: "k" }],
      httpFetch,
      ...fast,
    });
    await assert.rejects(
      () => c.complete("p", { model: "m", temperature: 0, kravReproducerbart: true }),
      (e: Error) => {
        assert.match(e.message, /reproducerbart/, "skälet ska stå i felet");
        assert.match(e.message, /byt modell/, "och vad man ska göra åt det");
        return true;
      },
    );
    assert.equal(sent.length, 1, "bara ETT anrop — inget omförsök");
    assert.equal(sent[0]?.temperature, 0);
  });

  it("throttle väntar mellan anrop", async () => {
    let t = 0;
    const slept: number[] = [];
    const c = new OpenRouterClient({
      led: [{ namn: "primär", baseUrl: "https://openrouter.ai/api/v1", apiKey: "k" }],
      httpFetch: async () => ok("x"),
      maxRetries: 0,
      baseDelayMs: 0,
      minIntervalMs: 1000,
      now: () => t,
      sleep: async (ms) => {
        slept.push(ms);
        t += ms;
      },
    });
    await c.complete("a");
    await c.complete("b"); // andra anropet direkt efter → ska throttlas ~1000ms
    assert.ok(slept.some((ms) => ms >= 900), `förväntade throttle-väntan, fick ${slept}`);
  });
});

describe("OpenRouterClient avstängning av led", () => {
  // Utan avstängning betalar VARJE anrop om hela omförsöksstegen mot ett led
  // som redan sagt nej. Det syntes i drift: pipelinekörningen 31939465474 stod
  // tre timmar i modellsteget, och kostnadsomkörningen 31946300185 tog 12,5
  // minuter för en enda post mot en strypt leverantör.
  const led = (namn: string, baseUrl: string, apiKey: string) => ({
    namn,
    baseUrl,
    apiKey,
  });

  it("ett kvotspärrat led frågas inte om vid nästa anrop", async () => {
    const anrop: string[] = [];
    let nu = 1_000_000;
    const c = new OpenRouterClient({
      led: [
        led("primär", "https://a.example/v1", "k1"),
        led("reserv", "https://b.example/v1", "k2"),
      ],
      httpFetch: async (url) => {
        anrop.push(url);
        return url.startsWith("https://a.")
          ? resp(429, "kvot", "3600")
          : ok("reserven");
      },
      ...fast,
      maxRetries: 1,
      now: () => nu,
      sleep: async (ms) => {
        nu += ms;
      },
    });

    assert.equal(await c.complete("ett", { model: "m" }), "reserven");
    const efterForsta = anrop.length;
    assert.equal(await c.complete("tva", { model: "m" }), "reserven");

    // Andra anropet ska INTE röra primären igen.
    const nya = anrop.slice(efterForsta);
    assert.ok(
      nya.every((u) => u.startsWith("https://b.")),
      `primären frågades om i andra anropet: ${nya.join(", ")}`,
    );
    assert.equal(nya.length, 1);
  });

  it("spärren lossnar när leverantörens tid gått ut", async () => {
    const anrop: string[] = [];
    let nu = 1_000_000;
    let strypt = true;
    const c = new OpenRouterClient({
      led: [led("primär", "https://a.example/v1", "k1")],
      httpFetch: async (url) => {
        anrop.push(url);
        return strypt ? resp(429, "kvot", "30") : ok("primären igen");
      },
      ...fast,
      maxRetries: 1,
      now: () => nu,
      sleep: async (ms) => {
        nu += ms;
      },
    });

    await assert.rejects(() => c.complete("ett", { model: "m" }));
    const efter = anrop.length;
    // Innan spärren lossnat: inget nytt anrop alls.
    await assert.rejects(() => c.complete("tva", { model: "m" }), /ur spel/);
    assert.equal(anrop.length, efter, "anropade ett spärrat led");

    nu += 31_000;
    strypt = false;
    assert.equal(await c.complete("tre", { model: "m" }), "primären igen");
  });

  it("nyckel-/kreditfel stänger ledet resten av körningen", async () => {
    const anrop: string[] = [];
    let nu = 1_000_000;
    const c = new OpenRouterClient({
      led: [
        led("primär", "https://a.example/v1", "k1"),
        led("reserv", "https://b.example/v1", "k2"),
      ],
      httpFetch: async (url) => {
        anrop.push(url);
        return url.startsWith("https://a.")
          ? resp(402, "Insufficient credits")
          : ok("reserven");
      },
      ...fast,
      now: () => nu,
      sleep: async (ms) => {
        nu += ms;
      },
    });

    await c.complete("ett", { model: "m" });
    const efter = anrop.length;
    nu += 86_400_000; // ett dygn senare — kredit läker ändå inte av sig själv
    await c.complete("tva", { model: "m" });
    assert.ok(
      anrop.slice(efter).every((u) => u.startsWith("https://b.")),
      "en tom plånbok frågades om",
    );
  });

  it("samma adress med olika nyckel är två led — reserven får sin fråga", async () => {
    // Samma förväxling som stängde ute en påfylld reserv i valflask#1858.
    // Kostnadsomkörningens env visar att leden delar BÅDE adress och modell:
    // bara nyckeln skiljer dem åt.
    const nycklar: string[] = [];
    let nu = 1_000_000;
    const c = new OpenRouterClient({
      led: [
        led("primär", "https://samma.example/v1", "konto-a"),
        led("reserv", "https://samma.example/v1", "konto-b"),
      ],
      httpFetch: async (_url, init) => {
        const auth = String(
          (init?.headers as Record<string, string> | undefined)?.Authorization ?? "",
        ).replace("Bearer ", "");
        nycklar.push(auth);
        return auth === "konto-a" ? resp(429, "kvot", "3600") : ok("reserven");
      },
      ...fast,
      maxRetries: 1,
      now: () => nu,
      sleep: async (ms) => {
        nu += ms;
      },
    });

    assert.equal(await c.complete("p", { model: "m" }), "reserven");
    assert.ok(
      nycklar.includes("konto-b"),
      `reserven fick aldrig frågan — anrop: ${nycklar.join(", ")}`,
    );
  });
});

describe("avstängningen överlever mellan anrop", () => {
  // Felet som kostade körning 31949952846 två timmar: avstängningen kapades
  // vid anropstimeouten (90s). Ett 429 som sa «kom tillbaka om 4,4 dygn» tog
  // ledet ur spel i nittio sekunder, och eftersom en post tog längre tid än så
  // hade spärren alltid hunnit lossna. Varje post betalade om hela
  // omförsöksstegen: 12,5 minuter, jämnt, mot 49 sekunder när leverantören
  // svarade normalt.
  const led = (namn: string, baseUrl: string, apiKey: string) => ({ namn, baseUrl, apiKey });

  function bygg(retryAfter: string, opts: Record<string, unknown> = {}) {
    const anrop: string[] = [];
    let nu = 1_000_000;
    const c = new OpenRouterClient({
      led: [
        led("primär", "https://a.example/v1", "k1"),
        led("reserv", "https://b.example/v1", "k2"),
      ],
      httpFetch: async (url) => {
        anrop.push(url);
        return url.startsWith("https://a.") ? resp(429, "kvot", retryAfter) : ok("reserven");
      },
      ...fast,
      maxRetries: 1,
      now: () => nu,
      sleep: async (ms) => {
        nu += ms;
      },
      ...opts,
    });
    return { c, anrop, framat: (ms: number) => (nu += ms) };
  }

  it("en kvotspärr på dygn håller ledet ur spel längre än ett anrop tar", async () => {
    // 389051s = 4,5 dygn, ordagrant det opencode svarade 2026-08-16.
    const { c, anrop, framat } = bygg("389051");

    await c.complete("ett", { model: "m" });
    const efterForsta = anrop.length;

    // Nästa post kommer långt efter anropstimeouten — 12,5 minuter, precis
    // som i drift. Med det gamla taket (90s) hade spärren lossnat här.
    framat(750_000);
    await c.complete("tva", { model: "m" });

    const nya = anrop.slice(efterForsta);
    assert.ok(
      nya.every((u) => u.startsWith("https://b.")),
      `primären frågades om efter 12,5 min — spärren höll inte: ${nya.join(", ")}`,
    );
  });

  it("taket gäller: ett orimligt svarshuvud dödar inte körningen", async () => {
    const { c, anrop, framat } = bygg("389051");

    await c.complete("ett", { model: "m" });
    const efterForsta = anrop.length;

    // Efter takets 15 minuter ska ledet prövas igen, inte hållas ute i dygn.
    framat(15 * 60_000 + 1000);
    await c.complete("tva", { model: "m" });

    assert.ok(
      anrop.slice(efterForsta).some((u) => u.startsWith("https://a.")),
      "primären prövades aldrig igen fast taket gått ut",
    );
  });

  it("omförsökens väntan är en annan storhet än avstängningen", async () => {
    // Ett enskilt omförsök ska aldrig sova längre än ett anrop får ta, även
    // när leverantören ber om dygn. Det är just den kapningen som av misstag
    // återanvändes som tak för avstängningen.
    const sovit: number[] = [];
    let nu = 1_000_000;
    const c = new OpenRouterClient({
      led: [led("primär", "https://a.example/v1", "k1")],
      httpFetch: async () => resp(429, "kvot", "389051"),
      ...fast,
      maxRetries: 2,
      timeoutMs: 90_000,
      now: () => nu,
      sleep: async (ms) => {
        sovit.push(ms);
        nu += ms;
      },
    });

    await assert.rejects(() => c.complete("p", { model: "m" }));
    assert.ok(
      sovit.every((ms) => ms <= 90_000),
      `ett omförsök sov längre än anropstimeouten: ${sovit.join(", ")}`,
    );
  });
});

describe("ett lyckat fall igenom syns", () => {
  // Natten till 2026-08-18 svarade varken primären eller sekundären för
  // utvinningsrollen, det extra ledet gjorde hela skörden, och INGENTING i
  // loggen sa det: `felPerEndpoint` kastades bort så fort ett senare led
  // svarade. Proven nedan mäter att den tystnaden är borta.

  it("rapporterar vilket led som svarade, och varför de föregående inte gjorde det", async () => {
    const anropade: string[] = [];
    const klient = new OpenRouterClient({
      ...fast,
      led: [
        { namn: "primär", baseUrl: "https://ett", apiKey: "k1", modell: { extract: "deepseek" } },
        { namn: "sekundär", baseUrl: "https://tva", apiKey: "k2", modell: { extract: "deepseek" } },
        { namn: "extra", baseUrl: "https://tre", apiKey: "k3", modell: { extract: "glm" } },
      ],
      httpFetch: async (url) => {
        anropade.push(String(url));
        if (String(url).startsWith("https://tre")) return ok("svaret");
        return resp(404, "model not found: deepseek");
      },
    });

    let sett: { led: string; modell: string; foregaendeFel: string[] } | undefined;
    const svar = await klient.complete("fråga", {
      model: "extract",
      onSvar: (i) => {
        sett = i;
      },
    });

    assert.equal(svar, "svaret");
    assert.ok(sett, "återkopplingen ska ha anropats");
    assert.equal(sett!.led, "extra", "det extra ledet svarade");
    assert.equal(sett!.modell, "glm", "och det gjorde det med SIN modell, inte primärens");
    assert.equal(sett!.foregaendeFel.length, 2, "båda leden före ska stå med");
    assert.match(sett!.foregaendeFel.join(" "), /primär/u);
    assert.match(sett!.foregaendeFel.join(" "), /sekundär/u);
    assert.match(
      sett!.foregaendeFel.join(" "),
      /deepseek/u,
      "och felet ska namnge modellen som inte svarade",
    );
  });

  it("säger ingenting när primären svarar — varningen ska inte bli brus", async () => {
    const klient = new OpenRouterClient({
      ...fast,
      led: [
        { namn: "primär", baseUrl: "https://ett", apiKey: "k1", modell: { extract: "deepseek" } },
        { namn: "extra", baseUrl: "https://tre", apiKey: "k3", modell: { extract: "glm" } },
      ],
      httpFetch: async () => ok("svaret"),
    });

    let sett: { led: string; foregaendeFel: string[] } | undefined;
    await klient.complete("fråga", { model: "extract", onSvar: (i) => (sett = i) });

    assert.equal(sett!.led, "primär");
    assert.deepEqual(sett!.foregaendeFel, [], "inga fel före ⇒ inget att rapportera");
  });

  it("återkopplingen är valfri — en anropare utan den fungerar som förut", async () => {
    const klient = new OpenRouterClient({
      ...fast,
      led: [{ namn: "primär", baseUrl: "https://ett", apiKey: "k1", modell: { extract: "deepseek" } }],
      httpFetch: async () => ok("svaret"),
    });
    assert.equal(await klient.complete("fråga", { model: "extract" }), "svaret");
  });
});

describe("tomt svar är inget svar", () => {
  /** Så här ser en modell ut som slår i tokentaket medan den tänker högt. */
  function tomt(finishReason?: string): Response {
    return resp(200, {
      choices: [
        {
          message: { content: "" },
          ...(finishReason === undefined ? {} : { finish_reason: finishReason }),
        },
      ],
    });
  }
  const ledet = [{ namn: "primär", baseUrl: "https://openrouter.ai/api/v1", apiKey: "k" }];

  it("gör om det tomma svaret i stället för att lämna det vidare", async () => {
    // `typeof "" === "string"`, så vakten mot saknat innehåll släppte igenom
    // en tom sträng som om modellen hade svarat. Den gick till JSON.parse,
    // föll där, och posten tappades tyst.
    let calls = 0;
    const httpFetch = async () => (++calls === 1 ? tomt("length") : ok('{"ja":true}'));
    const c = new OpenRouterClient({ led: ledet, httpFetch, ...fast });
    assert.equal(await c.complete("p", { model: "m" }), '{"ja":true}');
    assert.equal(calls, 2);
  });

  it("räknar bara blanktecken som tomt", async () => {
    let calls = 0;
    const httpFetch = async () => (++calls === 1 ? ok("  \n\t ") : ok("riktigt"));
    const c = new OpenRouterClient({ led: ledet, httpFetch, ...fast });
    assert.equal(await c.complete("p", { model: "m" }), "riktigt");
    assert.equal(calls, 2);
  });

  it("bär med finish_reason när modellen aldrig skriver något", async () => {
    // Utan skälet går "slog i tokentaket" inte att skilja från "modellen
    // skrev inget", och taket är något vi själva satt.
    const c = new OpenRouterClient({ led: ledet, httpFetch: async () => tomt("length"), ...fast });
    await assert.rejects(c.complete("p", { model: "m" }), /finish_reason: length/);
  });

  it("säger rent ut när finish_reason saknas", async () => {
    const c = new OpenRouterClient({ led: ledet, httpFetch: async () => tomt(), ...fast });
    await assert.rejects(c.complete("p", { model: "m" }), /finish_reason: okänt/);
  });
});
