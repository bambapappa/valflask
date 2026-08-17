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

/**
 * En KATALOGKÄLLA når hela politikavdelningen, inte en enda sida.
 *
 * Tre former, en per sorts sajt: `sitemap` (partiet publicerar ett
 * sidregister), `index` med eget `max_articles` (serverrenderad katalog i en
 * våning, som KD:s A–Ö) och `index` med `follow_depth: 2` (katalog i två
 * våningar, som S:s).
 */
function katalogPartier(config: SourceConfig): Set<string> {
  const katalog = new Set<string>();
  for (const feed of config.feeds) {
    const arKatalog =
      feed.type === "sitemap" ||
      (feed.type === "index" && (feed.max_articles !== undefined || feed.follow_depth === 2));
    if (!arKatalog) continue;
    const parti = partiForUrl(feed.url);
    if (parti) katalog.add(parti);
  }
  return katalog;
}

test("varje riksdagsparti har en KATALOGKÄLLA, inte bara en enstaka sida", () => {
  // Det var exakt den här skillnaden som skapade snedfördelningen: KD fick
  // sin A–Ö som genomsökt katalog medan alla andra hade en enda politiksida.
  // En katalog ger hundratals sidor, en enkelsida ger en — och antalet löften
  // följer den skillnaden, inte partierna.
  //
  // Kravet är skärpt 2026-08-17 från «minst en politikkälla» till «en
  // katalog», eftersom alla åtta numera har en. Ett krav som alla klarar är
  // ett krav som går att ställa.
  const katalog = katalogPartier(kallor());
  const utan = RIKSDAGSPARTIER.filter((p) => !katalog.has(p));
  assert.deepEqual(
    utan,
    [],
    `dessa partier saknar katalogkälla: ${utan.join(", ")}. ` +
      "Utan en når vi bara partiets förstasida, och de blir underskördade " +
      "jämfört med de sju andra.",
  );
});

test("grinden biter: ett parti utan katalogkälla ska falla", () => {
  const konstruerad = {
    feeds: kallor().feeds.filter(
      (f) => !(partiForUrl(f.url) === "s" && f.id === "s-politik-index"),
    ),
  } as SourceConfig;
  assert.equal(
    katalogPartier(konstruerad).has("s"),
    false,
    "utan s-politik-index ska S sakna katalog",
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
