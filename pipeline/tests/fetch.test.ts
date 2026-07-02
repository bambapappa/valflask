import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
  type HttpFetchFn,
  type RobotsRule,
} from "../src/fetch.ts";
import { createArchiveFn, type ArchiveResult } from "../src/archive.ts";

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
  test("tolkar robots.txt med User-Agent DrygastBot", () => {
    const text = readFixture("robots-allowed.txt");
    const rules = parseRobotsTxt(text, "DrygastBot");

    assert.ok(rules.length >= 2, `Minst 2 regler: ${rules.length}`);
    assert.ok(isPathAllowed("/nyheter/press/", rules), "Tillåten path");
    assert.ok(!isPathAllowed("/admin/settings", rules), "Blockerad path");
    assert.ok(!isPathAllowed("/internal/data", rules), "Blockerad path");
  });

  test("Disallow: / blockerar allt", () => {
    const text = readFixture("robots-denied.txt");
    const rules = parseRobotsTxt(text, "DrygastBot");

    assert.ok(rules.length > 0);
    assert.ok(!isPathAllowed("/any/path", rules), "Allt blockerat");
  });

  test("ignorerar kommentarer och tomma rader", () => {
    const text = "# Kommentar\n\nUser-agent: *\nAllow: /\n# Mer kommentar\n";
    const rules = parseRobotsTxt(text, "DrygastBot");
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
    const text = "User-agent: *\nDisallow: /\n\nUser-agent: DrygastBot\nAllow: /nyheter/\n";
    const rules = parseRobotsTxt(text, "DrygastBot");
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

    const archiveFn = createArchiveFn(mockFetch, 1000);
    const result = await archiveFn("https://example.com/article");

    assert.equal(attempts, 3, "Tre försök");
    assert.ok(result.retry === false || result.archive_url !== null);
  });

  test("returnerar retry=true vid 503", async () => {
    const mockFetch: HttpFetchFn = async () =>
      new Response("Service Unavailable", { status: 503 });

    const archiveFn = createArchiveFn(mockFetch, 100);
    const result = await archiveFn("https://example.com/article");

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
    const archiveFn = createArchiveFn(async (url: string, init?: RequestInit) => {
      const res = await mockFetch(url, init);
      Object.defineProperty(res, "url", {
        value: "https://web.archive.org/web/20260612060000/https://example.com",
      });
      return res;
    }, 100);

    const result = await archiveFn("https://example.com/article");
    assert.ok(result.archive_url?.includes("web.archive.org"));
    assert.equal(result.retry, false);
  });
});

/* ──────────────────────── LiveSource med mockade anrop ── */

describe("LiveSource med mock-HTTP", () => {
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
        return new Response("User-agent: DrygastBot/1.0\nDisallow: /\n", { status: 200 });
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

  test("hanterar 304 Not Modified (ETag-cache)", async () => {
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
    assert.equal(articles.length, 0, "304 = inga nya artiklar");
    assert.equal(callCount, 1, "En request för feeden");
  });

  test("respekterar max_articles_per_run", async () => {
    const rssXml = readFixture("party-rss.xml");

    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) {
        return new Response("User-agent: *\nAllow: /", { status: 200 });
      }
      return new Response(rssXml, { status: 200 });
    };

    const source = new LiveSource({
      feeds: [{ id: "test", type: "rss", url: "https://testpartiet.se/feed/" }],
      limits: { max_articles_per_run: 1, min_chars: 10 },
      httpFetch: mockFetch,
    });

    const articles = await source.fetch();
    assert.ok(articles.length <= 1, `Max 1 artikel: ${articles.length}`);
  });

  test("skickar User-Agent och ETag-headers", async () => {
    const rssXml = readFixture("party-rss.xml");
    const receivedHeaders: Record<string, string> = {};

    const mockFetch: HttpFetchFn = async (url, init) => {
      if (url.includes("robots.txt")) {
        return new Response("User-agent: *\nAllow: /", { status: 200 });
      }
      const h = init?.headers as Record<string, string> | undefined;
      if (h) {
        for (const [k, v] of Object.entries(h)) {
          receivedHeaders[k] = v;
        }
      }
      return new Response(rssXml, { status: 200, headers: { etag: '"test-etag"' } });
    };

    const source = new LiveSource({
      feeds: [{ id: "test", type: "rss", url: "https://testpartiet.se/feed/" }],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
    });

    await source.fetch();
    assert.equal(receivedHeaders["User-Agent"], "DrygastBot/1.0 (+https://drygast.nu/om)");
  });

  test("hämtar page-källa (HTML-sida) via mock", async () => {
    const html =
      "<html><head><title>Centerpartiets valmanifest 2026</title></head>" +
      "<body><h1>Vår politik</h1><p>Vi lovar att korta köerna i vården och " +
      "anställa fler poliser under nästa mandatperiod.</p></body></html>";

    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) {
        return new Response("User-agent: *\nAllow: /", { status: 200 });
      }
      if (url.includes("val2026.centerpartiet.se")) {
        return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response("Not found", { status: 404 });
    };

    const source = new LiveSource({
      feeds: [{ id: "c-valmanifest", type: "page", url: "https://val2026.centerpartiet.se/" }],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
    });

    const articles = await source.fetch();
    assert.equal(articles.length, 1, "Page-källa ger exakt en artikel");
    assert.equal(articles[0]!.url, "https://val2026.centerpartiet.se/");
    assert.equal(articles[0]!.domain, "val2026.centerpartiet.se");
    assert.equal(articles[0]!.title, "Centerpartiets valmanifest 2026", "Title ur <title>");
    assert.ok(articles[0]!.text.includes("korta köerna i vården"), `Text: ${articles[0]!.text}`);
    assert.ok(!articles[0]!.text.includes("<"), "HTML-taggar strippade");
  });

  test("page-källa avkodar HTML-entiteter så G3 verbatim matchar", async () => {
    // mp.se serverar &ouml;/&auml;/&aring; i stället för ö/ä/å. Utan avkodning
    // blir verbatim-grinden (G3) 0/5 fastän löftet finns på sidan.
    const html =
      "<html><head><title>Almedalstal</title></head><body>" +
      "<p>Vi lovar ett systemskifte i t&aring;gpolitiken och att korta k&ouml;erna.</p>" +
      "</body></html>";

    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) {
        return new Response("User-agent: *\nAllow: /", { status: 200 });
      }
      return new Response(html, { status: 200 });
    };

    const source = new LiveSource({
      feeds: [{ id: "mp-almedalstal", type: "page", url: "https://www.mp.se/just-nu/daniel-helldens-almedalstal/" }],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
    });

    const articles = await source.fetch();
    assert.equal(articles.length, 1);
    assert.ok(
      articles[0]!.text.includes("systemskifte i tågpolitiken"),
      `å avkodad: ${articles[0]!.text}`,
    );
    assert.ok(articles[0]!.text.includes("korta köerna"), "ö avkodad");
    assert.ok(!articles[0]!.text.includes("&aring;"), "inga råa entiteter kvar");
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
