/**
 * Citatgrindens kontrakt — BYTE-IDENTISK KOPIA I TVÅ REPON.
 *
 * Den här filen ska vara exakt likadan i `valflask` och `handlingsvagen`:
 *
 *     diff valflask/pipeline/tests/citatgrind.test.ts \
 *          handlingsvagen/pipeline/tests/citatgrind.test.ts
 *
 * Utfallet ska vara tomt. Bara importvägen skiljer sig, och den är gömd bakom
 * `src/citatgrind.ts` i respektive repo just för att den här filen ska kunna
 * vara identisk.
 *
 * VARFÖR: `normalizeForVerbatim` är regeln som avgör om ett citat räknas som
 * återgivet ord för ord, och den finns i två oberoende kopior — `gates.ts` i
 * valflask, `grindar.ts` i handlingsvagen. Skärper någon den ena (säg för ett
 * nytt sätt att gömma tecken i en text) och glömmer den andra, får vågarna
 * tysta olika krav: Handlingsvågen godtar ett citat som Fläskvågen hade
 * avvisat. Ingen befintlig grind fäller på det, och ingen läsare kan se det.
 *
 * Testet nedan spikar utfallet tecken för tecken och lägger ett fingeravtryck
 * över hela tabellen. Varje ändring av beteendet fäller därför HÖGT, i det
 * repo där ändringen görs — och den som uppdaterar fingeravtrycket tvingas
 * göra samma ändring i systerrepot för att `diff` ska bli tom igen.
 *
 * Ändra ALDRIG förväntad utdata för att få testet grönt. Kärnprincipen är att
 * citatgrindarna aldrig lossas; utfallet här ska bara ändras när grinden
 * medvetet skärps, och då i båda repon i samma omgång.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { normalizeForVerbatim } from "../src/citatgrind.ts";

/**
 * [inmatning, förväntad utdata]. Inmatningen skrivs med rymningssekvenser —
 * tecknen är osynliga i en editor, och en kopiering får aldrig tappa dem.
 */
const FALL: ReadonlyArray<readonly [string, string]> = [
  // Mjukt bindestreck mitt i ett ord: ser ut som "försvaret", är det inte.
  ["för­svaret ska stärkas", "försvaret ska stärkas"],
  // Nollbreddstecken (space, non-joiner, joiner) — klassiskt sätt att bryta
  // ett ord så en ordagrann jämförelse missar det.
  ["kärn​kraft‌en byggs ‍ut", "kärnkraften byggs ut"],
  // BOM och word joiner-serien.
  ["﻿skatt⁠en s⁤änks", "skatten sänks"],
  // Bidi-styrning: kan vända läsordningen så texten visar något annat än den är.
  ["‮höjas‬ ⁦nu⁩", "höjas nu"],
  // Mongoliskt vokalavskiljare — osynlig, ovanlig, ska ändå bort.
  ["vård᠎garanti", "vårdgaranti"],
  // Typografiska dubbelcitattecken → raka.
  ["”vi lovar att hålla”", '"vi lovar att hålla"'],
  // Enkla citattecken, prim och lågt/högt enkelcitat → rak apostrof.
  ["‘delvis’ ′ ‚vi‛", "'delvis' ' 'vi'"],
  // Vinkelcitattecken och dubbelprim → raka dubbelcitattecken.
  ["«citat» ″dubbel″", '"citat" "dubbel"'],
  // Streckvarianter: en tankstreck-intervall ska inte skilja sig från ett
  // bindestreck när citatet jämförs.
  [
    "2026–2030 — nu − 5 ‐ tal",
    "2026-2030 - nu - 5 - tal",
  ],
  // Ellipsis-tecknet → tre punkter, så en avkortning skrivs likadant överallt.
  ["och… sedan…", "och... sedan..."],
  // Hårt mellanslag, smalt hårt mellanslag och radbrytning → ett blanksteg.
  [
    "två ord med luft\noch  rad\tbryt  ",
    "två ord med luft och rad bryt",
  ],
  // NFC: "a" + kombinerande trema ska bli samma tecken som ett skrivet "ä",
  // annars är två visuellt identiska citat olika strängar.
  ["ändrat", "ändrat"],
  // Tomt och bara luft ska bli tomt, inte kasta.
  ["", ""],
  ["   ", ""],
];

/**
 * Fingeravtryck över hela tabellen (inmatning + utdata). Ändras grinden
 * ändras det här, och då ska det ändras i BÅDA repon.
 */
const FINGERAVTRYCK = "ff6628547e7ba295";

test("citatnormaliseringen ger exakt det spikade utfallet", () => {
  for (const [inmatning, forvantat] of FALL) {
    assert.equal(
      normalizeForVerbatim(inmatning),
      forvantat,
      `citatgrinden ändrad för ${JSON.stringify(inmatning)} — lossa den inte för att få testet grönt`,
    );
  }
});

test("citatnormaliseringen är oförändrad sedan fingeravtrycket sattes", () => {
  const tabell = FALL.map((f) => [f[0], normalizeForVerbatim(f[0])]);
  const nu = createHash("sha256")
    .update(JSON.stringify(tabell))
    .digest("hex")
    .slice(0, 16);
  assert.equal(
    nu,
    FINGERAVTRYCK,
    `Citatgrinden har ändrats (${nu} ≠ ${FINGERAVTRYCK}).\n` +
      "Är ändringen avsedd: gör den i BÅDA repon, uppdatera fingeravtrycket i båda,\n" +
      "och kontrollera att diff mellan de två testfilerna är tom igen.",
  );
});

test("normaliseringen är idempotent — en gång eller två ger samma sträng", () => {
  // Annars kan ett citat som passerat grinden en gång falla nästa gång det
  // normaliseras, t.ex. vid en omvalidering eller en arkivkontroll.
  for (const [inmatning] of FALL) {
    const en = normalizeForVerbatim(inmatning);
    assert.equal(normalizeForVerbatim(en), en, `inte idempotent för ${JSON.stringify(inmatning)}`);
  }
});
