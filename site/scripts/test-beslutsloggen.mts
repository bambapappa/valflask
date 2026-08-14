/**
 * test-beslutsloggen.mts — ett beslut ska säga vilka vågar det gäller.
 *
 * Bakgrunden är ATTGORA F3, och den är mätt. Regeln att ett citat om vad ett
 * parti *redan gjort* inte är något åtagande fattades 2026-08-12 och
 * tillämpades fyra gånger i löfteskön. **Den gällde aldrig i
 * ståndpunktsrutnätet.** Två publicerade celler stod på dåtidscitat, och en av
 * dem var hämtad från samma partisida där ett annat citat avvisats på exakt
 * den grunden samma vecka.
 *
 * Regeln var varken glömd, ifrågasatt eller svår. Den var skriven på ett
 * ställe och tillämpad på ett ställe — vågarna har skilda köer, skilda grindar
 * och skilda genomgångar, och ett beslut vandrar inte av sig självt mellan dem.
 *
 * Grinden gör frågan «var gäller det här?» obligatorisk för nya poster.
 * **Bara för nya:** de 149 posterna före 2026-08-14 skrevs under ett annat
 * format, och en grind som är röd på hela historiken från dag ett blir
 * bortviftad. Taket är alltså ett datum, inte ett antal, och det får flyttas
 * framåt lika lite som ett tak får höjas.
 *
 * Vad grinden INTE mäter, och som därför fortfarande hänger på omdömet: att
 * det publicerade beståndet faktiskt kontrollerats i varje våg raden nämner.
 * Det går inte att läsa ur en textrad. Raden tvingar fram frågan; svaret är en
 * människas.
 *
 * Offline. Körs i sajtens teststil (node --experimental-strip-types).
 *
 *   pnpm test:beslutsloggen
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROT = resolve(import.meta.dirname, "../..");
const LOGGAR = ["DECISION_LOG.md", "handlingsvagen/DECISION_LOG.md"];

/** Poster från och med det här datumet ska bära raden. */
const KRAVS_FRAN = "2026-08-14";

/** Vågarna en post får åberopa. «alla tre» räknas som samtliga. */
const VAGARNA = /\b(Fläskvågen|Frågevågen|Handlingsvågen|alla tre)\b/u;

let fel = 0;
function check(etikett: string, villkor: boolean, varfor?: string): void {
  if (villkor) console.log(`  OK: ${etikett}`);
  else {
    console.error(`FAIL: ${etikett}${varfor ? ` — ${varfor}` : ""}`);
    fel++;
  }
}

/** En post: rubrikens datum och brödtexten fram till nästa rubrik. */
interface Post {
  logg: string;
  datum: string;
  rubrik: string;
  text: string;
}

function poster(logg: string): Post[] {
  const md = readFileSync(resolve(ROT, logg), "utf8");
  const rader = md.split("\n");
  const ut: Post[] = [];
  let nu: Post | null = null;
  for (const rad of rader) {
    const m = /^##\s+(\d{4}-\d{2}-\d{2})\s*(?:—|-)?\s*(.*)$/u.exec(rad);
    if (m) {
      if (nu) ut.push(nu);
      nu = { logg, datum: m[1]!, rubrik: m[2]!.trim(), text: "" };
    } else if (nu) {
      nu.text += `${rad}\n`;
    }
  }
  if (nu) ut.push(nu);
  return ut;
}

/** Bär posten en läsbar «Gäller»-rad som namnger minst en våg? */
export function garVagarna(text: string): boolean {
  const m = /^\s*\*\*Gäller:?\*\*\s*(.+)$/mu.exec(text);
  return m !== null && VAGARNA.test(m[1]!);
}

/* ═══════════════ Halva 1 — mönstret prövas mot känt facit ═══════════════ */

console.log("=== Beslutsloggen: mönstret prövas mot känt facit ===");

const FACIT: Array<[string, boolean]> = [
  ["**Gäller:** Fläskvågen och Frågevågen.\n\n**Beslut:** …", true],
  ["**Gäller:** alla tre vågarna.\n", true],
  ["**Gäller** Handlingsvågen\n", true],
  // Raden ska namnge en våg, inte bara finnas.
  ["**Gäller:** hela projektet.\n", false],
  ["**Gäller:**\n", false],
  // Ordet i löptexten är inte raden.
  ["**Beslut:** Fläskvågen räknar om summan.\n", false],
  ["**Beslut:** …\n\n**Motiv:** …\n", false],
];
for (const [text, ska] of FACIT) {
  check(
    `«${text.split("\n")[0]!.slice(0, 40)}…» ${ska ? "godtas" : "fälls"}`,
    garVagarna(text) === ska,
    "mönstret mäter inte det det ska",
  );
}

if (fel > 0) {
  console.error("\nFAIL: självprovet föll — svepet körs inte.");
  process.exit(1);
}

/* ═════════════════════ Halva 2 — svepet över loggarna ═══════════════════ */

console.log("\n=== Beslutsloggen: svepet ===");

const alla = LOGGAR.flatMap(poster);
const nya = alla.filter((p) => p.datum >= KRAVS_FRAN);
const utan = nya.filter((p) => !garVagarna(p.text));

console.log(`  ${alla.length} beslut lästa · ${nya.length} från och med ${KRAVS_FRAN} · ${utan.length} utan Gäller-rad`);

check(
  `varje beslut från och med ${KRAVS_FRAN} säger vilka vågar det gäller`,
  utan.length === 0,
  `${utan.map((p) => `${p.logg} ${p.datum} «${p.rubrik.slice(0, 40)}»`).join(" · ")}\n` +
    "      Lägg till **Gäller:** med Fläskvågen, Frågevågen, Handlingsvågen eller alla tre — " +
    "och kontrollera det publicerade beståndet i var och en innan posten stängs.",
);

// Datumtaket får inte flyttas framåt för att slippa skriva raden. Går det
// förbi dagens datum har någon skjutit kravet på framtiden.
const idag = new Date().toISOString().slice(0, 10);
check(
  "kravets datum ligger inte i framtiden",
  KRAVS_FRAN <= idag,
  `KRAVS_FRAN är ${KRAVS_FRAN} men i dag är ${idag} — kravet är bortskjutet i stället för uppfyllt`,
);

console.log(fel === 0 ? "beslutsloggen: alla grindar gröna" : `beslutsloggen: ${fel} grindar föll`);
if (fel > 0) process.exit(1);
