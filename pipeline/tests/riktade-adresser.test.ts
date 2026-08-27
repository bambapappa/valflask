/**
 * SKORD_URLAR — riktad körning mot exakta adresser.
 *
 * Finns för svansen. När en katalog är läst så när som på en handfull sidor är
 * det slöseri att gå igenom hela källan för deras skull: budgeten går åt till
 * sidor vi redan har, och svansen hinns aldrig med.
 *
 * Det avgörande är VAR filtret sitter. Skärs adresserna bort först efter
 * hämtningen har vi läst hela katalogen ändå — riktningen blir en efterhandsk
 * bortsortering, inte en besparing. Proven nedan mäter därför hämtningarna,
 * inte bara resultatet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LiveSource, type HttpFetchFn } from "../src/fetch.ts";

const BAS = "https://www.liberalerna.se";

/** Nog med text för att passera min_chars. */
const brodtext = (vad: string): string =>
  `<p>${vad}. ${"Liberalerna vill se en politik för frihet och ansvar. ".repeat(20)}</p>`;

const SIDOR = ["jakt", "klimatet", "vuxenutbildning", "yttrandefrihet"];

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?><urlset>` +
  SIDOR.map((s) => `<url><loc>${BAS}/politik/${s}</loc></url>`).join("") +
  `</urlset>`;

/** Varje hämtad adress bokförs, så proven kan mäta vad som FAKTISKT hämtades. */
function harness() {
  const hamtade: string[] = [];
  const httpFetch: HttpFetchFn = async (url) => {
    if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
    if (url.endsWith("/sitemap.xml")) {
      return new Response(sitemap, {
        status: 200,
        headers: { "content-type": "application/xml" },
      });
    }
    hamtade.push(url);
    const namn = url.split("/").pop() ?? "";
    if (!SIDOR.includes(namn)) return new Response("", { status: 404 });
    return new Response(
      `<html><head><title>${namn}</title></head><body>${brodtext(namn)}</body></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );
  };
  return { hamtade, httpFetch };
}

function kalla(httpFetch: HttpFetchFn, urlar?: readonly string[]) {
  return new LiveSource({
    feeds: [
      {
        id: "l-politik-sitemap",
        type: "sitemap",
        url: `${BAS}/sitemap.xml`,
        article_pattern: "^https://www\\.liberalerna\\.se/politik/",
      },
    ],
    limits: { max_articles_per_run: 100, min_chars: 400 },
    httpFetch,
    ...(urlar ? { urlar } : {}),
  });
}

test("utan urlar hämtas hela katalogen, som förut", async () => {
  const { hamtade, httpFetch } = harness();
  const ut = await kalla(httpFetch).fetch();
  assert.equal(ut.length, 4);
  assert.equal(hamtade.length, 4);
});

test("riktad körning hämtar BARA de utpekade sidorna", async () => {
  const { hamtade, httpFetch } = harness();
  const ut = await kalla(httpFetch, [
    `${BAS}/politik/vuxenutbildning`,
    `${BAS}/politik/yttrandefrihet`,
  ]).fetch();

  assert.deepEqual(
    ut.map((a) => a.url).sort(),
    [`${BAS}/politik/vuxenutbildning`, `${BAS}/politik/yttrandefrihet`],
  );
  // Kärnan i hela funktionen: de två andra sidorna ska aldrig ha rörts.
  assert.deepEqual(
    hamtade.sort(),
    [`${BAS}/politik/vuxenutbildning`, `${BAS}/politik/yttrandefrihet`],
    "en riktad körning får inte hämta sidor den ändå tänker kasta",
  );
});

test("avslutande snedstreck skiljer inte två skrivningar av samma sida åt", async () => {
  // Katalogen och våra egna listor är oense om snedstrecket. Utan utjämning
  // matchar urvalet ingenting, och körningen rapporterar sig klar med tom skörd.
  const { hamtade, httpFetch } = harness();
  const ut = await kalla(httpFetch, [`${BAS}/politik/jakt/`]).fetch();
  assert.deepEqual(ut.map((a) => a.url), [`${BAS}/politik/jakt`]);
  assert.deepEqual(hamtade, [`${BAS}/politik/jakt`]);
});

test("en adress utanför katalogen ger tom skörd utan att hämta något", async () => {
  const { hamtade, httpFetch } = harness();
  const ut = await kalla(httpFetch, [`${BAS}/politik/finns-inte`]).fetch();
  assert.deepEqual(ut, []);
  assert.deepEqual(hamtade, [], "mönstret gäller fortfarande — filtret öppnar inga nya dörrar");
});
