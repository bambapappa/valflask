/**
 * Ankarsvepet: vilka uträkningar vilar på ett belopp som sedan ändrats?
 *
 *   pnpm ankarsvepet                    # svep hela beståndet
 *   pnpm ankarsvepet -- --json ut.json  # samma, men skrivet till fil
 *   pnpm ankarsvepet -- --beroende p-2026-0016 p-2026-1353
 *
 * `--beroende` är den fråga som ska ställas INNAN en ändring: vad lutar sig mot
 * de här löftena? Dras ett löfte tillbaka eller ändras dess belopp blir
 * låntagarna föräldralösa i samma stund, och utan den frågan märks det inte
 * förrän nästa svep. Det läget läser bara nuvarande data och rör aldrig git.
 *
 * Svepet självt behöver historiken — vilka belopp ett parti HAFT — och den
 * finns bara i git. Den byggs genom att läsa `data/promises.json` i varje
 * commit som rört filen. Det tar en stund och är hela skälet till att svepet är
 * ett eget kommando och ingen grind i bygget.
 *
 * LÄSER BARA. Skriver ingen data.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ankartackning, beroendeAv, foraldradeAnkare, type Ankarlofte } from "../src/ankaren.ts";

const ROT = join(import.meta.dirname, "../..");
const loften = JSON.parse(readFileSync(join(ROT, "data/promises.json"), "utf8")) as Ankarlofte[];

const argv = process.argv.slice(2);
const flagga = (namn: string) => {
  const i = argv.indexOf(`--${namn}`);
  return i < 0 ? undefined : argv[i + 1];
};

// ── Läget som ska köras före varje ändring ───────────────────────────────────
if (argv.includes("--beroende")) {
  const idn = argv.slice(argv.indexOf("--beroende") + 1).filter((a) => !a.startsWith("--"));
  if (idn.length === 0) {
    console.error("Ange minst ett löftes-id: --beroende p-2026-0016 …");
    process.exit(1);
  }
  const b = beroendeAv(loften, idn);
  if (b.length === 0) {
    console.log(`Inget löfte ankrar i ${idn.join(", ")}.`);
    process.exit(0);
  }
  console.log(`${b.length} löfte(n) ankrar i ${idn.join(", ")} — de måste rättas i samma pass:\n`);
  for (const a of b) {
    console.log(`  ${a.id} [${a.parties.join(",").toUpperCase()}] lånar ${a.belopp} mkr av ${a.langivare.toUpperCase()}`);
    console.log(`     ${a.title}`);
    console.log(`     «${a.mening.slice(0, 160)}»\n`);
  }
  // Utfallskod 1: den som kör det här i en kedja ska stanna, inte fortsätta.
  process.exit(1);
}

// ── Hela svepet ──────────────────────────────────────────────────────────────
const shas = execFileSync("git", ["-C", ROT, "rev-list", "HEAD", "--", "data/promises.json"], {
  encoding: "utf8",
}).trim().split("\n").filter(Boolean);

console.log(`Läser ${shas.length} commits för att se vilka belopp varje parti haft …`);
const haft: Record<string, Set<number>> = {};
for (const [i, sha] of shas.entries()) {
  if (i % 100 === 0 && i > 0) console.log(`  ${i}/${shas.length}`);
  let data: Ankarlofte[];
  try {
    data = JSON.parse(
      execFileSync("git", ["-C", ROT, "show", `${sha}:data/promises.json`], {
        encoding: "utf8",
        maxBuffer: 1 << 30,
      }),
    ) as Ankarlofte[];
  } catch {
    // En commit där filen inte gick att läsa säger ingenting om beloppen.
    // Hoppa den hellre än att avbryta hela svepet.
    continue;
  }
  for (const p of data) {
    const b = p.cost?.msek_base;
    if (typeof b !== "number") continue;
    for (const parti of p.parties ?? []) (haft[parti] ??= new Set()).add(b);
  }
}

const historik: Record<string, number[]> = {};
for (const [k, v] of Object.entries(haft)) historik[k] = [...v];

const fynd = foraldradeAnkare(loften, historik);
const t = ankartackning(loften);

console.log(`\n${t.aktiva} aktiva löften · ${t.med_ankarord} med en ankarformulering`);
console.log(`${t.provbara} går att kontrollera — resten namnger varken parti eller belopp.`);
console.log(
  `\nEtt fynd säger alltså något om ${t.provbara} löften, inte om ${t.med_ankarord}. ` +
    `Skillnaden (${t.med_ankarord - t.provbara}) är ankare vi skrivit så att de aldrig går att följa upp.`,
);

console.log(`\n${fynd.length} föråldrade ankare:\n`);
for (const f of fynd) {
  console.log(`${f.id} [${f.parties.join(",").toUpperCase()}] lånar ${f.belopp} mkr av ${f.langivare.toUpperCase()}`);
  console.log(`   ${f.title}`);
  console.log(`   ${f.langivare.toUpperCase()} står nu på: ${f.langivarens_belopp.join(", ") || "inget belopp"}`);
  console.log(`   «${f.mening.slice(0, 180)}»\n`);
}

const ut = flagga("json");
if (ut) {
  writeFileSync(ut, JSON.stringify({ tackning: t, fynd }, null, 2) + "\n");
  console.log(`Skrivet: ${ut}`);
}
process.exit(fynd.length > 0 ? 1 : 0);
