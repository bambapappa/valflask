/**
 * Grind: inga style-attribut i sidorna.
 *
 * Sajten skickar Content-Security-Policy med `style-src 'self'` och utan
 * `'unsafe-inline'` (site/public/_headers). Den regeln kastar bort varje
 * style-attribut i sidan — i alla webbläsare, inte bara någon. En stil som
 * skrivs där verkar alltså aldrig i drift, och webbläsaren säger inte ifrån
 * på något läsaren märker.
 *
 * Det har hänt två gånger, båda i ordtrendernas staplar, båda tysta:
 *   2026-08-04  ett barn med style="width:36%" fick ingen bredd alls och
 *               sträckte sig till full bredd — varje stapel såg full ut.
 *   2026-08-09  en gradient som läste style="--andel:36%" fick i stället
 *               tillbaka sitt reservvärde 0 % och ritade varje stapel tom.
 * Symtomen var olika, orsaken densamma, och den andra vändan gick åt att
 * hitta samma sak igen. Därför faller bygget nu i stället.
 *
 * Lägg stilen i en CSS-fil, eller — när talet är data, som en stapellängd —
 * i ett attribut som inte är stil: en svg:s `width` är geometri och passerar.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KATALOGER = ["src", "public"];
const ANDELSER = [".astro", ".ts", ".mts", ".js", ".mjs", ".html"];

/** style="…", style='…' och Astros style={…} — men inte ordet "style" i prosa. */
const MONSTER = /\bstyle\s*=\s*["'{]/g;

function granskad(namn: string): boolean {
  return ANDELSER.some((a) => namn.endsWith(a));
}

function filer(katalog: string): string[] {
  let ut: string[] = [];
  for (const post of readdirSync(katalog)) {
    const sokvag = join(katalog, post);
    if (statSync(sokvag).isDirectory()) ut = ut.concat(filer(sokvag));
    else if (granskad(post)) ut.push(sokvag);
  }
  return ut;
}

const fynd: string[] = [];
for (const katalog of KATALOGER) {
  for (const fil of filer(resolve(rot, katalog))) {
    for (const [nr, innehall] of readFileSync(fil, "utf8").split("\n").entries()) {
      MONSTER.lastIndex = 0;
      if (MONSTER.test(innehall)) {
        fynd.push(`${relative(rot, fil)}:${nr + 1}: ${innehall.trim().slice(0, 110)}`);
      }
    }
  }
}

console.log("=== Grind: inga style-attribut (CSP style-src 'self') ===");
if (fynd.length > 0) {
  console.error(
    `FAIL: ${fynd.length} style-attribut. Sajtens säkerhetsregler kastar bort dem, så stilen verkar aldrig i drift:`,
  );
  for (const f of fynd) console.error(`  ${f}`);
  console.error("  Flytta stilen till en CSS-fil. Är talet data: använd en svg:s width-attribut.");
  process.exit(1);
}
console.log("  OK: inga style-attribut i src/ eller public/");
