/**
 * test-ord.mts — orden vi förbjudit mäts, de minns inte.
 *
 * `CLAUDE.md` har haft språkregler sedan länge. De har inte hållit: regeln
 * «skriv mänskligt beslut, aldrig ägarbeslut» stod skriven medan ordet levde
 * kvar på ett trettiotal ställen — ett av dem i `data/issues.json`, som
 * serveras publikt på `/api/v1/issues.json`. En regel som bara står skriven
 * är en påminnelse, och påminnelser åldras. Den här grinden gör regeln till
 * en mätning i stället.
 *
 * Två ord i dag:
 *
 *   ÄGARBESLUT. Sajten säger till läsaren att en människa fattar besluten.
 *   «Ägarbeslut» säger något annat — att det finns en ägare vars ord gäller —
 *   och det är fel bild av en granskningssajt.
 *
 *   VÅGOR. Fel plural. En våg man surfar på blir vågor; en våg man väger på
 *   blir **vågar**, och det är den betydelsen Fläskvågen, Frågevågen och
 *   Handlingsvågen bär. Sammansättningar där ordet betyder rörelse i vatten
 *   — «brottsvågor», «flyktingvågor» — är rätt stavade och passerar, för
 *   mönstret kräver att ordet står fritt.
 *
 * Ordet «verbatim» är också förbjudet i prosa men saknas här med flit: det
 * lever i ett hundratal kodnamn och fältnamn som `CLAUDE.md` uttryckligen
 * tillåter (`normalizeForVerbatim`, `verbatim_quote`), och en grind som inte
 * kan skilja namnet från prosan skulle antingen falla på tillåten kod eller
 * släppa igenom allt. De två orden här har inga sådana undantag.
 *
 * Grinden prövar sig själv först. Ett mönster som slutat träffa gör grinden
 * grön utan att mäta något — samma fälla som prosagrindens blänkta repo
 * fångade. Därför körs mönstren mot påhittade rader med känt facit innan
 * något riktigt läses, och självprovet måste passera för att svepet ska köras.
 *
 * Offline. Inget nät. Körs i sajtens teststil (node --experimental-strip-types).
 *
 *   pnpm test:ord
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROT = resolve(import.meta.dirname, "../..");

interface Ord {
  /** Vad grinden heter i utskriften. */
  namn: string;
  /** Måste matcha ordet fritt stående, inte som efterled i en sammansättning. */
  monster: RegExp;
  /** Vad man skriver i stället. */
  istallet: string;
  /** Rader som SKA träffa, och rader som INTE får träffa. Grindens eget fallprov. */
  traffar: string[];
  passerar: string[];
}

const ORDEN: Ord[] = [
  {
    namn: "ägarbeslut",
    monster: /ägarbeslut/giu,
    istallet: "skriv «mänskligt beslut»",
    traffar: ["fattat genom ägarbeslut", "Ägarbeslut §21", "§11-ägarbeslutet"],
    passerar: ["fattat genom mänskligt beslut", "beslutet är ägarens"],
  },
  {
    namn: "vågor",
    // Föregående tecken får inte vara en bokstav: «brottsvågor» är rätt ord.
    monster: /(?<![\p{L}])vågor/giu,
    istallet: "skriv «vågar» — en våg man väger på blir vågar i plural",
    traffar: ["tre vågor", "de två vågorna", "VÅGOR", "båda vågornas krav"],
    passerar: ["tre vågar", "brottsvågor", "flyktingvågor", "migrationsvågor"],
  },
];

/**
 * Kataloger som aldrig läses.
 *
 * `handlingsvagen/data/nyckelord` står här av ett skäl som inte är fart:
 * det är ord skördade ur riksdagens egna handlingar, och där BETYDER «vågor»
 * vågor. Skulle mönstret någon gång träffa där vore träffen fel, inte fyndet.
 */
const HOPPAS_OVER = new Set([
  ".git",
  "node_modules",
  "dist",
  ".astro",
  "coverage",
  "nyckelord",
]);

/** Filer vi läser. Låsfiler, bilder och typsnitt bär ingen prosa. */
const ANDELSER = [
  ".ts", ".mts", ".tsx", ".js", ".mjs", ".cjs", ".astro", ".json", ".md",
  ".yml", ".yaml", ".html", ".css", ".txt", ".py", ".sh",
];
const LASES_INTE = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  // Den här filen bär varje förbjudet ord som mönster, exempel och facit.
  "test-ord.mts",
]);

/**
 * Regeln själv måste få namnge ordet den förbjuder.
 *
 * Undantaget är en RAD, inte en fil: hade `CLAUDE.md` lyfts ut i sin helhet
 * hade all annan prosa där gått fri från grinden — och det är just den filen
 * som ska föregå med gott exempel. Vill du skriva om det förbjudna ordet:
 * skriv regelns form, «aldrig "ordet"». Både raka citattecken och citattecken
 * duger — resten av repot blandar dem, och grinden ska fälla ordval, inte
 * typografi.
 */
const REGELRAD = /aldrig [«"](ägarbeslut|vågor)[»"]/u;

let fel = 0;
function check(etikett: string, villkor: boolean, varfor?: string): void {
  if (villkor) console.log(`  OK: ${etikett}`);
  else {
    console.error(`FAIL: ${etikett}${varfor ? ` — ${varfor}` : ""}`);
    fel++;
  }
}

function traffas(ord: Ord, rad: string): boolean {
  ord.monster.lastIndex = 0;
  return ord.monster.test(rad);
}

/* ══════════════ Halva 1 — grinden prövar sina egna mönster ══════════════ */

console.log("=== Ordgrinden: mönstren prövas mot känt facit ===");

for (const ord of ORDEN) {
  for (const rad of ord.traffar) {
    check(`${ord.namn}: «${rad}» fälls`, traffas(ord, rad), "mönstret mäter inte längre");
  }
  for (const rad of ord.passerar) {
    check(`${ord.namn}: «${rad}» passerar`, !traffas(ord, rad), "mönstret fäller rätt ord");
  }
}

// Undantaget prövas som allt annat. Släpper det för mycket är grinden tandlös
// på just de filer som ska föregå med gott exempel.
const REGELRAD_FALL: Array<[string, boolean]> = [
  ['**Skriv "mänskligt beslut", aldrig "ägarbeslut".** Gäller all text', true],
  ["**Pluralen är «vågar», aldrig «vågor».** En våg man väger på", true],
  ["Beslutet fattades genom ägarbeslut 2026-07-11", false],
  ["Tjänsten består av tre vågor", false],
  // Undantaget får inte gå att åberopa åt fel håll: raden ska säga att ordet
  // är förbjudet, inte bara råka innehålla ett «aldrig» i närheten.
  ["Ett ägarbeslut ändras aldrig i efterhand", false],
];
for (const [rad, undantas] of REGELRAD_FALL) {
  check(
    `regelrad: «${rad.slice(0, 44)}…» ${undantas ? "undantas" : "prövas"}`,
    REGELRAD.test(rad) === undantas,
    "undantaget släpper fel rader",
  );
}

if (fel > 0) {
  console.error(
    `\nFAIL: ${fel} självprov. Svepet körs inte — ett trasigt mönster som sveper ` +
      "ett rent repo ser likadant ut som en grind som fungerar.",
  );
  process.exit(1);
}

/* ══════════════════════ Halva 2 — svepet över repot ═════════════════════ */

function filer(katalog: string): string[] {
  let ut: string[] = [];
  for (const post of readdirSync(katalog)) {
    if (HOPPAS_OVER.has(post)) continue;
    const sokvag = join(katalog, post);
    if (statSync(sokvag).isDirectory()) ut = ut.concat(filer(sokvag));
    else if (ANDELSER.some((a) => post.endsWith(a)) && !LASES_INTE.has(post)) ut.push(sokvag);
  }
  return ut;
}

console.log("\n=== Ordgrinden: svepet över repot ===");

const fynd: string[] = [];
let lasta = 0;
for (const fil of filer(ROT)) {
  lasta++;
  const rader = readFileSync(fil, "utf8").split("\n");
  for (const [nr, rad] of rader.entries()) {
    if (REGELRAD.test(rad)) continue;
    for (const ord of ORDEN) {
      if (traffas(ord, rad)) {
        fynd.push(
          `${relative(ROT, fil)}:${nr + 1}: «${ord.namn}» — ${ord.istallet}\n      ${rad.trim().slice(0, 120)}`,
        );
      }
    }
  }
}

if (fynd.length > 0) {
  console.error(`FAIL: ${fynd.length} förbjudna ord i ${lasta} lästa filer:`);
  for (const f of fynd) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`  OK: inget av ${ORDEN.length} förbjudna ord i ${lasta} lästa filer`);
