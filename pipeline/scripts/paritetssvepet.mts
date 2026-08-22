/**
 * Kör paritetssvepet och håller kön som ska kvitteras.
 *
 *   pnpm paritetssvepet                     — kör svepet, skriv ingenting
 *   pnpm paritetssvepet -- --skriv          — uppdatera data/paritetskon.json
 *   pnpm paritetssvepet -- --kvittera <nyckel> --utfall <utfall> --skal "…"
 *
 * Utfall: `olika_atgarder`, `nollan_haller`, `rattat`, `till_beslut`. Se src/pariteten.ts för
 * vad de betyder och varför svepet rapporterar i stället för att spärra.
 *
 * Skriptet ändrar aldrig ett belopp och rör aldrig promises.json. Det ställer
 * en fråga; svaret är ett mänskligt beslut, och rättas något går det den
 * vanliga vägen med rättelsenot.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  paritetsfynd,
  okvitterade,
  vantarPaBeslut,
  type Kvittens,
  type Kvittensutfall,
  type Paritetsfynd,
  type ParitetsLofte,
} from "../src/pariteten.ts";
import { svenskDag } from "../src/dagen.ts";

const rot = resolve(import.meta.dirname, "../..");
const koFil = resolve(rot, "data/paritetskon.json");

const SYFTE =
  "Nollade reformlöften som liknar ett prissatt löfte hos ett annat parti. " +
  "Rapporterande kö, aldrig en spärr: varje rad ska läsas och kvitteras, och " +
  "«olika åtgärder» är ett fullgott svar. Se pipeline/src/pariteten.ts.";

const UTFALL: readonly Kvittensutfall[] = ["olika_atgarder", "nollan_haller", "rattat", "till_beslut"];

interface Korad extends Paritetsfynd {
  funnen: string;
  kvittens?: Kvittens;
}

interface Kofil {
  syfte: string;
  kord: string;
  fynd: Korad[];
}

const flagga = (namn: string): string | undefined => {
  const i = process.argv.indexOf(namn);
  return i === -1 ? undefined : process.argv[i + 1];
};
const finns = (namn: string): boolean => process.argv.includes(namn);

const idag = (): string => svenskDag();

const lasKo = (): Kofil =>
  existsSync(koFil)
    ? (JSON.parse(readFileSync(koFil, "utf8")) as Kofil)
    : { syfte: SYFTE, kord: idag(), fynd: [] };

const skrivKo = (ko: Kofil): void => {
  writeFileSync(koFil, JSON.stringify(ko, null, 2) + "\n");
};

const loften: ParitetsLofte[] = JSON.parse(readFileSync(resolve(rot, "data/promises.json"), "utf8"));
const fynd = paritetsfynd(loften);
const ko = lasKo();
const tidigare = new Map(ko.fynd.map((f) => [f.nyckel, f]));

// --- kvittering ------------------------------------------------------------

const kvitteraNyckel = flagga("--kvittera");
if (kvitteraNyckel !== undefined) {
  const utfall = flagga("--utfall") as Kvittensutfall | undefined;
  const skal = flagga("--skal");
  if (utfall === undefined || !UTFALL.includes(utfall)) {
    console.error(`--utfall måste vara ett av: ${UTFALL.join(", ")}`);
    process.exit(1);
  }
  if (!skal || skal.trim().length < 10) {
    console.error("--skal saknas. En kvittens utan skäl säger bara att någon tryckt på knappen.");
    process.exit(1);
  }
  const rad = tidigare.get(kvitteraNyckel);
  if (!rad) {
    console.error(`${kvitteraNyckel} står inte i kön. Kör med --skriv först, eller kontrollera nyckeln.`);
    process.exit(1);
  }
  rad.kvittens = { utfall, skal: skal.trim(), datum: idag() };
  ko.kord = idag();
  skrivKo(ko);
  console.log(`${kvitteraNyckel} kvitterad som ${utfall}.`);
  process.exit(0);
}

// --- svep ------------------------------------------------------------------

const kvittenser = new Map<string, Kvittens>(
  ko.fynd.flatMap((f) => (f.kvittens ? [[f.nyckel, f.kvittens] as [string, Kvittens]] : [])),
);
const oppna = okvitterade(fynd, kvittenser);
const vantar = vantarPaBeslut(fynd, kvittenser);
const nya = fynd.filter((f) => !tidigare.has(f.nyckel));
const nyckelIdag = new Set(fynd.map((f) => f.nyckel));
const borta = ko.fynd.filter((f) => !nyckelIdag.has(f.nyckel));

console.log(
  `Paritetssvepet: ${fynd.length} par, ${oppna.length} okvitterade, ${vantar.length} väntar på beslut, ${nya.length} nya sedan förra körningen.`,
);
for (const f of vantar) console.log(`  VÄNTAR ${f.nyckel} — ${kvittenser.get(f.nyckel)!.skal}`);
if (borta.length > 0) {
  console.log(`${borta.length} par matchar inte längre — löftet är omskrivet, prissatt eller tillbakadraget.`);
  for (const f of borta) console.log(`  BORTA ${f.nyckel} «${f.nollat_rubrik}»`);
}
console.log("");
for (const f of oppna) {
  const per = f.period === "per_ar" ? "/år" : "";
  console.log(`${String(f.msek_base).padStart(6)} msek${per}  ${f.nyckel}${nya.some((n) => n.nyckel === f.nyckel) ? "  NY" : ""}`);
  console.log(`        noll  ${f.nollat_partier.join(",")}  «${f.nollat_rubrik}»`);
  console.log(`        pris  ${f.prissatt_partier.join(",")}  «${f.prissatt_rubrik}»`);
  console.log(`        delar ${f.delade_ord.join(", ")} (rubriklikhet ${f.rubriklikhet})`);
}

if (finns("--skriv")) {
  ko.syfte = SYFTE;
  ko.kord = idag();
  ko.fynd = fynd.map((f) => {
    const gammal = tidigare.get(f.nyckel);
    return { ...f, funnen: gammal?.funnen ?? idag(), ...(gammal?.kvittens ? { kvittens: gammal.kvittens } : {}) };
  });
  skrivKo(ko);
  console.log(`\nkön → ${koFil}`);
}
