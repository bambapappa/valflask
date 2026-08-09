/**
 * test-prosan.mts — prosans påståenden om koden mäts, de läses inte.
 *
 * Bakgrunden (2026-08-09): metodsidan påstod att vikt-raden «skrivs av datorn
 * efter en fast mall» och att «samma belopp ger ordagrant samma rad». Sant när
 * det skrevs, osant den dag det nionde löftet fick en modellskriven rad
 * godkänd. Ingenting mätte det — felet hittades för att en människa läste
 * texten och koden bredvid varandra. En inventering av alla 95 prosablock
 * hittade sju påståenden till som inte höll.
 *
 * Grinden har två halvor, och båda behövs:
 *
 *   ANKAREN. Varje post i site/src/lib/prosans-ankare.ts binder en mening
 *   till en mätning. Meningen måste stå ord för ord i sidfilen — det är
 *   citatgrinden vänd mot vår egen text, så att ingen kan formulera om sig
 *   bort från kontrollen — och mätningen måste hålla.
 *
 *   TÄCKNINGEN. Ett register räcker inte: en lista över gammal prosa fångar
 *   inte ny prosa, och då är grinden ett dokument som också åldras — precis
 *   det den skulle hindra. Därför klassas VARJE stycke och listpunkt på
 *   prosasidorna som antingen ankrat eller «bär ingen kontrollerbar utsaga
 *   om koden». Ett nytt eller omskrivet stycke är automatiskt oklassat, och
 *   antalet oklassade har ett tak som bara får sjunka — samma form som
 *   `provningar:status --tak`.
 *
 * Offline. Inget nät. Körs i sajtens teststil (node --experimental-strip-types).
 *
 *   pnpm test:prosan            kör grinden
 *   pnpm test:prosan --tak      skriv om taket när det sjunkit
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { ANKARE, blankaRepot, repofil } from "../src/lib/prosans-ankare.ts";

const ROT = resolve(import.meta.dirname, "../..");
const TAKFIL = resolve(ROT, "site/prosans-tak.json");
const skrivTak = process.argv.includes("--tak");

let fel = 0;
function check(etikett: string, villkor: boolean, varfor?: string): void {
  if (villkor) console.log(`  OK: ${etikett}`);
  else {
    console.error(`FAIL: ${etikett}${varfor ? ` — ${varfor}` : ""}`);
    fel++;
  }
}

/* ══════════════════════════════════ Halva 1 — ankaren ══════════════════ */

console.log("--- Ankaren: meningen står kvar, och mätningen håller ---");

const sedda = new Set<string>();
for (const a of ANKARE) {
  check(`${a.id}: unikt id`, !sedda.has(a.id), "två ankare delar id");
  sedda.add(a.id);

  let sida: string;
  try {
    sida = repofil(a.sida);
  } catch {
    check(`${a.id}: sidan finns`, false, `${a.sida} går inte att läsa`);
    continue;
  }

  // Ord för ord. Skrivs meningen om måste ankaret röras — annars vaktar
  // registret en text som inte längre står någonstans.
  check(
    `${a.id}: påståendet står ord för ord i ${a.sida}`,
    sida.includes(a.pastaende),
    `hittade inte «${a.pastaende.slice(0, 60)}…» — skrevs meningen om utan att ankaret rördes?`,
  );

  let utfall: boolean;
  try {
    utfall = a.prov();
  } catch (e) {
    check(`${a.id}: provet gick att köra`, false, String(e));
    continue;
  }
  check(
    `${a.id}: mätningen håller`,
    utfall,
    `påståendet stämmer inte längre med koden. Fallprov: ${a.fallprov}`,
  );

  // Ett prov som inte kan fälla ger grönt sken. Repot har gjort det
  // misstaget två gånger; därför är fallprovet obligatoriskt.
  check(
    `${a.id}: bär ett fallprov`,
    a.fallprov.trim().length > 20,
    "varje post ska säga vilket infört fel som fäller provet",
  );
}

/* ══════════════════════ Mellanled — biter proven alls? ═════════════════ */

// Repot har byggt två grindar som gav grönt sken: klippgrinden bet inte mot
// ett infört fel, och invarianterna prövade egna kopior av summorna och gav
// grönt med gapfelet återinfört. `fallprov` säger vilket fel varje post
// PROVATS mot, men en text är ingen prövning. Det här är prövningen:
//
// Varje prov körs en gång till med repot blänkt — alla filer tomma. Ett prov
// som fortfarande svarar «ja» läser ingenting som kan ändras, och vaktar
// alltså ingenting. Det är ett svagt fel att införa och ett hårt krav att
// klara, vilket är precis vad man vill ha av en sådan här kontroll.
//
// Databaserade prov (de som läser promises.json genom getPromises) rör inte
// blänkningen — de listas nedan och är prövade för hand mot sina fallprov.
console.log("\n--- Biter proven? Varje prov körs mot ett blänkt repo ---");

const LASER_DATA_INTE_KOD = new Set([
  "metod-atta-partier",
  "metod-quip-ett-par-procent",
  "metod-avskriften-sparas-inte",
  "metod-arkivkopia-nastan-varje",
  "metod-fyra-av-fem-prislappar",
]);

blankaRepot(true);
for (const a of ANKARE) {
  if (LASER_DATA_INTE_KOD.has(a.id)) continue;
  let svar: boolean;
  try {
    svar = a.prov();
  } catch {
    svar = false; // ett prov som kraschar på tomt underlag har bitit
  }
  check(
    `${a.id}: provet faller mot ett blänkt repo`,
    svar === false,
    "provet svarar ja fast det inte fick läsa något — det mäter ingenting",
  );
}
blankaRepot(false);

/* ═══════════════════════════ Halva 2 — täckningen med tak ══════════════ */

console.log("\n--- Täckningen: varje stycke är klassat ---");

interface Block {
  sida: string;
  /** Blockets text, taggarna bortskalade. */
  text: string;
  /** Första raden, för att en människa ska känna igen stycket. */
  forsta: string;
  /** Hash av blockets text — ändras texten blir blocket oklassat igen. */
  hash: string;
}

const SIDOR = [
  "site/src/pages/metod.astro",
  "site/src/pages/om.astro",
  "site/src/pages/press.astro",
  "site/src/pages/api.astro",
  "handlingsvagen/site/src/pages/metod.astro",
  "handlingsvagen/site/src/pages/neutralitet.astro",
];

function textAv(html: string): string {
  return html.replace(/<[^>]+>/gu, "").replace(/\s+/gu, " ").trim();
}

function blockPa(sida: string): Block[] {
  const rå = repofil(sida);
  const block: Block[] = [];

  // Kroppen: allt efter frontmatter. Utan snittet räknas kommentarer och
  // JSON-LD som prosa, och de möter ingen läsare.
  const kropp = rå.replace(/^---[\s\S]*?\n---\n/u, "");
  for (const m of kropp.matchAll(/<(p|li)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gu)) {
    const text = textAv(m[2]!);
    if (text === "") continue;
    // En mall som `<li><b>{rubrik}.</b> {text}</li>` är ingen prosa — den är
    // formen som orden hälls i. Innehållet kommer ur listan i frontmatter och
    // plockas upp där nedan. Räknas mallen med står den som ett evigt
    // oklassat block som ingen kan klassa, för den bär ingen mening.
    if (text.replace(/\{[^}]*\}/gu, "").replace(/[.\s]/gu, "") === "") continue;
    block.push({ sida, text, forsta: text.slice(0, 70), hash: hashAv(text) });
  }

  // Neutralitetskontraktets tio punkter byggs ur en lista i frontmatter och
  // står inte som <li> i mallen. Utan det här steget ligger tio påståenden
  // till läsaren utanför räkningen, och taket vaktar dem inte.
  for (const m of rå.matchAll(/^\s{2}\["([^"]+)",\s*"((?:[^"\\]|\\.)*)"\],?$/gmu)) {
    const text = textAv(`${m[1]}. ${m[2]!.replace(/\\"/gu, '"')}`);
    block.push({ sida, text, forsta: text.slice(0, 70), hash: hashAv(text) });
  }
  return block;
}

function hashAv(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

const alla = SIDOR.flatMap(blockPa);

// Ett block är klassat om det bär ett ankare, eller om det står i
// klasslistan som «bär ingen kontrollerbar utsaga om koden».
//
// Klasslistan är hash → skälet, inte en naken hashlista. En rad som bara
// säger «den här texten behöver ingen kontroll» är själv ett opåstått
// påstående, och det är precis vad grinden finns för att inte tolerera.
const UTAN_UTSAGA: ReadonlySet<string> = new Set(
  Object.keys(JSON.parse(repofil("site/prosans-klassning.json")) as Record<string, string>),
);

const ankradeSidor = new Map<string, string[]>();
for (const a of ANKARE) {
  const lista = ankradeSidor.get(a.sida) ?? [];
  lista.push(textAv(a.pastaende));
  ankradeSidor.set(a.sida, lista);
}

// Ett block är ankrat när någon ankarmening ryms i blockets text.
const oklassade = alla.filter((b) => {
  if (UTAN_UTSAGA.has(b.hash)) return false;
  const ankare = ankradeSidor.get(b.sida) ?? [];
  return !ankare.some((p) => p.length > 0 && b.text.includes(p));
});

console.log(`  ${alla.length} block på ${SIDOR.length} sidor`);
console.log(`  ${alla.length - oklassade.length} klassade, ${oklassade.length} oklassade`);

const tak = JSON.parse(repofil("site/prosans-tak.json")) as {
  oklassade: number;
  note: string;
};

if (skrivTak) {
  if (oklassade.length < tak.oklassade) {
    writeFileSync(
      TAKFIL,
      `${JSON.stringify({ oklassade: oklassade.length, note: tak.note }, null, 2)}\n`,
    );
    console.log(`  Taket sänkt: ${tak.oklassade} → ${oklassade.length}`);
  } else {
    console.log(`  Taket står kvar på ${tak.oklassade} — ingenting att sänka.`);
  }
} else {
  check(
    `oklassade block ${oklassade.length} ≤ taket ${tak.oklassade}`,
    oklassade.length <= tak.oklassade,
    "nytt eller omskrivet stycke som varken bär ett ankare eller är klassat som utan utsaga om koden",
  );
}

if (oklassade.length > 0) {
  console.log("\n  Oklassade block — ge dem ett ankare, eller lägg hashen i site/prosans-klassning.json:");
  for (const b of oklassade) {
    console.log(`    ${b.hash}  ${b.sida.replace(/^.*pages\//u, "")}  ${b.forsta}…`);
  }
}

console.log(fel === 0 ? "\nProsagrinden: grön." : `\nProsagrinden: ${fel} fel.`);
process.exit(fel > 0 ? 1 : 0);
