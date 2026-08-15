import { test } from "node:test";
import assert from "node:assert/strict";
import { alderIDagar, sidansAlder, svensktDatum } from "../src/kallans-alder.ts";

/**
 * Markupen nedan är klippt ur partiernas riktiga sidor 2026-08-14, inte
 * skriven efter vad koden råkar leta efter. En fixtur som är uppfunnen ur
 * samma antagande som mönstret bekräftar bara antagandet.
 */

/** kristdemokraterna.se/var-politik/politik-a-till-o/migration */
const KD_MIGRATION = `<h2 class="sr-only">Sidinformation</h2>
<div class="page-information app-1bo0mbg"><dl class="app-1bo0mbg"><div class="app-1bo0mbg"><dt class="app-1bo0mbg">Senast uppdaterad:</dt>
      <dd class="app-1bo0mbg">4 juli 2022</dd></div></dl>
  <button onclick="window.print()" class="app-1bo0mbg">Skriv ut</button></div>`;

/** moderaterna.se/var-politik/ekonomisk-politik-och-foretagande/ */
const M_EKONOMI = `<meta property="article:modified_time" content="2026-08-05T12:02:08+00:00" />
<script type="application/ld+json">{"datePublished":"2026-01-02T10:56:43+00:00","dateModified":"2026-08-05T12:02:08+00:00"}</script>`;

/** mp.se/just-nu/daniel-helldens-almedalstal/ */
const MP_TAL = `<time datetime="2026-06-26T11:43:32+02:00" aria-label="Publicerad">Publicerad 2026-06-26</time>
<time class="updated" datetime="2026-06-26T11:43:33+02:00" aria-label="Uppdaterad">Uppdaterad 2026-06-26</time>`;

test("svensktDatum läser sidinformationens klartext, och bara den", () => {
  assert.equal(svensktDatum("4 juli 2022"), "2022-07-04");
  assert.equal(svensktDatum(" 26 december 2024 "), "2024-12-26");
  assert.equal(svensktDatum("21 mars 2025"), "2025-03-21");
  // Former vi inte känner igen gissas aldrig — en sida utan läsbart datum
  // ska räknas som utan datum, inte som färsk.
  assert.equal(svensktDatum("juli 2022"), null);
  assert.equal(svensktDatum("4 julii 2022"), null);
  assert.equal(svensktDatum("2022-07-04"), null);
});

test("sidansAlder läser den synliga raden när sidan har en", () => {
  assert.deepEqual(sidansAlder(KD_MIGRATION), { datum: "2022-07-04", kalla: "senast-uppdaterad" });
});

test("sidansAlder läser metadatan när den synliga raden saknas", () => {
  assert.deepEqual(sidansAlder(M_EKONOMI), { datum: "2026-08-05", kalla: "article:modified_time" });
  assert.deepEqual(sidansAlder(MP_TAL), { datum: "2026-06-26", kalla: "time-updated" });
  assert.deepEqual(
    sidansAlder('<script>{"dateModified":"2023-11-02T08:00:00Z"}</script>'),
    { datum: "2023-11-02", kalla: "dateModified" },
  );
});

test("den synliga raden går före metadatan", () => {
  // Ser läsaren 2022 är det sidans besked om sin egen ålder. Ett CMS-fält som
  // säger något annat beskriver när någon rörde mallen.
  const bada = `${KD_MIGRATION}\n${M_EKONOMI}`;
  assert.deepEqual(sidansAlder(bada), { datum: "2022-07-04", kalla: "senast-uppdaterad" });
});

test("en sida utan datum svarar null i stället för att gissa", () => {
  assert.equal(sidansAlder("<html><body><h1>Vår politik</h1></body></html>"), null);
  // En synlig rad vars datum inte går att läsa faller inte tillbaka på
  // metadatan i tysthet — den letar vidare, och hittar den inget blir svaret
  // null. Här finns ingen metadata att hitta.
  assert.equal(sidansAlder('<dt>Senast uppdaterad:</dt><dd>i somras</dd>'), null);
});

test("alderIDagar räknar åt båda hållen", () => {
  assert.equal(alderIDagar("2022-07-04", "2026-08-13"), 1501);
  assert.equal(alderIDagar("2026-08-13", "2026-08-13"), 0);
  assert.equal(alderIDagar("2026-08-14", "2026-08-13"), -1);
});
