/**
 * Enhetstester för arkivkedjan (Wayback → archive.today-fallback).
 * archive.today går inte att liveköra härifrån (429 från datacenter-IP), så
 * URL-parsningen och kedjelogiken verifieras mot mock-svar.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractArchiveTodayUrl,
  archiveWithFallback,
  type HttpFetch,
} from "../src/archive.ts";

function res(url: string, init?: { status?: number; headers?: Record<string, string> }): Response {
  const status = init?.status ?? 200;
  return {
    url,
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(init?.headers ?? {}),
  } as unknown as Response;
}

/* ───────────────────────── extractArchiveTodayUrl ── */

test("extractArchiveTodayUrl: färdig kortkod ur res.url", () => {
  assert.equal(extractArchiveTodayUrl(res("https://archive.ph/aB9k2")), "https://archive.ph/aB9k2");
});

test("extractArchiveTodayUrl: lång tidsstämpelform", () => {
  const u = "https://archive.ph/20260716/https://www.centerpartiet.se/var-politik/politik-a-o/utbildning";
  assert.equal(extractArchiveTodayUrl(res(u)), u);
});

test("extractArchiveTodayUrl: http normaliseras till https", () => {
  assert.equal(extractArchiveTodayUrl(res("http://archive.ph/aB9k2")), "https://archive.ph/aB9k2");
});

test("extractArchiveTodayUrl: Refresh-header", () => {
  const r = res("https://archive.ph/submit/", { headers: { refresh: "0;url=https://archive.ph/Xy7Qp" } });
  assert.equal(extractArchiveTodayUrl(r), "https://archive.ph/Xy7Qp");
});

test("extractArchiveTodayUrl: Location-header", () => {
  const r = res("https://archive.ph/submit/", { headers: { location: "https://archive.ph/Zz1Aa" } });
  assert.equal(extractArchiveTodayUrl(r), "https://archive.ph/Zz1Aa");
});

test("extractArchiveTodayUrl: pågående (wip) räknas inte som färdig", () => {
  assert.equal(extractArchiveTodayUrl(res("https://archive.ph/wip/aB9k2")), null);
});

test("extractArchiveTodayUrl: åtgärdssidor (submit/newest) ger null", () => {
  assert.equal(extractArchiveTodayUrl(res("https://archive.ph/submit/?url=https://x.se")), null);
  assert.equal(extractArchiveTodayUrl(res("https://archive.ph/newest/https://x.se")), null);
});

/* ───────────────────────── archiveWithFallback ── */

test("fallback: Wayback lyckas → archive.today anropas aldrig", async () => {
  const calls: string[] = [];
  const fetch: HttpFetch = async (u) => {
    calls.push(u);
    return res("https://web.archive.org/web/20260716/https://x.se/a");
  };
  const r = await archiveWithFallback("https://x.se/a", fetch);
  assert.equal(r.archive_url, "https://web.archive.org/web/20260716/https://x.se/a");
  assert.ok(calls.every((c) => c.includes("web.archive.org")), "bara Wayback ska ha anropats");
});

test("fallback: Wayback spärrar (403) → archive.today via befintlig snapshot", async () => {
  const fetch: HttpFetch = async (u) => {
    if (u.includes("web.archive.org")) return res(u, { status: 403 });
    if (u.includes("/newest/")) return res("https://archive.ph/Qw3Er"); // befintlig kopia
    throw new Error("submit ska inte behövas");
  };
  const r = await archiveWithFallback("https://centerpartiet.se/x", fetch);
  assert.equal(r.archive_url, "https://archive.ph/Qw3Er");
  assert.equal(r.retry, false);
});

test("fallback: Wayback spärrar, ingen befintlig → submit ger ny snapshot", async () => {
  const fetch: HttpFetch = async (u) => {
    if (u.includes("web.archive.org")) return res(u, { status: 403 });
    if (u.includes("/newest/")) return res("https://archive.ph/newest/https://x.se"); // ingen träff
    if (u.includes("/submit/")) return res("https://archive.ph/Nn8Mm"); // arkiverad direkt
    throw new Error("oväntad URL " + u);
  };
  const r = await archiveWithFallback("https://x.se", fetch);
  assert.equal(r.archive_url, "https://archive.ph/Nn8Mm");
});

test("fallback: bägge misslyckas → null + retry (rot-check bär integriteten)", async () => {
  const fetch: HttpFetch = async (u) => {
    if (u.includes("web.archive.org")) return res(u, { status: 403 });
    if (u.includes("/newest/")) return res("https://archive.ph/newest/https://x.se");
    if (u.includes("/submit/")) return res("https://archive.ph/submit/", { status: 429 });
    throw new Error("oväntad URL " + u);
  };
  const r = await archiveWithFallback("https://x.se", fetch);
  assert.equal(r.archive_url, null);
  assert.equal(r.retry, true);
});
