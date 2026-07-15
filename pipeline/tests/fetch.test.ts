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
  seenKey,
  findManifestPdfLinks,
  joinPdfLines,
  parsePdfDate,
  looksLikePdf,
  PDF_PAGES_PER_CHUNK,
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

  test("kapar INTE på fetch-nivå — budgeten ligger i runPipeline (maxNewArticles)", async () => {
    // Den gamla globala slice(0, max) på fetch-nivå svalt feeds sent i listan
    // (page-källorna = manifesten) innan dedup ens såg dem. LiveSource ska
    // returnera ALLT; processbudgeten på NYA artiklar tillämpas i runPipeline.
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
    assert.ok(articles.length > 1, `Alla feedens artiklar returneras: ${articles.length}`);
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

  test("stripHtml tar bort script/style/noscript-INNEHÅLL och kommentarer", () => {
    const html =
      "<html><head><style>.a{color:red}</style><script>var nonce='x9f2';</script></head>" +
      "<body><!-- byggd 2026-07-03 --><p>Vi lovar fler poliser.</p>" +
      "<noscript>Aktivera JS</noscript></body></html>";
    const text = stripHtml(html);
    assert.ok(text.includes("Vi lovar fler poliser."));
    assert.ok(!text.includes("nonce"), "inline-skript borta (annars instabil contentHash + LLM-brus)");
    assert.ok(!text.includes("color"), "style-innehåll borta");
    assert.ok(!text.includes("Aktivera JS"), "noscript borta");
    assert.ok(!text.includes("byggd 2026"), "HTML-kommentarer borta");
  });

  test("seenKey: page med nytt innehåll får ny nyckel, oförändrad samma", () => {
    const v1 = { url: "https://x.se/manifest/", contentHash: sha256("text v1") };
    const v2 = { url: "https://x.se/manifest/", contentHash: sha256("text v2") };
    const rss = { url: "https://x.se/manifest/" };
    assert.equal(seenKey(v1), seenKey({ ...v1 }), "samma innehåll ⇒ samma nyckel");
    assert.notEqual(seenKey(v1), seenKey(v2), "ändrat innehåll ⇒ ny nyckel ⇒ omprocessas");
    assert.equal(seenKey(rss), sha256(rss.url), "utan contentHash: som förut (RSS/API)");
  });

  test("page-källa hämtar PDF-manifest: text, dehyphenering, metadata", async () => {
    // Centerpartiets valmanifest 2026 finns bara som PDF — page-källan måste
    // auto-detektera och textextrahera den, annars faller hela dokumentet bort.
    const pdfBytes = readFileSync(join(import.meta.dirname, "..", "fixtures", "pdf", "manifest-2p.pdf"));

    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) {
        return new Response("User-agent: *\nAllow: /", { status: 200 });
      }
      return new Response(new Uint8Array(pdfBytes), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      });
    };

    const source = new LiveSource({
      feeds: [{
        id: "c-valmanifest-pdf",
        type: "page",
        url: "https://val2026.centerpartiet.se/wp-content/uploads/2026/06/Valmanifest-2026.pdf",
      }],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
    });

    const articles = await source.fetch();
    assert.equal(articles.length, 1, "2 sidor ≤ chunkstorleken ⇒ EN artikel");
    const a = articles[0]!;
    assert.equal(a.url, "https://val2026.centerpartiet.se/wp-content/uploads/2026/06/Valmanifest-2026.pdf", "en chunk ⇒ url utan #page-ankare");
    assert.equal(a.domain, "val2026.centerpartiet.se");
    assert.equal(a.title, "Valmanifest Testpartiet 2026", "Title ur PDF-metadata");
    assert.equal(a.published, "2026-06-04T12:00:00.000Z", "published ur CreationDate");
    assert.ok(
      a.text.includes("anställa fler poliser i hela landet"),
      `radslutsavstavning ihopsydd (po- + liser) och åäö avkodade: ${a.text}`,
    );
    assert.ok(a.text.includes("Sida två handlar om skatter"), "sida 2 med i texten");
  });

  test("PDF över chunkstorleken delas i #page-ankrade artiklar", async () => {
    const pdfBytes = readFileSync(join(import.meta.dirname, "..", "fixtures", "pdf", "manifest-12p.pdf"));

    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) {
        return new Response("User-agent: *\nAllow: /", { status: 200 });
      }
      // Utan content-type-header — %PDF-signaturen ska räcka för detektion.
      return new Response(new Uint8Array(pdfBytes), { status: 200 });
    };

    const source = new LiveSource({
      feeds: [{ id: "stort-manifest", type: "page", url: "https://sd.se/manifest.pdf" }],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
    });

    const articles = await source.fetch();
    assert.equal(articles.length, 2, `12 sidor / ${PDF_PAGES_PER_CHUNK} per chunk = 2 artiklar`);
    assert.equal(articles[0]!.url, "https://sd.se/manifest.pdf#page=1");
    assert.equal(articles[1]!.url, "https://sd.se/manifest.pdf#page=11");
    assert.equal(articles[0]!.title, "Stort manifest (s. 1–10)");
    assert.equal(articles[1]!.title, "Stort manifest (s. 11–12)");
    assert.ok(articles[0]!.text.includes("Löfte nummer 10"), "chunk 1 t.o.m. sida 10");
    assert.ok(!articles[0]!.text.includes("Löfte nummer 11"), "sida 11 hör till chunk 2");
    assert.ok(articles[1]!.text.includes("Löfte nummer 12"), "chunk 2 t.o.m. sista sidan");
    assert.notEqual(sha256(articles[0]!.url), sha256(articles[1]!.url), "chunk-url:er dedupas separat");
    // pdfPages bär per-sidtext så publiceringen kan slå upp citatets exakta sida.
    assert.equal(articles[0]!.pdfPages?.firstPage, 1);
    assert.equal(articles[0]!.pdfPages?.texts.length, 10, "chunk 1 = 10 sidor");
    assert.equal(articles[1]!.pdfPages?.firstPage, 11);
    assert.equal(articles[1]!.pdfPages?.texts.length, 2, "chunk 2 = 2 sidor");
    assert.ok(articles[1]!.pdfPages?.texts[1]!.includes("Löfte nummer 12"), "sida 12 är sista i chunk 2");
  });

  test("findManifestPdfLinks: samma domän, .pdf + manifestnyckelord, relativa löses", () => {
    const html =
      '<a href="/download/18.abc/1771599906618/Valplattform.pdf">Ladda ner</a>' +
      '<a href="https://www.testpartiet.se/wp-content/valmanifest-2026.pdf">Manifest</a>' +
      '<a href="https://annandoman.se/valmanifest.pdf">Extern</a>' +
      '<a href="/appresource/manifest.webmanifest">PWA</a>' +
      '<a href="/rapporter/arsredovisning.pdf">Årsredovisning</a>';
    const links = findManifestPdfLinks(html, "https://testpartiet.se/val-2026");
    assert.deepEqual(links, [
      "https://testpartiet.se/download/18.abc/1771599906618/Valplattform.pdf",
      "https://www.testpartiet.se/wp-content/valmanifest-2026.pdf",
    ], "relativ löst mot basen; extern domän, webmanifest och omatchad PDF exkluderade");
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
