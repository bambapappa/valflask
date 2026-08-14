/**
 * test-kronikans-tal.mts — mekanismen ska vara inkopplad, inte bara finnas.
 *
 * Bakgrunden är hela fyndet i ATTGORA E3. Det mänskliga beslutet 2026-08-09
 * sa att krönikans redogörelse är statisk men **talen dynamiska**: summor, gap
 * och antal skrivs som platshållare och slås upp när sidan byggs. Mekanismen
 * byggdes med egna prov i pipelinen — och **ingen importerade den**. De två
 * enda träffarna på `kronikans-tal` i hela kodbasen var doc-kommentarer, och
 * renderaren skrev ut `body_md` som den stod, i fyra månader.
 *
 * Ett prov på funktionen själv hade varit grönt hela tiden. Det som saknades
 * var ett prov på att någon **anropar** den, och det är vad som mäts här:
 *
 * 1. krönikesidan anropar `losUpp()` på krönikans text,
 * 2. genereringen vägrar skriva en krönika med fastskrivna belopp,
 * 3. `losUpp()` byter faktiskt ut en platshållare — mätt genom att köra den.
 *
 * Provet läser källkoden, för det är själva inkopplingen som ska mätas. Ett
 * prov som bara anropade funktionen hade svarat ja även den dag renderaren
 * slutar göra det.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

// ── 1. Renderaren anropar mekanismen ────────────────────────────────────

const renderare = fil("site/src/pages/veckans-flask/[slug].astro");
check(
  "krönikesidan importerar losUpp",
  /import\s*\{[^}]*\blosUpp\b[^}]*\}\s*from\s*["'][^"']*kronikans-tal/u.test(renderare),
  "mekanismen finns men ingen läser den — precis felet E3 beskriver",
);
check(
  "krönikesidan slår upp talen i krönikans egen text",
  /losUpp\(\s*chronicle\.body_md/u.test(renderare),
  "losUpp anropas inte på body_md",
);
check(
  "den upplösta texten är den som renderas",
  /renderBody\(bodyMd\)/u.test(renderare),
  "renderBody får fortfarande den råa texten — uppslaget kastas bort",
);

// ── 2. Genereringen vägrar fastskrivna belopp ───────────────────────────

const generering = fil("pipeline/src/chronicle.ts");
check(
  "genereringen läser skrivnaBelopp",
  /import\s*\{[^}]*\bskrivnaBelopp\b[^}]*\}\s*from\s*["']\.\/kronikans-tal\.ts["']/u.test(generering),
);
check(
  "en krönika med fastskrivna belopp skrivs inte",
  /skrivnaBelopp\(chron\.body_md\)[\s\S]{0,600}?generated: null/u.test(generering),
  "kontrollen finns men stoppar inte skrivningen",
);

// ── 3. Mekanismen gör det den utger sig för ─────────────────────────────

const underlag = {
  total_msek: 4_195_366,
  gap_msek: 3_875_366,
  antal_loften: 690,
  belopp: { "p-2026-0576": 12_000 },
};
const { text, olosta } = losUpp(
  "Fläsket uppgår till {total}, gapet till {gap}, fördelat på {antal} löften. Ett av dem kostar {belopp:p-2026-0576}.",
  underlag,
);
check("platshållarna byts mot dagens tal", !text.includes("{total}") && !text.includes("{antal}"));
check("summan skrivs som en läsare läser den", text.includes(somText(4_195_366)));
check("inget tal tappas bort tyst", olosta.length === 0);

const okand = losUpp("Löftet kostar {belopp:p-2026-9999}.", underlag);
check(
  "en platshållare som inte går att slå upp lämnas synlig",
  okand.text.includes("{belopp:p-2026-9999}") && okand.olosta.length === 1,
  "ett tal som tappats bort ska synas, inte försvinna",
);

// ── 4. De sex gamla krönikorna, som mätvärde ────────────────────────────

interface Kronika {
  slug: string;
  body_md: string;
  generated_at: string;
}
const kronikor = JSON.parse(fil("data/chronicles.json")) as Kronika[];
const BESLUTET = "2026-08-09";
const fore = kronikor.filter((k) => k.generated_at.slice(0, 10) < BESLUTET);
const efter = kronikor.filter((k) => k.generated_at.slice(0, 10) >= BESLUTET);

const fastskrivna = fore.reduce((n, k) => n + skrivnaBelopp(k.body_md).length, 0);
console.log(`\n  ${fore.length} krönikor skrevs före beslutet och bär ${fastskrivna} fastskrivna belopp.`);
console.log("  De skrivs inte om — «Då och nu»-rutan visar skillnaden. Att skriva om dem är ett mänskligt beslut.");

/**
 * Grinden gäller det som skrivs EFTER beslutet. Hade den gällt alla sex hade
 * den varit röd från dag ett med 41 fynd, och en grind som är röd varje dag är
 * ingen grind.
 */
const nyaMedBelopp = efter.filter((k) => skrivnaBelopp(k.body_md).length > 0);
check(
  "ingen krönika skriven efter beslutet bär ett fastskrivet belopp",
  nyaMedBelopp.length === 0,
  `${nyaMedBelopp.map((k) => k.slug).join(", ")} — talen ska vara platshållare`,
);

console.log(errors === 0 ? "kronikans-tal: alla grindar gröna" : `kronikans-tal: ${errors} grindar föll`);
if (errors > 0) process.exit(1);
