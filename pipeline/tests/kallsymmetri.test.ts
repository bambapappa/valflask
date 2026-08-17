/**
 * Symmetrigrinden: varje riksdagsparti ska ha en väg in till sin politik.
 *
 * BAKGRUNDEN (2026-08-17). Ett tidigare beslut sa att listorna över partiernas
 * officiella politiksidor skulle vara SYMMETRISKA. Det skrevs ner och byggdes
 * aldrig. Under tiden fick KD sin A–Ö-katalog registrerad som en genomsökt
 * källa medan alla andra partier hade en enda politiksida — och ingen grind
 * såg skillnaden.
 *
 * Vad det kostade, mätt samma dag: 232 av 801 publicerade löften var KD:s mot
 * 42 för SD, 270 lästa sidor hos KD mot 22 hos SD, och av de 212 senast
 * tillagda löftena var 193 KD:s. Talet mätte inte partierna utan oss.
 *
 * Samma lärdom som ordreglerna i CLAUDE.md bär: en regel utan grind är en
 * påminnelse, och påminnelser åldras. Det här är grinden.
 *
 * VAD PROVET INTE KRÄVER. Inte lika många sidor per parti — hur mycket ett
 * parti skriver ut är partiets eget val, och SD:s "Vad vi vill" ÄR sex sidor.
 * Kravet är att varje parti har minst en väg in till sin politik, så att
 * skillnaden i täckning speglar vad partierna publicerat och inte vilka
 * sajter vi råkat registrera.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { SourceConfig } from "../src/fetch.ts";
import { partiForUrl } from "../src/skordeordning.ts";

const RIKSDAGSPARTIER = ["s", "m", "sd", "c", "v", "kd", "l", "mp"] as const;

/** Källslag som hämtar politik. RSS är nyheter — en annan sorts täckning. */
const POLITIKSLAG = new Set(["page", "index", "sitemap"]);

function kallor(): SourceConfig {
  const sokvag = resolve(import.meta.dirname, "../../data/sources.yaml");
  return parseYaml(readFileSync(sokvag, "utf8")) as SourceConfig;
}

/** Partikoder → antal registrerade politikkällor. */
function politikkallorPerParti(config: SourceConfig): Map<string, number> {
  const tal = new Map<string, number>(RIKSDAGSPARTIER.map((p) => [p, 0]));
  for (const feed of config.feeds) {
    if (!POLITIKSLAG.has(feed.type)) continue;
    const parti = partiForUrl(feed.url);
    if (parti === null) continue;
    tal.set(parti, (tal.get(parti) ?? 0) + 1);
  }
  return tal;
}

test("varje riksdagsparti har minst en registrerad politikkälla", () => {
  const tal = politikkallorPerParti(kallor());
  const utan = RIKSDAGSPARTIER.filter((p) => (tal.get(p) ?? 0) === 0);
  assert.deepEqual(
    utan,
    [],
    `dessa partier saknar väg in till sin politik: ${utan.join(", ")}. ` +
      "Ett parti utan politikkälla blir underskördat, och antalet löften " +
      "på sajten mäter då vår registrering och inte partiet.",
  );
});

test("inget parti har en katalogkälla medan ett annat saknar det", () => {
  // Det var exakt den här skillnaden som uppstod: KD fick sin A–Ö som
  // genomsökt katalog, alla andra hade en enda sida. En katalogkälla ger
  // hundratals sidor, en enkelsida ger en.
  const config = kallor();
  const katalog = new Set<string>();
  for (const feed of config.feeds) {
    if (feed.type !== "sitemap" && !(feed.type === "index" && feed.max_articles)) continue;
    const parti = partiForUrl(feed.url);
    if (parti) katalog.add(parti);
  }
  // Har NÅGOT parti en katalog ska frågan vara ställd för alla åtta: antingen
  // har partiet en egen katalog, eller så står det utskrivet i sources.yaml
  // varför det inte går. Kommentaren är beviset på att frågan är ställd.
  const yaml = readFileSync(
    resolve(import.meta.dirname, "../../data/sources.yaml"),
    "utf8",
  );
  if (katalog.size === 0) return;
  const oforklarade = RIKSDAGSPARTIER.filter((p) => {
    if (katalog.has(p)) return false;
    // Partiets kod ska nämnas i den förklarande kommentaren om varför det
    // saknas. Utan den vet ingen om det är ett val eller en glömska.
    return !new RegExp(`^\\s*#.*\\b${p.toUpperCase()}\\b`, "mu").test(yaml);
  });
  assert.deepEqual(
    oforklarade,
    [],
    `dessa partier saknar katalogkälla UTAN att sources.yaml säger varför: ${oforklarade.join(", ")}`,
  );
});

test("grinden biter: ett parti utan politikkälla ska falla", () => {
  // Ett prov som inte kan fälla ger grönt sken. Här är fällningen.
  const konstruerad = {
    feeds: kallor().feeds.filter((f) => partiForUrl(f.url) !== "sd"),
  } as SourceConfig;
  const tal = politikkallorPerParti(konstruerad);
  assert.equal(tal.get("sd"), 0, "utan SD:s källor ska räkningen för SD vara noll");
});

test("alla partidomäner i sources.yaml känns igen av partiForUrl", () => {
  // Går en domän inte att knyta till ett parti räknas dess sidor inte i
  // täckningen, och utjämningen i skordeordning.ts hoppar tyst över den.
  const config = kallor();
  const okanda = (config.parti_domaner ?? []).filter(
    (d) => partiForUrl(`https://${d}/`) === null,
  );
  assert.deepEqual(okanda, [], `partidomäner utan partikod: ${okanda.join(", ")}`);
});
