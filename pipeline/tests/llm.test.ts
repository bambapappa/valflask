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
    const c = new OpenRouterClient({ apiKey: "k", httpFetch, ...fast });
    assert.equal(await c.complete("p", { model: "m" }), "HEJ");
    assert.equal(calls, 2);
  });

  it("retryar 5xx upp till gränsen och kastar sedan", async () => {
    let calls = 0;
    const httpFetch = async () => {
      calls++;
      return resp(500, "boom");
    };
    const c = new OpenRouterClient({ apiKey: "k", httpFetch, ...fast, maxRetries: 2 });
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
    const c = new OpenRouterClient({ apiKey: "k", httpFetch, ...fast });
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
      apiKey: "k",
      fallbackBaseUrl: "https://opencode.ai/zen/go/v1",
      fallbackApiKey: "f",
      httpFetch,
      ...fast,
    });
    assert.equal(await c.complete("p", { model: "m" }), "FALLBACK");
    assert.ok(urls[0]?.includes("openrouter"), "primär provas först");
    assert.ok(urls.some((u) => u.includes("opencode")), "fallback provas sedan");
    // Icke-retrybart primärfel ska INTE retrya primären i onödan.
    assert.equal(urls.filter((u) => u.includes("openrouter")).length, 1);
  });

  it("throttle väntar mellan anrop", async () => {
    let t = 0;
    const slept: number[] = [];
    const c = new OpenRouterClient({
      apiKey: "k",
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
