/**
 * sitemapLinks — den symmetriska vägen in till partiernas politiksidor.
 *
 * Proven mäter de tre saker som faktiskt skiljer partiernas sitemaps åt:
 * register som pekar på register, lokalavdelningar som ligger under samma
 * domän som rikspolitiken, och skräp som inte är sidor.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_SITEMAP_DELAR, sitemapLinks } from "../src/fetch.ts";

const karta = (...urler: string[]): string =>
  `<?xml version="1.0"?><urlset>${urler.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;

const register = (...urler: string[]): string =>
  `<?xml version="1.0"?><sitemapindex>${urler.map((u) => `<sitemap><loc>${u}</loc></sitemap>`).join("")}</sitemapindex>`;

test("plockar sidorna ur en vanlig sitemap", () => {
  const ut = sitemapLinks(
    karta("https://moderaterna.se/var-politik/a-kassa", "https://moderaterna.se/var-politik/skatt"),
  );
  assert.equal(ut.index, false);
  assert.deepEqual(ut.urls, [
    "https://moderaterna.se/var-politik/a-kassa",
    "https://moderaterna.se/var-politik/skatt",
  ]);
});

test("ett register känns igen och filtreras INTE mot artikelmönstret", () => {
  // Mönstret matchar ingen sitemap-adress. Filtrerades registret bort här
  // skulle vi aldrig hitta fram till delregistren, och källan gav noll sidor.
  const ut = sitemapLinks(
    register("https://www.mp.se/sitemap-1.xml", "https://www.mp.se/sitemap-2.xml"),
    "^https://www\\.mp\\.se/politik/",
  );
  assert.equal(ut.index, true);
  assert.equal(ut.urls.length, 2);
});

test("DET SOM SKILJER RIKSPOLITIK FRÅN LOKALT: mönstret prövas mot hela adressen", () => {
  // MP:s sitemap har 4 116 träffar på "/politik/" men 98 på rikspolitiken —
  // resten är lokalavdelningarnas sidor under samma domän. Ett mönster mot
  // enbart sökvägen kan inte skilja dem åt.
  const ut = sitemapLinks(
    karta(
      "https://www.mp.se/politik/klimat",
      "https://www.mp.se/ale/politik/48135-2",
      "https://www.mp.se/gotlands-lan/politik/nagot",
    ),
    "^https://www\\.mp\\.se/politik/",
  );
  assert.deepEqual(ut.urls, ["https://www.mp.se/politik/klimat"]);
});

test("gamla valrörelser hålls ute när mönstret säger till", () => {
  // V:s sitemap bär kvar euval2024/politik. Det är inte 2026 års politik.
  const ut = sitemapLinks(
    karta(
      "https://www.vansterpartiet.se/var-politik/klimatmalen-till-2030",
      "https://www.vansterpartiet.se/euval2024/politik/abort-och-srhr",
    ),
    "^https://www\\.vansterpartiet\\.se/var-politik/",
  );
  assert.deepEqual(ut.urls, ["https://www.vansterpartiet.se/var-politik/klimatmalen-till-2030"]);
});

test("filer som inte är sidor tas bort", () => {
  const ut = sitemapLinks(
    karta(
      "https://sd.se/vad-vi-vill/tandvard",
      "https://sd.se/vad-vi-vill/rapport.pdf",
      "https://sd.se/bild.jpg",
      "https://sd.se/sitemap-2.xml",
    ),
  );
  assert.deepEqual(ut.urls, ["https://sd.se/vad-vi-vill/tandvard"]);
});

test("http slängs — bara https hämtas", () => {
  const ut = sitemapLinks(karta("http://sd.se/vad-vi-vill/x", "https://sd.se/vad-vi-vill/y"));
  assert.deepEqual(ut.urls, ["https://sd.se/vad-vi-vill/y"]);
});

test("dubbletter räknas en gång", () => {
  const ut = sitemapLinks(karta("https://sd.se/a", "https://sd.se/a", "https://sd.se/a#topp"));
  assert.deepEqual(ut.urls, ["https://sd.se/a"]);
});

test("taket kapar, och det som kapas är slutet av bokstavsordningen", () => {
  const ut = sitemapLinks(
    karta("https://sd.se/c", "https://sd.se/a", "https://sd.se/b"),
    undefined,
    2,
  );
  assert.deepEqual(ut.urls, ["https://sd.se/a", "https://sd.se/b"]);
});

test("registret har ett eget tak, skilt från sidtaket", () => {
  const manga = Array.from({ length: 40 }, (_, i) => `https://www.mp.se/sitemap-${i}.xml`);
  const ut = sitemapLinks(register(...manga), undefined, 2);
  assert.equal(ut.index, true);
  assert.equal(ut.urls.length, MAX_SITEMAP_DELAR, "sidtaket 2 ska inte strypa delregistren");
});

test("ett ogiltigt mönster ger noll sidor — inte alla sidor", () => {
  const ut = sitemapLinks(karta("https://sd.se/a"), "([ogiltigt");
  assert.deepEqual(ut.urls, []);
});

test("tom eller trasig sitemap ger noll sidor", () => {
  assert.deepEqual(sitemapLinks("").urls, []);
  assert.deepEqual(sitemapLinks("<html>inte en sitemap</html>").urls, []);
});
