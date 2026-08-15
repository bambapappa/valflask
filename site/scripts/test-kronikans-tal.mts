/**
 * test-kronikans-tal.mts — krönikorna ska förbli avpublicerade.
 *
 * Mänskligt beslut 2026-08-14: de sex veckokrönikorna är borttagna från sajten
 * och genereringen nedlagd. Texterna ligger kvar i `data/chronicles.json`,
 * märkta `archived`, som arkiv i kodförrådet.
 *
 * Provet mätte fram till samma dag att platshållarmekanismen var **inkopplad**
 * — den låg oanvänd i fyra månader med egna gröna prov, för ingen mätte att
 * någon anropade den. Den frågan är borta med funktionen. Kvar står den fråga
 * som ersätter den: **att ingenting publicerar dem igen av misstag.**
 *
 * Fyra led, och de mäter olika dörrar in:
 *
 * 1. varje krönika i datat är märkt `archived`,
 * 2. ingen sida läser krönikefilen och renderar den,
 * 3. genereringen är fortsatt avstängd,
 * 4. mekanismen `kronikans-tal.ts` finns kvar och fungerar — den behövs den
 *    dag en krönika skrivs för hand, och ska inte tyst ruttna bort.
 *
 * Led 2 är det som gör provet värt något. En kontroll som bara läste flaggan
 * hade svarat ja även den dag någon bygger en ny sida som läser filen förbi
 * flaggan — och det är precis den sortens miss som lät mekanismen ligga
 * oanvänd så länge.
 *
 * Offline. Körs i sajtens teststil (node --experimental-strip-types).
 *
 *   pnpm test:kronikans-tal
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { losUpp, skrivnaBelopp, somText } from "../../pipeline/src/kronikans-tal.ts";

const ROT = resolve(import.meta.dirname, "../..");
const fil = (p: string) => readFileSync(resolve(ROT, p), "utf8");

let errors = 0;
function check(label: string, cond: boolean, msg?: string): void {
  if (cond) console.log(`  OK: ${label}`);
  else {
    console.error(`FAIL: ${label}${msg ? ` — ${msg}` : ""}`);
    errors++;
  }
}

// ── 1. Datat är arkiv, inte publicering ─────────────────────────────────

interface Kronika {
  slug: string;
  body_md: string;
  archived?: boolean;
}
const kronikor = JSON.parse(fil("data/chronicles.json")) as Kronika[];

const opublicerade = kronikor.filter((k) => k.archived !== true);
check(
  `alla ${kronikor.length} krönikor är märkta som arkiverade`,
  opublicerade.length === 0,
  `${opublicerade.map((k) => k.slug).join(", ")} saknar archived — de skulle renderas igen`,
);

check(
  "texterna ligger kvar — arkiverad betyder inte raderad",
  kronikor.length === 6 && kronikor.every((k) => k.body_md.trim().length > 0),
  `${kronikor.length} krönikor i filen; rättelseposten säger sex, med sin text i behåll`,
);

// ── 2. Ingen sida renderar dem ──────────────────────────────────────────

/** Varje sida under site/src/pages, som text. */
function sidor(katalog: string): string[] {
  const ut: string[] = [];
  for (const post of readdirSync(katalog)) {
    const sokvag = join(katalog, post);
    if (statSync(sokvag).isDirectory()) ut.push(...sidor(sokvag));
    else if (/\.(astro|ts)$/u.test(post)) ut.push(sokvag);
  }
  return ut;
}

/**
 * Att LÄSA filen, inte att nämna den.
 *
 * Noten på `/veckans-flask` länkar till `chronicles.json` i kodförrådet — det
 * är hela poängen med den, och en sökning på filnamnet fäller därför sin egen
 * rättelse. Mönstret matchar i stället anropet: accessorn, eller ett
 * filuppslag som pekar på krönikefilen.
 */
const LASER_KRONIKOR = /\bgetChronicles\b|(?:loadData|readFileSync|readFile)[^\n]{0,80}chronicles\.json/u;

const laser = sidor(resolve(ROT, "site/src/pages"))
  .filter((f) => LASER_KRONIKOR.test(readFileSync(f, "utf8")))
  .map((f) => relative(ROT, f));

check(
  "ingen sida läser krönikefilen",
  laser.length === 0,
  `${laser.join(", ")} läser krönikorna — är de på väg tillbaka ska beslutet skrivas om först`,
);

const noten = fil("site/src/pages/veckans-flask/index.astro");
check(
  "sidan där de låg säger vad som hänt",
  noten.includes("Veckans fläsk är borttagen") && noten.includes("/rattelser"),
  "att ta bort ett helt avsnitt utan spår är en tyst rättelse",
);

const rattelser = JSON.parse(fil("data/rattelser.json")) as Array<{ affects: string }>;
check(
  "borttagningen står i rättelseloggen",
  rattelser.some((r) => /veckokrönikor/iu.test(r.affects)),
);

// ── 3. Genereringen är avstängd ─────────────────────────────────────────

const generering = fil("pipeline/src/chronicle.ts");
check(
  "genereringen är fortsatt avstängd",
  /export const KRONIKOR_PAUSADE = true;/u.test(generering),
  "flaggan är fälld — då skrivs nya krönikor in i en fil ingen renderar",
);
check(
  "genereringen vägrar ändå fastskrivna belopp",
  /skrivnaBelopp\(chron\.body_md\)[\s\S]{0,600}?generated: null/u.test(generering),
  "kontrollen behövs den dag genereringen tas i bruk igen",
);

// ── 4. Mekanismen finns kvar och fungerar ───────────────────────────────

// Den behövs om en krönika skrivs för hand. Ett arkiverat verktyg som slutat
// fungera märks först när någon behöver det, och då är det för sent.
const underlag = { total_msek: 4_195_366, gap_msek: 3_875_366, antal_loften: 690, belopp: { "p-2026-0576": 12_000 } };
const { text, olosta } = losUpp("Fläsket är {total}, gapet {gap}, på {antal} löften.", underlag);
check("platshållarna byts mot dagens tal", !text.includes("{total}") && text.includes(somText(4_195_366)));
check("inget tal tappas bort tyst", olosta.length === 0);
const okand = losUpp("Löftet kostar {belopp:p-2026-9999}.", underlag);
check(
  "en platshållare som inte går att slå upp lämnas synlig",
  okand.text.includes("{belopp:p-2026-9999}") && okand.olosta.length === 1,
);
check(
  "skrivnaBelopp hittar ett fastskrivet belopp",
  skrivnaBelopp("Satsningen kostar 2 300 miljoner kronor.").length === 1,
);

console.log(
  `\n  ${kronikor.length} krönikor arkiverade, ${kronikor.reduce((n, k) => n + skrivnaBelopp(k.body_md).length, 0)} fastskrivna belopp i texterna.`,
);
console.log("  De ligger kvar i kodförrådet och renderas inte. Ska de tillbaka är det ett mänskligt beslut.");

console.log(errors === 0 ? "kronikans-tal: alla grindar gröna" : `kronikans-tal: ${errors} grindar föll`);
if (errors > 0) process.exit(1);
