/**
 * «Är allt grönt?» — hela kedjan, i den ordning den måste köras.
 *
 *   pnpm gront            # bygg om det härledda, kör alla sviter
 *   pnpm gront -- --snabb # hoppa över sitens bygge och svit (fem minuter)
 *
 * ORDNINGEN ÄR HELA POÄNGEN. Handlingsvågen läser en **incheckad kopia** av
 * Fläskvågens löften. Ändras `data/promises.json` — ett godkännande, en
 * indragning, en arkivbackfill — är kopian omedelbart gammal, och provet
 * «läskopian i Handlingsvågen följer Fläskvågens löften» fäller den. Byggs
 * kopian om FÖRE sviterna finns felet aldrig; byggs den om efteråt, eller inte
 * alls, faller bygget i CI.
 *
 * **Ett grönt provresultat gäller bara det tillstånd det kördes mot.** Det är
 * inte en formalitet: 2026-08-21 rapporterades grönt tre gånger från körningar
 * som var ÄLDRE än dataändringen — sviten kördes före godkännandena och lästes
 * efter dem. Två av gångerna blev CI rött, en gång blev `main` rött. Provet
 * fanns och fungerade varje gång; det var ordningen som svek.
 *
 * Därför skriver den här körningen ut vilket tillstånd den gällde: commit,
 * vilka datafiler som är ändrade, och om något härlett byggdes om på vägen. En
 * grön rapport som inte namnger sitt tillstånd går att läsa in i fel läge, och
 * det var precis det som hände.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lasinnehav, lastext } from "../src/datalas.ts";

const ROT = join(import.meta.dirname, "../..");
const DATA = join(ROT, "data");
const snabb = process.argv.includes("--snabb");

function kor(namn: string, katalog: string, kommando: string, args: string[]): boolean {
  const t0 = Date.now();
  process.stdout.write(`  ${namn} … `);
  const r = spawnSync(kommando, args, { cwd: join(ROT, katalog), encoding: "utf8" });
  const sek = ((Date.now() - t0) / 1000).toFixed(0);
  if (r.status === 0) {
    console.log(`grönt (${sek}s)`);
    return true;
  }
  console.log(`FALLER (${sek}s)\n`);
  // Bara det som faktiskt säger något: raderna kring felet, inte hela loggen.
  const ut = (r.stdout ?? "") + (r.stderr ?? "");
  const rader = ut.split("\n");
  const forsta = rader.findIndex((l) => /not ok|FAIL:|✖|Error|AssertionError/.test(l));
  const utsnitt = forsta === -1 ? rader.slice(-25) : rader.slice(forsta, forsta + 25);
  for (const l of utsnitt) console.log(`    ${l}`);
  console.log(`\n  Kör om själv för hela loggen:  cd ${katalog} && ${kommando} ${args.join(" ")}`);
  return false;
}

function git(...args: string[]): string {
  const r = spawnSync("git", ["-C", ROT, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
}

// ── 1. Är data/ ledigt? ────────────────────────────────────────────────────
const innehav = lasinnehav(DATA);
if (innehav) {
  console.error(lastext(innehav));
  console.error("\nSviten muterar data/ och kan inte köra medan något annat gör det.");
  process.exit(1);
}

// ── 2. Vilket tillstånd gäller körningen? ───────────────────────────────────
const commit = git("rev-parse", "--short=7", "HEAD");
const gren = git("rev-parse", "--abbrev-ref", "HEAD");
const smutsigt = git("status", "--porcelain", "--", "data", "handlingsvagen/data")
  .split("\n").filter((l) => l.trim() !== "");

console.log(`Kör mot ${gren} (${commit}).`);
if (smutsigt.length > 0) {
  console.log(`${smutsigt.length} datafil(er) är ändrade men inte incheckade:`);
  for (const l of smutsigt) console.log(`  ${l}`);
  console.log("  (data-clean-provet kräver ett rent träd — committa innan du litar på ett grönt svar)");
}
console.log();

// ── 3. Bygg om det härledda FÖRE sviterna ──────────────────────────────────
console.log("Bygger om det härledda:");
const hvData = join(ROT, "handlingsvagen/data");
const innan = ["loften-index.json", "domar.json"].map((f) => {
  try { return readFileSync(join(hvData, f), "utf8"); } catch { return ""; }
});
const byggt =
  kor("läskopian (vendor)", "handlingsvagen/pipeline", "npm",
      ["run", "-s", "vendor", "--", "--promises", "../../data/promises.json", "--parties", "../../data/parties.json"]) &&
  kor("domarna", "handlingsvagen/pipeline", "npm",
      ["run", "-s", "domar", "--", "--promises", "../../data/promises.json"]);
if (!byggt) process.exit(1);

const efter = ["loften-index.json", "domar.json"].map((f) => {
  try { return readFileSync(join(hvData, f), "utf8"); } catch { return ""; }
});
const andrade = ["loften-index.json", "domar.json"].filter((_, i) => innan[i] !== efter[i]);
if (andrade.length > 0) {
  console.log(`  → ${andrade.join(" och ")} ändrades. Det härledda hade halkat efter; committa det med resten.`);
}
console.log();

// ── 4. Sviterna, i ordning ─────────────────────────────────────────────────
console.log("Sviterna:");
const steg: Array<[string, string, string, string[]]> = [
  ["pipeline", "pipeline", "npm", ["test"]],
  ["handlingsvägen", "handlingsvagen/pipeline", "npm", ["test"]],
];
if (!snabb) {
  steg.push(["sitens bygge", "site", "pnpm", ["build"]]);
  steg.push(["sitens svit", "site", "pnpm", ["test"]]);
}

for (const [namn, katalog, kmd, args] of steg) {
  if (!kor(namn, katalog, kmd, args)) {
    console.log(`\nInte grönt. Tillståndet var ${gren} (${commit}).`);
    process.exit(1);
  }
}

// ── 5. Rapporten namnger sitt tillstånd ────────────────────────────────────
const nuSmutsigt = git("status", "--porcelain", "--", "data", "handlingsvagen/data")
  .split("\n").filter((l) => l.trim() !== "");
console.log(`\nAllt grönt${snabb ? " (utan sitens bygge och svit)" : ""}.`);
console.log(`Gäller ${gren} (${commit})${nuSmutsigt.length ? ` plus ${nuSmutsigt.length} ändrad(e) datafil(er) i arbetsträdet` : ", rent arbetsträd"}.`);
if (nuSmutsigt.length > 0) {
  console.log("Ändras något i data/ efter det här svaret gäller det inte längre — kör om.");
}
