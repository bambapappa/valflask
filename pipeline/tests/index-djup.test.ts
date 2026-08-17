/**
 * follow_depth: 2 — katalogen i två våningar.
 *
 * Socialdemokraterna har ingen sitemap (SiteVision svarar 404) och deras A–Ö
 * ligger i två steg: `/var-politik` listar fjorton ämnesområden, och de
 * enskilda ståndpunkterna en nivå in. Nivå ett ensam ger fjorton sidor, nivå
 * ett plus två ger 121. Utan det andra steget är S det sämst täckta partiet
 * kvar efter att alla andra fått sin väg in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LiveSource, type HttpFetchFn } from "../src/fetch.ts";

const BAS = "https://www.socialdemokraterna.se";

/** Nog med text för att passera min_chars. */
const brodtext = (vad: string): string =>
  `<p>${vad}. ${"Vi vill se en politik som håller ihop Sverige. ".repeat(20)}</p>`;

const sidor: Record<string, string> = {
  [`${BAS}/var-politik`]:
    `<a href="/var-politik/a-till-o/ekonomi">Ekonomi</a>
     <a href="/var-politik/a-till-o/energi">Energi</a>
     ${brodtext("Vår politik")}`,
  [`${BAS}/var-politik/a-till-o/ekonomi`]:
    `<a href="/var-politik/a-till-o/ekonomi/banker">Banker</a>
     <a href="/var-politik/a-till-o/ekonomi/skatt">Skatt</a>
     ${brodtext("Ekonomi")}`,
  [`${BAS}/var-politik/a-till-o/energi`]: brodtext("Energi"),
  [`${BAS}/var-politik/a-till-o/ekonomi/banker`]: brodtext("Banker"),
  [`${BAS}/var-politik/a-till-o/ekonomi/skatt`]: brodtext("Skatt"),
};

const httpFetch: HttpFetchFn = async (url) => {
  if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
  const html = sidor[url.replace(/\/$/u, "")];
  if (html === undefined) return new Response("", { status: 404 });
  return new Response(`<html><head><title>${url}</title></head><body>${html}</body></html>`, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
};

function kalla(follow_depth: 1 | 2) {
  return new LiveSource({
    feeds: [
      {
        id: "s-politik-index",
        type: "index",
        url: `${BAS}/var-politik`,
        article_pattern: "^/var-politik/a-till-o/",
        follow_depth,
        max_articles: 200,
      },
    ],
    limits: { max_articles_per_run: 100, min_chars: 400 },
    httpFetch,
    cacheDir: null,
  });
}

test("FELET SOM VAR: en våning ser bara ämnesområdena", async () => {
  const ut = await kalla(1).fetch();
  const adresser = ut.map((a) => a.url).sort();
  assert.deepEqual(adresser, [
    `${BAS}/var-politik/a-till-o/ekonomi`,
    `${BAS}/var-politik/a-till-o/energi`,
  ]);
});

test("två våningar når ståndpunkterna en nivå in", async () => {
  const ut = await kalla(2).fetch();
  const adresser = ut.map((a) => a.url).sort();
  assert.deepEqual(adresser, [
    `${BAS}/var-politik/a-till-o/ekonomi`,
    `${BAS}/var-politik/a-till-o/ekonomi/banker`,
    `${BAS}/var-politik/a-till-o/ekonomi/skatt`,
    `${BAS}/var-politik/a-till-o/energi`,
  ]);
});

test("mellannivån hämtas som artikel den också, inte bara som länklista", async () => {
  const ut = await kalla(2).fetch();
  const ekonomi = ut.find((a) => a.url.endsWith("/ekonomi"));
  assert.ok(ekonomi, "områdessidan ska finnas bland artiklarna");
  assert.ok(
    ekonomi.text.includes("Ekonomi"),
    "hos S bär en områdessida 6 000 tecken egen text — den ska inte kastas",
  );
});

test("mönstret gäller i båda våningarna", async () => {
  // Ingen av de följda adresserna får ligga utanför artikelmönstret.
  const ut = await kalla(2).fetch();
  assert.ok(
    ut.every((a) => a.url.includes("/var-politik/a-till-o/")),
    `följningen drog in något utanför mönstret: ${ut.map((a) => a.url).join(", ")}`,
  );
});

test("taket håller även när andra våningen öppnar fler sidor", async () => {
  const source = new LiveSource({
    feeds: [
      {
        id: "s-politik-index",
        type: "index",
        url: `${BAS}/var-politik`,
        article_pattern: "^/var-politik/a-till-o/",
        follow_depth: 2,
        max_articles: 3,
      },
    ],
    limits: { max_articles_per_run: 100, min_chars: 400 },
    httpFetch,
    cacheDir: null,
  });
  const ut = await source.fetch();
  assert.ok(ut.length <= 3, `taket 3 överskreds: ${ut.length} sidor`);
});

test("utan follow_depth är beteendet oförändrat", async () => {
  // Nyhetslistorna får inte börja krypa ett steg till av misstag.
  const source = new LiveSource({
    feeds: [
      {
        id: "utan-djup",
        type: "index",
        url: `${BAS}/var-politik`,
        article_pattern: "^/var-politik/a-till-o/",
        max_articles: 200,
      },
    ],
    limits: { max_articles_per_run: 100, min_chars: 400 },
    httpFetch,
    cacheDir: null,
  });
  assert.equal((await source.fetch()).length, 2);
});
