/**
 * test-importer.mts — allt i src/lib ska gå att importera från ett fristående
 * node-skript, inte bara från Astro.
 *
 * Bakgrunden (2026-08-05): generate-og.mts bar egna kopior av sajtens summor
 * och formatering, och kopiorna hann glida isär på fem punkter — värst att
 * belopp under 1 000 mkr skrevs ut som miljarder på 92 löftesbilder. Orsaken
 * till kopiorna var inte lättja: calc.ts återexporterade med ändelselösa
 * relativa sökvägar. Vite och Astro resolverar sådana, men
 * `node --experimental-strip-types` gör det inte — så filen gick helt enkelt
 * inte att importera från ett skript. Den som skrev skriptet hade två val:
 * kopiera, eller ändra i en fil hela sajten hänger på.
 *
 * Grinden nedan tar bort valet. Den prövar två saker:
 *   1. Varje KÖRBAR relativ import i src/lib bär filändelse. (Typimporter
 *      och typexporter stripas bort före körning och behöver ingen.)
 *   2. Modulerna går faktiskt att importera — grinden importerar dem på
 *      riktigt, vilket fångar också det en textsökning missar.
 *
 * Körs i sajtens teststil (node --experimental-strip-types).
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(__dirname, "../src/lib");

let errors = 0;
function check(label: string, cond: boolean, msg?: string): void {
  if (cond) console.log(`  OK: ${label}`);
  else {
    console.error(`FAIL: ${label}${msg ? ` — ${msg}` : ""}`);
    errors++;
  }
}

const filer = readdirSync(LIB).filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));

console.log("--- Körbara relativa importer bär filändelse ---");
for (const fil of filer) {
  const src = readFileSync(resolve(LIB, fil), "utf8");
  const utanKommentarer = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  // Alla relativa import-/export-satser, med eller utan `type`-nyckelordet.
  const satser = [
    ...utanKommentarer.matchAll(/(import|export)\s+(type\s+)?[\s\S]*?from\s+["'](\.[^"']*)["']/g),
  ];
  const trasiga = satser.filter(([, , typKeyword, sokvag]) => {
    if (typKeyword) return false; // `import type` / `export type` stripas bort
    return !/\.(ts|js|mts|mjs|json)$/.test(sokvag);
  });

  check(
    `${fil}`,
    trasiga.length === 0,
    trasiga.map((m) => `"${m[3]}" saknar ändelse`).join(", ") +
      " — Astro klarar det, node --experimental-strip-types gör det inte",
  );
}

console.log("\n--- Modulerna går faktiskt att importera från ett skript ---");
for (const fil of filer) {
  try {
    await import(resolve(LIB, fil));
    console.log(`  OK: ${fil}`);
  } catch (err) {
    console.error(`FAIL: ${fil} — går inte att importera: ${(err as Error).message}`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\ntest-importer: ${errors} grind(ar) föll`);
  process.exit(1);
}
console.log("\ntest-importer: alla grindar gröna");
