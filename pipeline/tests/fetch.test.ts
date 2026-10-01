Warning: truncated output (original token count: 16439)
Total output lines: 1483

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { kanoniskAdress } from "../src/adressen.ts";
import {
  parseRobotsTxt,
  isPathAllowed,
  stripHtml,
  parseRiksdagenDokumentlista,
  parseRiksdagenAnforandelista,
  dedup,
  sha256,
  loadEtagCache,
  saveEtagCache,
  LiveSource,
  seenKey,
  findManifestPdfLinks,
  findArticleLinks,
  datumUrAdress,
  datumUrHtml,
  uppdateringsdatumUrHtml,
  harForegaendeValsAr,
  arRegionEllerKommundokument,
  MAX_INDEX_ARTICLES,
  joinPdfLines,
  parsePdfDate,
  looksLikePdf,
  PDF_PAGES_PER_CHUNK,
  type HttpFetchFn,
  type RobotsRule,
} from "../src/fetch.ts";
import { archiveViaWayback, type ArchiveResult } from "../src/archive.ts";

/* ──────────────────────── Fixturer ── */

const FIXTURES = join(import.meta.dirname, "..", "fixtures", "rss");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

/* ──────────────────────── RSS-parsning ── */

describe("RSS/Atom-parsning", () => {
  test("parsar RSS 2.0 med content:encoded", async () => {
    const xml = readFixture("party-rss.xml");
    const { parseRssXml } = await import("../src/fetch.ts");
    const items = await parseRssXml(xml);

    assert.equal(items.length, 3, "Tre items i fixture");
    assert.equal(items[0]!.title, "Vi vill sänka skatten med tio miljarder");
    assert.ok(items[0]!.link.includes("testpartiet.se"), `Link: ${items[0]!.link}`);
    assert.ok(items[0]!.content.length > 100, `Content längd: ${items[0]!.content.length}`);
    assert.ok(items[0]!.description.length > 0);
  });

  test("parsar Atom-flöde med link-rel=alternate", async () => {
    const xml = readFixture("atom-feed.xml");
    const { parseRssXml } = await import("../src/fetch.ts");
    const items = await parseRssXml(xml);

    assert.equal(items.length, 2, "Two Atom entries");
    assert.equal(items[0]!.title, "Regeringen presenterar ny försvarsplan");
    assert.ok(items[0]!.link.includes("sverigesradio.se"), `Link: ${items[0]!.link}`);
    assert.ok(items[0]!.pubDate.length > 0, `Published: ${items[0]!.pubDate}`);
  });

  test("RSS item utan content:encoded faller tillbaka på description", async () => {
    const xml = readFixture("party-rss.xml");
    const { parseRssXml } = await import("../src/fetch.ts");
    const items = await parseRssXml(xml);
    const shortItem = items[2]!;
    assert.equal(shortItem.title, "Kort pressmeddelande");
    assert.ok(shortItem.content.length > 0, "Innehåll från description");
  });
});

/* ──────────────────────── HTML-stripping ── */

describe("HTML-stripping", () => {
  test("strippar HTML-taggar och avkodar entiteter", () => {
    const html = "<p>En <strong>viktig</strong> text med &amp; tecken.</p>";
    const result = stripHtml(html);
    assert.equal(result, "En viktig text med & tecken.");
  });

  test("lämnar vanlig text orörd", () => {
    const html = "Ren text utan HTML";
    const result = stripHtml(html);
    assert.equal(result, "Ren text utan HTML");
  });

  test("konverterar <br> och </p> till radbrytningar", () => {
    const html = "<p>Stycke 1</p><p>Stycke 2<br/>Line 2</p>";
    const result = stripHtml(html);
    assert.ok(result.includes("Stycke 1"));
    assert.ok(result.includes("Stycke 2"));
    assert.ok(result.includes("\n"));
  });

  test("hanterar numeriska HTML-entiteter", () => {
    const html = "Test &#8211; streck &#x2014; lang";
    const result = stripHtml(html);
    assert.ok(result.includes("–"), `Result: ${result}`);
    assert.ok(result.includes("—"), `Result: ${result}`);
  });

  test("kollapsar multipla whitespace", () => {
    const html = "  Mycket    mellanslag  \t och \n tabbar  ";
    const result = stripHtml(html);
    assert.ok(!result.includes("  "), `Ej dubbla mellanslag: "${result}"`);
  });
});

/* ──────────────────────── Riksdagen API-parsning ── */

describe("Riksdagen API-parsning", () => {
  test("parsar dokumentlista med array av dokument", () => {
    const json = JSON.parse(readFixture("riksdagen-mot.json")) as Record<string, unknown>;
    const docs = parseRiksdagenDokumentlista(json);

    assert.equal(docs.length, 2);
    assert.equal(docs[0]!.dok_id, "TEST001");
    assert.equal(docs[0]!.titel, "Motion om höjd a-kassa till 90 procent");
    assert.ok(docs[0]!.url.includes("data.riksdagen.se"));
  });

  test("hanterar enskilt dokument (dict, inte array)", () => {
    const json = JSON.parse(readFixture("riksdagen-mot.json")) as Record<string, unknown>;
    const lista = json.dokumentlista as Record<string, unknown>;
    lista.dokument = (lista.dokument as unknown[])[0];

    const docs = parseRiksdagenDokumentlista(json);
    assert.equal(docs.length, 1);
    assert.equal(docs[0]!.dok_id, "TEST001");
  });

  test("parsar anförandelista", () => {
    const json = JSON.parse(readFixture("riksdagen-anf.json")) as Record<string, unknown>;
    const items = parseRiksdagenAnforandelista(json);

    assert.equal(items.length, 2);
    assert.ok(items[0]!.talare.includes("Test Talare"));
    assert.equal(items[0]!.parti, "TP");
    assert.ok(items[0]!.anforande_url_xml.length > 0);
  });

  test("hanterar enskilt anförande (dict, inte array)", () => {
    const json = JSON.parse(readFixture("riksdagen-anf.json")) as Record<string, unknown>;
    const lista = json.anforandelista as Record<string, unknown>;
    lista.anforande = (lista.anforande as unknown[])[0];

    const items = parseRiksdagenAnforandelista(json);
    assert.equal(items.length, 1);
    assert.ok(items[0]!.talare.includes("Test Talare"));
  });

  test("tom/saknad data ger tom array", () => {
    assert.deepEqual(parseRiksdagenDokumentlista({}), []);
    assert.deepEqual(parseRiksdagenDokumentlista({ dokumentlista: {} }), []);
    assert.deepEqual(parseRiksdagenAnforandelista({}), []);
    assert.deepEqual(parseRiksdagenAnforandelista({ anforandelista: {} }), []);
  });
});

/* ──────────────────────── Robots.txt ── */

describe("Robots.txt-respekt", () => {
  test("tolkar robots.txt med User-Agent UtlovatBot", () => {
    const text = readFixture("robots-allowed.txt");
    const rules = parseRobotsTxt(text, "UtlovatBot");

    assert.ok(rules.length >= 2, `Minst 2 regler: ${rules.length}`);
    assert.ok(isPathAllowed("/nyheter/press/", rules), "Tillåten path");
    assert.ok(!isPathAllowed("/admin/settings", rules), "Blockerad path");
    assert.ok(!isPathAllowed("/internal/data", rules), "Blockerad path");
  });

  test("Disallow: / blockerar allt", () => {
    const text = readFixture("robots-denied.txt");
    const rules = parseRobotsTxt(text, "UtlovatBot");

    assert.ok(rules.length > 0);
    assert.ok(!isPathAllowed("/any/path", rules), "Allt blockerat");
  });

  test("ignorerar kommentarer och tomma rader", () => {
    const text = "# Kommentar\n\nUser-agent: *\nAllow: /\n# Mer kommentar\n";
    const rules = parseRobotsTxt(text, "UtlovatBot");
    assert.equal(rules.length, 1);
    assert.ok(rules[0]!.allow);
  });

  test("User-Agent * matchar alla bots", () => {
    const text = "User-agent: *\nDisallow: /private/\n";
    const rules = parseRobotsTxt(text, "SomeOtherBot");
    assert.equal(rules.length, 1);
    assert.ok(!isPathAllowed("/private/data", rules));
    assert.ok(isPathAllowed("/public/data", rules));
  });

  test("specifik UA har företräde framför *", () => {
    const text = "User-agent: *\nDisallow: /\n\nUser-agent: UtlovatBot\nAllow: /nyheter/\n";
    const rules = parseRobotsTxt(text, "UtlovatBot");
    assert.equal(rules.length, 1);
    assert.ok(rules[0]!.allow);
    assert.equal(rules[0]!.path, "/nyheter/");
  });
});

/* ──────────────────────── ETag/IMS-cache ── */

describe("ETag/If-Modified-Since cache", () => {
  test("laddar och sparar cache", () => {
    const tmp = mkdtempSync(join(tmpdir(), "etag-test-"));
    try {
      const cache = new Map<string, { etag?: string; lastModified?: string; lastFetched: string }>();
      cache.set("https://example.com/feed", {
        etag: '"abc123"',
        lastModified: "Thu, 12 Jun 2026 06:00:00 GMT",
        lastFetched: "2026-06-12T06:00:00Z",
      });

      saveEtagCache(tmp, cache);

      const loaded = loadEtagCache(tmp);
      assert.equal(loaded.size, 1);
      const entry = loaded.get("https://example.com/feed")!;
      assert.equal(entry.etag, '"abc123"');
      assert.equal(entry.lastModified, "Thu, 12 Jun 2026 06:00:00 GMT");
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });

  test("null cacheDir ger tom cache", () => {
    const loaded = loadEtagCache(null);
    assert.equal(loaded.size, 0);
  });

  test("sparar inte med null cacheDir", () => {
    const cache = new Map<string, { lastFetched: string }>();
    cache.set("key", { lastFetched: "now" });
    saveEtagCache(null, cache); // ska inte krascha
  });
});

/* ──────────────────────── Seen-dedup ── */

describe("Seen-dedup (SHA-256)", () => {
  test("nya URL:er läggs till, duplicat filtreras", () => {
    const seen = new Map<string, string>();
    seen.set(sha256("https://example.com/a"), "https://example.com/a");

    const articles = [
      { url: "https://example.com/a", domain: "example.com", title: "A", text: "text", published: "2026-06-12T00:00:00Z" },
      { url: "https://example.com/b", domain: "example.com", title: "B", text: "text", published: "2026-06-12T00:00:00Z" },
      { url: "https://example.com/c", domain: "example.com", title: "C", text: "text", published: "2026-06-12T00:00:00Z" },
    ];

    const { newArticles, seen: updatedSeen } = dedup(articles, seen);
    assert.equal(newArticles.length, 2, "B och C är nya");
    assert.equal(updatedSeen.size, 3);
    assert.equal(newArticles[0]!.url, "https://example.com/b");
    assert.equal(newArticles[1]!.url, "https://example.com/c");
  });

  test("SHA-256 är deterministisk", () => {
    const h1 = sha256("https://example.com/test");
    const h2 = sha256("https://example.com/test");
    assert.equal(h1, h2);
    assert.equal(h1.length, 64);
  });
});

/* ──────────────────────── Wayback-retry ── */

describe("Wayback archive med retry/backoff", () => {
  test("försöker igen vid nätverksfel", async () => {
    let attempts = 0;
    const mockFetch: HttpFetchFn = async () => {
      attempts++;
      if (attempts < 3) throw new Error("Network error");
      return new Response(null, {
        status: 200,
        headers: { location: "https://web.archive.org/web/20260612060000/https://example.com" },
      });
    };

    const result = await archiveViaWayback("https://example.com/article", mockFetch);

    assert.equal(attempts, 3, "Tre försök");
    assert.ok(result.retry === false || result.archive_url !== null);
  });

  test("returnerar retry=true vid 503", async () => {
    const mockFetch: HttpFetchFn = async () =>
      new Response("Service Unavailable", { status: 503 });

    const result = await archiveViaWayback("https://example.com/article", mockFetch);

    assert.equal(result.archive_url, null);
    assert.equal(result.retry, true);
  });

  test("returnerar archive_url vid redirect", async () => {
    const mockFetch: HttpFetchFn = async () =>
      new Response(null, {
        status: 200,
        headers: { location: "https://web.archive.org/web/20260612060000/https://example.com" },
      });

    // Simulate redirect by mocking url property
    const result = await archiveViaWayback("https://example.com/article", async (url: string, init?: RequestInit) => {
      const res = await mockFetch(url, init);
      Object.defineProperty(res, "url", {
        value: "https://web.archive.org/web/20260612060000/https://example.com",
      });
      return res;
    });
    assert.ok(result.archive_url?.includes("web.archive.org"));
    assert.equal(result.retry, false);
  });
});

/* ──────────────────────── LiveSource med mockade anrop ── */

describe("LiveSource med mock-HTTP", () => {
  test("skiljer frisk tom RSS från fallerad feed", async () => {
    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) return new Response("User-agent: *\nAllow: /", { status: 200 });
      if (url.includes("nere.test")) throw new Error("timeout");
      return new Response('<rss version="2.0"><channel><title>Tom</title></channel></rss>', { status: 200 });
    };
    const source = new LiveSource({
      feeds: [
        { id: "tom", type: "rss", url: "https://frisk.test/feed" },
        { id: "nere", type: "rss", url: "https://nere.test/feed" },
      ],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
    });
    assert.deepEqual(await source.fetch(), []);
    assert.deepEqual(source.getFeedOutcomes(), [
      { id: "tom", type: "rss", fetched: 0, accepted: 0, status: "ok" },
      { id: "nere", type: "rss", fetched: 0, accepted: 0, status: "failed", error: "timeout" },
    ]);
  });

  test("hämtar RSS-artiklar via mock", async () => {
    const rssXml = readFixture("party-rss.xml");

    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) {
        return new Response("User-agent: *\nAllow: /", { status: 200 });
      }
      if (url.includes("testpartiet.se")) {
        return new Response(rssXml, {
          status: 200,
          headers: { "content-type": "application/xml" },
        });
      }
      return new Response("Not found", { status: 404 });
    };

    const source = new LiveSource({
      feeds: [{ id: "test", type: "rss", url: "https://testpartiet.se/feed/" }],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
    });

    const articles = await source.fetch();
    assert.ok(articles.length >= 2, `Minst 2 artiklar (3:a kan filtreras): ${articles.length}`);
    assert.ok(articles[0]!.url.includes("testpartiet.se"));
    assert.ok(articles[0]!.text.length > 0);
    assert.ok(articles[0]!.domain.length > 0);
  });

  test("ogiltigt RSS-datum blir insamlingsdatum i stället för ett normaliserat källdatum", async () => {
    const rssXml = '<rss version="2.0"><channel><item>' +
      '<title>Ett löfte</title><link>https://testpartiet.se/lofte</link>' +
      '<pubDate>Tue, 31 Feb 2026 10:00:00 GMT</pubDate>' +
      '<description>Vi lovar att förbättra skolan.</description>' +
      '</item><item><title>Ett annat löfte</title><link>https://testpartiet.se/annat-lofte</link>' +
      '<pubDate>Wed, 10 Jun 2026 10:00:00 +9999</pubDate>' +
      '<description>Vi lovar också att förbättra skolan.</description>' +
      '</item></channel></rss>';
    const mockFetch: HttpFetchFn = async (url) => url.includes("robots.txt")
      ? new Response("User-agent: *\nAllow: /", { status: 200 })
      : new Response(rssXml, { status: 200, headers: { "content-type": "application/xml" } });
    const source = new LiveSource({
      feeds: [{ id: "test", type: "rss", url: "https://testpartiet.se/feed/" }],
      limits: { max_articles_per_run: 50, min_chars: 1 },
      httpFetch: mockFetch,
    });
    const articles = await source.fetch();
    assert.equal(articles.length, 2);
    assert.ok(articles.every((article) => article.dateBasis === "insamling"));
    assert.ok(articles.every((article) => article.published !== "2026-03-03T10:00:00.000Z"));
  });

  test("respekterar min_chars-filter", async () => {
    const rssXml = readFixture("party-rss.xml");

    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) {
        return new Response("User-agent: *\nAllow: /", { status: 200 });
      }
      return new Response(rssXml, { status: 200 });
    };

    const source = new LiveSource({
      feeds: [{ id: "test", type: "rss", url: "https://testpartiet.se/feed/" }],
      limits: { max_articles_per_run: 50, min_chars: 400 },
      httpFetch: mockFetch,
    });

    const articles = await source.fetch();
    for (const a of articles) {
      assert.ok(a.text.length >= 400, `Artikeltext >= 400: ${a.text.length}`);
    }
  });

  test("respekterar robots.txt Disallow", async () => {
    const rssXml = readFixture("party-rss.xml");

    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) {
        return new Response("User-agent: UtlovatBot/1.0\nDisallow: /\n", { status: 200 });
      }
      return new Response(rssXml, { status: 200 });
    };

    const source = new LiveSource({
      feeds: [{ id: "test", type: "rss", url: "https://testpartiet.se/feed/" }],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
    });

    const articles = await source.fetch();
    assert.equal(articles.length, 0, "Blockerat av robots.txt");
  });

  test("304 utan sparad kropp är källfel, inte tomt friskt feed", async () => {
    let callCount = 0;
    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) {
        return new Response("User-agent: *\nAllow: /", { status: 200 });
      }
      callCount++;
      return new Response(null, { status: 304 });
    };

    const source = new LiveSource({
      feeds: [{ id: "test", type: "rss", url: "https://testpartiet.se/feed/" }],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
    });

    const articles = await source.fetch();
    assert.equal(articles.length, 0);
    assert.equal(callCount, 1, "En request för feeden");
    assert.equal(source.getFeedOutcomes()[0]!.status, "failed");
    assert.match(source.getFeedOutcomes()[0]!.error!, /304 utan sparad kropp/u);
  });

  test("sparad svarskropp gör 304 återspelbar även i ny instans", async () => {
    const dir = mkdtempSync(join(tmpdir(), "etag-body-"));
    const rssXml = readFixture("party-rss.xml");
    const seenHeaders: Array<Record<string, string>> = [];
    const mockFetch: HttpFetchFn = async (url, init) => {
      if (url.includes("robots.txt")) return new Response("User-agent: *\nAllow: /", { status: 200 });
      const headers = init?.headers as Record<string, string>;
      seenHeaders.push(headers);
      return headers["If-None-Match"]
        ? new Response(null, { status: 304 })
        : new Response(rssXml, { status: 200, headers: { etag: '"rss-v1"', "content-type": "application/xml" } });
    };
    const create = () => new LiveSource({
      feeds: [{ id: "rss", type: "rss", url: "https://testpartiet.se/feed/" }],
      limits: { max_articles_per_run: 50, min_chars: 10 }, httpFetch: mockFetch, cacheDir: dir,
    });
    try {
      const first = await create().fetch();
      const secondSource = create();
      const second = await secondSource.fetch();
      assert.ok(first.length > 0);
      assert.deepEqual(second, first, "304 lämnar samma artiklar till seen-/återförsöksgrinden");
      assert.equal(seenHeaders[0]!["If-None-Match"], undefined);
      assert.equal(seenHeaders[1]!["If-None-Match"], '"rss-v1"');
      assert.equal(secondSource.getFeedOutcomes()[0]!.status, "ok");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("gammal cache med bara validator hämtar kroppen ovillkorligt", async () => {
    const dir = mkdtempSync(join(tmpdir(), "etag-old-"));
    saveEtagCache(dir, new Map([["https://testpartiet.se/feed/", { etag: '"old"', lastFetched: "2026-09-01" }]]));
    let conditional = false;
    const mockFetch: HttpFetchFn = async (url, init) => {
 …6439 tokens truncated…ml><head><title>Ett löfte</title>' +
      '<meta property="article:published_time" content="2026-07-02T09:00:00+00:00" />' +
      `</head><body><p>${"Vi lovar saker. ".repeat(40)}</p></body></html>`;
    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) return new Response("User-agent: *\nAllow: /", { status: 200 });
      if (url.endsWith("/nyhet/ett-lofte/")) {
        return new Response(artikel, { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response(lista, { status: 200, headers: { "content-type": "text/html" } });
    };
    const source = new LiveSource({
      feeds: [{ id: "m-nyheter", type: "index", url: "https://testpartiet.se/nyheter/", article_pattern: "^/nyhet/" }],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
      now: () => new Date("2026-08-04T00:00:00Z"),
    });
    const articles = await source.fetch();
    assert.equal(articles.length, 1);
    assert.equal(
      articles[0]!.published,
      "2026-07-02T09:00:00.000Z",
      "artikelns eget datum, inte hämtningsdagen",
    );
  });

  test("findManifestPdfLinks: manifest från ett tidigare val följs inte", () => {
    // Alla adresser nedan är verkliga, hämtade 2026-08-03. SD:s och MP:s
    // /valmanifest/ pekar på 2022 års manifest och KD:s politiksida på
    // EU-valets 2024 — alla tre matchar nyckelordsregeln perfekt. Utan
    // årsspärren hade de lästs in som 2026 års vallöften.
    for (const gammal of [
      "/wp-content/uploads/2022/08/valmanifest.pdf",
      "/wp-content/uploads/2022/08/valmanifest2022_hela_a4_klart.pdf",
      "/download/18.69b3406d19a7bcb82b75271/1764661852071/Manifesto_2024.pdf",
    ]) {
      assert.equal(harForegaendeValsAr(gammal), true, `borde spärras: ${gammal}`);
    }

    // Och lika viktigt: valårets egna manifest får inte fastna. C:s och L:s
    // adressers årtal står på olika ställen, MP:s handlingsprogram bär två.
    for (const aktuell of [
      "/wp-content/uploads/2026/06/Valmanifest-2026.pdf",
      "/wp-content/uploads/liberalernas-valmanifest-2026-40s-komprimerad.pdf",
      "/wp-content/uploads/2026/04/politiskt-handlingsprogram-2026-2030.pdf",
    ]) {
      assert.equal(harForegaendeValsAr(aktuell), false, `borde släppas: ${aktuell}`);
    }

    // En adress utan årtal säger ingenting om ålder och ska släppas igenom —
    // spärren stoppar det vi kan se är gammalt, den gissar aldrig. Den långa
    // sifferkedjan i S:s nedladdningsadress är inget årtal.
    assert.equal(
      harForegaendeValsAr("/download/18.68544bb219c4794c4a4684c/1771599906618/Valplattform.pdf"),
      false,
      "sifferkedja i nedladdningsadress är inget årtal",
    );

    // Hela vägen genom länkletaren, inte bara predikatet.
    const html =
      '<a href="/wp-content/uploads/2022/08/valmanifest.pdf">Valmanifest</a>' +
      '<a href="/wp-content/uploads/2026/06/valmanifest-2026.pdf">Valmanifest 2026</a>';
    assert.deepEqual(
      findManifestPdfLinks(html, "https://testpartiet.se/valmanifest/"),
      ["https://testpartiet.se/wp-content/uploads/2026/06/valmanifest-2026.pdf"],
      "bara valårets manifest följs",
    );
  });

  test("findManifestPdfLinks: regionmanifest följs inte", () => {
    // Sverigedemokraternas regionmanifest låg länkat från politiksidan och togs
    // in 2026-08-04 — det enda regionala dokumentet i registret. Sajten
    // granskar riksdagsvalet, och ett regionmanifest lovar vad regionerna ska
    // göra med sin egen kassa.
    for (const regionalt of [
      "/wp-content/uploads/2026/08/sd-region-valmanifest-2026.pdf",
      "/wp-content/uploads/2026/kommunalt-valmanifest.pdf",
      "/dokument/regionala-valplattformen-2026.pdf",
      "/uploads/landstingsprogram-2026.pdf",
    ]) {
      assert.equal(arRegionEllerKommundokument(regionalt), true, `borde spärras: ${regionalt}`);
    }

    // Riksdokumenten får inte fastna. "Regeringen" och "kommunikation" bär
    // samma bokstäver i början som "region" respektive "kommun" — ordgränsen
    // är det som skiljer dem åt.
    for (const riks of [
      "/wp-content/uploads/2026/06/Valmanifest-2026.pdf",
      "/wp-content/uploads/2026/07/valplattform-2026.pdf",
      "/wp-content/uploads/2026/04/politiskt-handlingsprogram-2026-2030.pdf",
      "/dokument/regeringens-valmanifest-2026.pdf",
      "/dokument/kommunikationspolitiskt-handlingsprogram-2026.pdf",
    ]) {
      assert.equal(arRegionEllerKommundokument(riks), false, `borde släppas: ${riks}`);
    }

    // Hela vägen genom länkletaren.
    const html =
      '<a href="/wp-content/uploads/2026/08/sd-region-valmanifest-2026.pdf">Regionmanifest</a>' +
      '<a href="/wp-content/uploads/2026/07/valplattform-2026.pdf">Valplattform</a>';
    assert.deepEqual(
      findManifestPdfLinks(html, "https://testpartiet.se/vad-vi-vill/"),
      ["https://testpartiet.se/wp-content/uploads/2026/07/valplattform-2026.pdf"],
      "bara riksdokumentet följs",
    );
  });

  test("index-källa följer nyhetslistan till artiklarna", async () => {
    // S och C saknar flöde helt. Utan den här vägen nådde deras nyheter oss
    // aldrig: mätt 2026-08-03 hade S publicerat tre och C fem sedan vårt
    // nyaste löfte från dem.
    const lista =
      "<html><head><title>Nyheter</title></head><body>" +
      '<a href="/nyheter/nyheter/2026-07-31-aldre-loftet">Äldre</a>' +
      '<a href="/nyheter/nyheter/2026-08-03-nyare-loftet">Nyare</a>' +
      '<a href="/om-oss">Om oss</a></body></html>';
    const artikel = (namn: string) =>
      `<html><head><title>${namn}</title></head><body><p>${"Vi lovar att göra saker. ".repeat(20)}</p></body></html>`;

    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) {
        return new Response("User-agent: *\nAllow: /", { status: 200 });
      }
      if (url.endsWith("2026-08-03-nyare-loftet")) {
        return new Response(artikel("Nyare löftet"), { status: 200, headers: { "content-type": "text/html" } });
      }
      if (url.endsWith("2026-07-31-aldre-loftet")) {
        return new Response(artikel("Äldre löftet"), { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response(lista, { status: 200, headers: { "content-type": "text/html" } });
    };

    const source = new LiveSource({
      feeds: [{ id: "parti-nyheter", type: "index", url: "https://testpartiet.se/" }],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
      now: () => new Date("2026-08-04T00:00:00Z"),
    });

    const articles = await source.fetch();
    assert.equal(articles.length, 2, "bara artiklarna — listan blir aldrig en egen artikel");
    assert.ok(
      !articles.some((a) => a.url === "https://testpartiet.se/"),
      "listsidan får inte komma med",
    );
    assert.equal(articles[0]!.url, "https://testpartiet.se/nyheter/nyheter/2026-08-03-nyare-loftet", "nyast först");
    assert.equal(articles[0]!.title, "Nyare löftet");
    assert.equal(
      articles[0]!.published,
      "2026-08-03T12:00:00.000Z",
      "publiceringsdatum ur adressen, inte hämtningstiden",
    );
    assert.equal(articles[0]!.feedType, "index");
    assert.ok(articles[0]!.contentHash, "ändringsbevakas via contentHash");
  });

  test("index-källa: en trasig artikel fäller inte de andra", async () => {
    const lista =
      '<a href="/nyheter/2026-08-03-funkar">Funkar</a>' +
      '<a href="/nyheter/2026-08-02-trasig">Trasig</a>';
    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) return new Response("User-agent: *\nAllow: /", { status: 200 });
      if (url.endsWith("2026-08-02-trasig")) return new Response("nej", { status: 500 });
      if (url.endsWith("2026-08-03-funkar")) {
        return new Response(
          `<html><head><title>Funkar</title></head><body><p>${"Ett löfte. ".repeat(50)}</p></body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return new Response(lista, { status: 200, headers: { "content-type": "text/html" } });
    };
    const source = new LiveSource({
      feeds: [{ id: "parti-nyheter", type: "index", url: "https://testpartiet.se/nyheter" }],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
      now: () => new Date("2026-08-04T00:00:00Z"),
    });
    const articles = await source.fetch();
    assert.equal(articles.length, 1, "den hela artikeln kom med");
    assert.ok(articles[0]!.url.endsWith("2026-08-03-funkar"));
    const outcome = source.getFeedOutcomes()[0]!;
    assert.equal(outcome.status, "partial");
    assert.equal(outcome.fetched, 1);
    assert.deepEqual(outcome.failures, [{
      url: "https://testpartiet.se/nyheter/2026-08-02-trasig",
      error: "HTTP 500 for https://testpartiet.se/nyheter/2026-08-02-trasig",
    }]);
  });

  test("page-källa auto-följer manifest-PDF länkad från sidan", async () => {
    // M/SD/KD har inte publicerat manifest ännu — när valsidan en dag länkar
    // sin PDF ska B fånga den utan att någon registrerar en ny feed.
    const pdfBytes = readFileSync(join(import.meta.dirname, "..", "fixtures", "pdf", "manifest-2p.pdf"));
    const html =
      "<html><head><title>Vår politik</title></head><body>" +
      '<p>Nu finns hela valmanifestet att läsa.</p>' +
      '<a href="/dokument/valmanifest-2026.pdf">Läs hela valmanifestet</a></body></html>';

    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) {
        return new Response("User-agent: *\nAllow: /", { status: 200 });
      }
      if (url.endsWith("valmanifest-2026.pdf")) {
        return new Response(new Uint8Array(pdfBytes), {
          status: 200,
          headers: { "content-type": "application/pdf" },
        });
      }
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    };

    const source = new LiveSource({
      feeds: [{ id: "parti-politik", type: "page", url: "https://testpartiet.se/politik/" }],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
      now: () => new Date("2026-06-15T00:00:00Z"), // fixturens CreationDate är 2026-06-04
    });

    const articles = await source.fetch();
    assert.equal(articles.length, 2, "sid-artikeln + den följda PDF:en");
    assert.equal(articles[0]!.url, "https://testpartiet.se/politik/");
    assert.equal(articles[1]!.url, "https://testpartiet.se/dokument/valmanifest-2026.pdf");
    assert.ok(articles[1]!.text.includes("anställa fler poliser"), "PDF-texten extraherad");
    assert.ok(articles[1]!.contentHash, "följd PDF ändringsbevakas via contentHash");
  });

  test("auto-följd PDF äldre än G4-fönstret hoppas över (förra valets manifest)", async () => {
    // SD/KD:s politiksidor länkar 2022/2024-dokument. G4 hade stoppat publicering,
    // men följ-steget ska inte ens spendera LLM-anrop eller review-poster på dem.
    const pdfBytes = readFileSync(join(import.meta.dirname, "..", "fixtures", "pdf", "manifest-2p.pdf"));
    const html =
      '<html><head><title>Politik</title></head><body><p>Vår politik i sin helhet.</p>' +
      '<a href="/dok/valmanifest.pdf">Valmanifest</a></body></html>';

    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) {
        return new Response("User-agent: *\nAllow: /", { status: 200 });
      }
      if (url.endsWith(".pdf")) {
        return new Response(new Uint8Array(pdfBytes), {
          status: 200,
          headers: { "content-type": "application/pdf" },
        });
      }
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    };

    const source = new LiveSource({
      feeds: [{ id: "parti-politik", type: "page", url: "https://testpartiet.se/politik/" }],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
      now: () => new Date("2028-06-15T00:00:00Z"), // fixturens PDF (2026-06-04) är nu > 548 dygn
    });

    const articles = await source.fetch();
    assert.equal(articles.length, 1, "bara sid-artikeln — den gamla PDF:en hoppas över");
    assert.equal(articles[0]!.url, "https://testpartiet.se/politik/");
  });

  test("joinPdfLines: avstavning, hängande bindestreck och versal-sammansättning", () => {
    assert.equal(
      joinPdfLines(["korta vägen mellan arbets-", "marknaden och skolan"]),
      "korta vägen mellan arbetsmarknaden och skolan",
      "gemen avstavning sys ihop utan streck",
    );
    assert.equal(
      joinPdfLines(["vi bygger ut vård-", "och omsorg"]),
      "vi bygger ut vård-\noch omsorg",
      "hängande bindestreck före konjunktion lämnas",
    );
    assert.equal(
      joinPdfLines(["full tillgång till EU-", "medel och rösträtt"]),
      "full tillgång till EU-medel och rösträtt",
      "versal-sammansättning behåller strecket",
    );
    assert.equal(
      joinPdfLines(["mjukt av­stavat ord", "", "nästa rad"]),
      "mjukt avstavat ord\nnästa rad",
      "soft hyphen INUTI rad bort, tomrader hoppas över",
    );
    assert.equal(
      joinPdfLines(["en jobbtrappa till själv­", "försörjning och jobbkontrakt"]),
      "en jobbtrappa till självförsörjning och jobbkontrakt",
      "mjukt bindestreck SIST på raden = avstavning — sys ihop (S:s valplattform)",
    );
  });

  test("parsePdfDate tolkar PDF-datum med och utan tidszon", () => {
    assert.equal(parsePdfDate("D:20260604154527+02'00'"), "2026-06-04T13:45:27.000Z");
    assert.equal(parsePdfDate("D:20260604120000Z"), "2026-06-04T12:00:00.000Z");
    assert.equal(parsePdfDate("D:2026"), "2026-01-01T00:00:00.000Z", "utelämnade fält defaultar");
    assert.equal(parsePdfDate("inte ett datum"), null);
  });

  test("looksLikePdf: content-type eller %PDF-signatur", () => {
    const sig = new TextEncoder().encode("%PDF-1.7 …");
    assert.ok(looksLikePdf("application/pdf", new Uint8Array()));
    assert.ok(looksLikePdf("application/pdf; charset=binary", new Uint8Array()));
    assert.ok(looksLikePdf(null, sig), "octet-stream med PDF-signatur");
    assert.ok(!looksLikePdf("text/html", new TextEncoder().encode("<html>")));
  });

  test("hämtar riksdagen motioner via mock", async () => {
    const motJson = readFixture("riksdagen-mot.json");
    const motText = "Detta är motionens fulla text om att höja a-kassan till nittio procent av lönen vilket beräknas kosta ungefär tolv miljarder kronor per år en partiets egen beräkning.";

    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("dokumentlista")) {
        return new Response(motJson, { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("TEST001.text") || url.includes("TEST002.text")) {
        return new Response(motText, { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const source = new LiveSource({
      feeds: [{
        id: "riksdagen-mot",
        type: "riksdagen_api",
        url: "https://data.riksdagen.se/dokumentlista/?doktyp=mot&utformat=json",
      }],
      limits: { max_articles_per_run: 50, min_chars: 100 },
      httpFetch: mockFetch,
    });

    const articles = await source.fetch();
    assert.ok(articles.length >= 1, `Minst 1 motion: ${articles.length}`);
    assert.equal(articles[0]!.domain, "data.riksdagen.se");
    assert.ok(articles[0]!.text.length >= 100, `Textlängd: ${articles[0]!.text.length}`);
  });
});

/* ──────────────────────── Avbackning på 429 ── */

describe("LiveSource backar av på 429", () => {
  /**
   * Bakgrund: moderaterna.se svarade 429 på ungefär två tredjedelar av
   * sidorna i varje körning från 2026-09-15 och framåt — 68 av 73 i körning
   * 35427897952. Hämtningen kastade då sidan direkt: ett `throw` på allt som
   * inte var `ok`. En taktspärr är inte ett trasigt dokument, den är ett
   * "kom tillbaka strax", och skillnaden kostade oss sidorna varje gång.
   */
  const robots = (url: string) =>
    url.includes("robots.txt")
      ? new Response("User-agent: *\nAllow: /", { status: 200 })
      : null;

  const sida = (text: string) =>
    new Response(`<html><head><title>T</title></head><body><p>${text}</p></body></html>`, {
      status: 200,
      headers: { "content-type": "text/html" },
    });

  function bygg(mock: HttpFetchFn, sovit: number[]) {
    return new LiveSource({
      feeds: [{
        id: "test",
        type: "index",
        url: "https://testpartiet.se/politik/",
        article_pattern: "^/politik/",
      }],
      limits: { max_articles_per_run: 50, min_chars: 10, hamtning_omforsok: 3 },
      httpFetch: mock,
      sleep: async (ms: number) => { sovit.push(ms); },
    });
  }

  test("en 429 följs av ett nytt försök som lyckas", async () => {
    const sovit: number[] = [];
    let forsok = 0;
    const mock: HttpFetchFn = async (url) => {
      const r = robots(url);
      if (r) return r;
      if (url.endsWith("/politik/")) {
        return sida('<a href="/politik/skatter">Skatter</a>');
      }
      forsok++;
      if (forsok === 1) return new Response("slow down", { status: 429 });
      return sida("Vi vill sänka skatten på arbete rejält och varaktigt.");
    };

    const artiklar = await bygg(mock, sovit).fetch();
    assert.equal(forsok, 2, "sidan provas om efter 429");
    assert.equal(artiklar.length, 1, "sidan räddas av omförsöket");
    assert.ok(sovit.length >= 1, "det sovs mellan försöken");
  });

  /** Leverantörens egen Retry-After gäller före vår egen backoff. */
  test("Retry-After styr väntan", async () => {
    const sovit: number[] = [];
    let forsok = 0;
    const mock: HttpFetchFn = async (url) => {
      const r = robots(url);
      if (r) return r;
      if (url.endsWith("/politik/")) {
        return sida('<a href="/politik/skatter">Skatter</a>');
      }
      forsok++;
      if (forsok === 1) {
        return new Response("slow down", { status: 429, headers: { "retry-after": "2" } });
      }
      return sida("Vi vill sänka skatten på arbete rejält och varaktigt.");
    };

    await bygg(mock, sovit).fetch();
    assert.equal(sovit[0], 2000, `Retry-After: 2 ⇒ 2000 ms, fick ${sovit[0]}`);
  });

  /**
   * Avbackningen får inte bli ett sätt att mala vidare i all oändlighet mot
   * en sajt som säger ifrån. Tar försöken slut hoppas sidan över precis som
   * förut — en trasig undersida tar aldrig med sig resten av källan.
   */
  test("envis 429 ger upp och hoppar över sidan", async () => {
    const sovit: number[] = [];
    let forsok = 0;
    const mock: HttpFetchFn = async (url) => {
      const r = robots(url);
      if (r) return r;
      if (url.endsWith("/politik/")) {
        return sida('<a href="/politik/skatter">Skatter</a>');
      }
      forsok++;
      return new Response("slow down", { status: 429 });
    };

    const artiklar = await bygg(mock, sovit).fetch();
    assert.equal(artiklar.length, 0, "sidan hoppas över");
    assert.equal(forsok, 4, "ett försök + tre omförsök");
  });

  /** 403 är ett besked, inte en takt. Det ska inte provas om. */
  test("403 provas inte om", async () => {
    const sovit: number[] = [];
    let forsok = 0;
    const mock: HttpFetchFn = async (url) => {
      const r = robots(url);
      if (r) return r;
      if (url.endsWith("/politik/")) {
        return sida('<a href="/politik/skatter">Skatter</a>');
      }
      forsok++;
      return new Response("nope", { status: 403 });
    };

    const artiklar = await bygg(mock, sovit).fetch();
    assert.equal(artiklar.length, 0);
    assert.equal(forsok, 1, "403 provas en gång, inte fyra");
    assert.equal(sovit.length, 0, "ingen väntan på ett nej");
  });
});
