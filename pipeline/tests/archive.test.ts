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
  snapshotUrUrSparsvar,
  slaUppArchiveToday,
  slaUppGhostarchive,
  arkivleverantor,
  arVideokopia,
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

/**
 * Adressen ur sparsvaret — den uppgift arkiv-backfillen kastade.
 *
 * VARFÖR: `archive-backfill.mts` sparade kopior och frågade sedan
 * availability-API:t 90 sekunder senare vad som sparats. Det API:t indexerar
 * långsammare än så. I pipelinekörning 31955869060 sparades tolv kopior, alla
 * tolv svarade «ännu ej indexerad», och steget slutade med «Inga archive_url
 * uppdaterade. Kvar utan arkiv: 32 löften» — efter nio minuters arbete. Steget
 * var grönt varje körning och flyttade ingenting, vilket är samma form som
 * pushfelet den 15 augusti: arbetet gjordes och slängdes.
 *
 * Adressen fanns hela tiden i svaret på sparbegäran. Uttagningen låg redan i
 * `waybackSave` och är nu en egen funktion, så båda vägarna läser den likadant.
 *
 * VAD DET INTE FÅNGAR: om kopian duger. Att arkivet svarade med en adress
 * säger ingenting om att citatet står i ögonblicksbilden — det prövas ord för
 * ord när kopian appliceras, och den prövningen är oförändrad.
 */
test("sparsvarets adress läses ur slutadressen efter omdirigering", () => {
  const svar = res("https://web.archive.org/web/20260816201446/https://kristdemokraterna.se/valsystem");
  assert.equal(
    snapshotUrUrSparsvar(svar),
    "https://web.archive.org/web/20260816201446/https://kristdemokraterna.se/valsystem",
  );
});

test("sparsvarets adress läses ur Location när omdirigeringen inte följts", () => {
  const svar = res("https://web.archive.org/save/https://mp.se/folkel", {
    status: 302,
    headers: { location: "https://web.archive.org/web/20260816201512/https://mp.se/folkel" },
  });
  assert.equal(
    snapshotUrUrSparsvar(svar),
    "https://web.archive.org/web/20260816201512/https://mp.se/folkel",
  );
});

test("ett svar utan kopia ger ingen adress — då, och bara då, är väntan på indexering rätt", () => {
  // Precis det läge fas C:s 90-sekundersväntan finns för. Blir svaret kvar på
  // /save/ utan Location har arkivet inte sagt var kopian hamnade.
  const svar = res("https://web.archive.org/save/https://mp.se/folkel");
  assert.equal(snapshotUrUrSparsvar(svar), null);
  // Och en adress som inte alls pekar på arkivet får aldrig tas för en kopia.
  assert.equal(snapshotUrUrSparsvar(res("https://mp.se/folkel")), null);
});

/* ───────────────────────── slaUppArchiveToday ── */

/**
 * Uppslaget som skildes från sparandet 2026-08-17.
 *
 * Bakgrunden är mätt: Internet Archive låg nere hela morgonen, och
 * `archive-backfill.mts` — som bara talade med Wayback — rapporterade
 * «saknas» för 26 käll-URL:er. Reservspåret fanns redan i `archive.ts`, men
 * bara inne i `archiveWithFallback`, som backfillen aldrig anropade.
 * Kapaciteten fanns; kopplingen saknades. Ett uppslag är billigt och får
 * göras för varje källa; ett sparande är dyrt och har en budget.
 */
test("slaUppArchiveToday: hittar en färdig kopia utan att spara något", async () => {
  const bett: string[] = [];
  const fetch: HttpFetch = async (u) => {
    bett.push(u);
    return res("https://archive.ph/aB9k2");
  };
  assert.equal(await slaUppArchiveToday("https://kd.se/pension", fetch), "https://archive.ph/aB9k2");
  assert.equal(bett.length, 1, "uppslaget ska vara EN begäran");
  assert.ok(bett[0]!.includes("/newest/"), "och den ska gå till /newest/");
  assert.ok(!bett.some((u) => u.includes("/submit/")), "uppslaget får aldrig spara");
});

test("slaUppArchiveToday: ingen kopia ger null, inte ett undantag", async () => {
  const fetch: HttpFetch = async () => res("https://archive.ph/newest/https://kd.se/x", { status: 404 });
  assert.equal(await slaUppArchiveToday("https://kd.se/x", fetch), null);
});

test("slaUppArchiveToday: tjänsten nere ger null, inte ett kastat fel", async () => {
  const fetch: HttpFetch = async () => { throw new Error("ECONNREFUSED"); };
  assert.equal(await slaUppArchiveToday("https://kd.se/x", fetch), null);
});

/* ───────────────────────── arkivleverantor ── */

/**
 * Leverantören härleds ur adressen och lagras inte i ett eget fält. En
 * adress kan inte glida isär från sig själv; ett fält som säger något annat
 * än länken är ett fel ingen upptäcker.
 */
test("arkivleverantor: skiljer Wayback från reservarkivet", () => {
  assert.equal(
    arkivleverantor("https://web.archive.org/web/20260709051254/https://v.se/nyhet"),
    "wayback",
  );
  assert.equal(arkivleverantor("https://archive.ph/aB9k2"), "archive.today");
  assert.equal(arkivleverantor("https://archive.is/20260716/https://v.se/nyhet"), "archive.today");
});

test("arkivleverantor: en adress som inte är ett arkiv är inte en kopia", () => {
  // Skulle en källänk råka hamna i archive_url ska den inte räknas som
  // arkiverad bara för att fältet är ifyllt.
  assert.equal(arkivleverantor("https://kristdemokraterna.se/pension"), "okand");
  assert.equal(arkivleverantor(null), "okand");
  assert.equal(arkivleverantor(undefined), "okand");
  // Domännamn som bara LIKNAR arkivet får inte passera.
  assert.equal(arkivleverantor("https://web.archive.org.falsk.se/web/1/x"), "okand");
});

/* ───────────────────────── slaUppGhostarchive ── */

/**
 * Tredje spåret, och det enda som arkiverar YouTube-video.
 *
 * Mätt 2026-08-17: sökningen är öppen (`GET /search?term=` svarar 200 utan
 * hinder), sparandet ligger bakom en Cloudflare-utmaning (`POST /archive2`
 * svarar 403 «Just a moment…»). Samma form som archive.today — två oberoende
 * gratisarkiv, båda öppna för läsning och stängda för automatiskt skrivande.
 */
const ghostSvar = (html: string, status = 200): Response => ({
  url: "https://ghostarchive.org/search",
  status,
  ok: status >= 200 && status < 300,
  headers: new Headers({}),
  text: async () => html,
} as unknown as Response);

test("slaUppGhostarchive: hittar en sidkopia när adressen står i samma rad", async () => {
  const url = "https://kd.se/pension";
  const fetch: HttpFetch = async () =>
    ghostSvar(`<h1>Archives for ${url}</h1><table><tr><td>${url}</td><td><a href="/archive/rJZdi">se</a></td></tr></table>`);
  assert.equal(await slaUppGhostarchive(url, fetch), "https://ghostarchive.org/archive/rJZdi");
});

test("slaUppGhostarchive: hittar en VIDEOkopia på filmens id — det ingen annan tjänst gör", async () => {
  // Videoraden visar bara filmens titel, ingen adress. Id:t i /varchive/ ÄR
  // YouTubes video-id, och det är den exakta jämförelsen.
  const url = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
  const fetch: HttpFetch = async () =>
    ghostSvar(`<h1>Archives for ${url}</h1><table><tr><td>Me at the zoo</td><td><a href="/varchive/jNQXAC9IVRw">se</a></td></tr></table>`);
  assert.equal(
    await slaUppGhostarchive(url, fetch),
    "https://ghostarchive.org/varchive/jNQXAC9IVRw",
  );
});

test("slaUppGhostarchive: ekot i rubriken godtas INTE som träff", async () => {
  // Regressionsprovet. Sökresultatsidan ekar alltid tillbaka frågan, även för
  // en påhittad adress — mätt 2026-08-17. Första versionen godtog träffen om
  // adressen fanns "någonstans i svaret", vilket alltså alltid var sant. Här
  // ekas frågan i rubriken medan enda arkivraden gäller en ANNAN sida.
  const url = "https://kd.se/pension";
  const fetch: HttpFetch = async () =>
    ghostSvar(`<h1>Archives for ${url}</h1><table><tr><td>https://kd.se/NAGOT-ANNAT</td><td><a href="/archive/rJZdi">se</a></td></tr></table>`);
  assert.equal(await slaUppGhostarchive(url, fetch), null);
});

test("slaUppGhostarchive: videokopia av FEL film godtas inte", async () => {
  const url = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
  const fetch: HttpFetch = async () =>
    ghostSvar(`<h1>Archives for ${url}</h1><table><tr><td>Annan film</td><td><a href="/varchive/ANNANFILM123">se</a></td></tr></table>`);
  assert.equal(await slaUppGhostarchive(url, fetch), null);
});

test("slaUppGhostarchive: inga träffar ger null", async () => {
  const fetch: HttpFetch = async () => ghostSvar("<h1>Archives for https://kd.se/pension</h1><p>No results</p>");
  assert.equal(await slaUppGhostarchive("https://kd.se/pension", fetch), null);
});

test("slaUppGhostarchive: tjänsten nere ger null, inte ett kastat fel", async () => {
  const fetch: HttpFetch = async () => { throw new Error("ECONNREFUSED"); };
  assert.equal(await slaUppGhostarchive("https://kd.se/x", fetch), null);
});

/* ───────────────────────── videokopior ── */

test("arkivleverantor känner igen Ghostarchive", () => {
  assert.equal(arkivleverantor("https://ghostarchive.org/archive/rJZdi"), "ghostarchive");
  assert.equal(arkivleverantor("https://ghostarchive.org/varchive/jNQXAC9IVRw"), "ghostarchive");
});

test("arVideokopia skiljer video från text — och det avgör vilket fält den får hamna i", () => {
  // En videokopia bär ingen text att pröva citatet mot. Hamnar den i
  // archive_url ser löftet ut att ha ett ordagrant belägg det inte har.
  assert.equal(arVideokopia("https://ghostarchive.org/varchive/jNQXAC9IVRw"), true);
  assert.equal(arVideokopia("https://ghostarchive.org/archive/rJZdi"), false);
  assert.equal(arVideokopia("https://web.archive.org/web/2026/https://kd.se/x"), false);
  assert.equal(arVideokopia(null), false);
});
