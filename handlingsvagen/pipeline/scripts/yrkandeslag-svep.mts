/**
 * Svepet som letar efter nästa lucka i yrkandeslagens mönster.
 *
 * Mönstren i `src/yrkandeslag.ts` avgör vad en motions yrkanden kan bära, och
 * ett mönster som missar en böjning flyttar hela motioner mellan klasserna. Den
 * luckan hittades en gång av en slump, mitt i en genomgång som vilade på
 * indelningen. Det här skriptet hittar den i stället genom att fråga.
 *
 * Frågan svepet ställer är omvänd mot mönstrens: **vilka lydelser klassas som
 * sakyrkanden fast de bär budgetramverkets ord?** Ett sakyrkande kan bära ett
 * enskilt löfte; ett ramverks-, anslags- eller inkomstberäkningsyrkande kan det
 * inte. Står utgiftstaket, anslagen eller inkomstberäkningen i en lydelse som
 * ändå kallas sakyrkande är antingen mönstret för trångt — eller lydelsen ett
 * verkligt sakyrkande som råkar nämna dem. Skriptet avgör inte vilket; det
 * lägger fram lydelserna för läsning.
 *
 *   npm run yrkandeslag-svep                      # hela motionsbeståndet
 *   npm run yrkandeslag-svep -- --motionstyp parti  # budgetmotionerna
 *   npm run yrkandeslag-svep -- --kopplade          # bara motioner med koppling
 *
 * Hämtningen går genom källcachen, så en omkörning frågar inte riksdagen igen.
 * Första körningen över hela beståndet tar en timme; `--motionstyp parti` tar
 * en minut och täcker de motioner där ramverket faktiskt bor.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Handling } from "../src/handlingar.ts";
import type { KopplingPost } from "../src/granskning.ts";
import { fetchYrkanden } from "../src/riksdagen.ts";
import { yrkandeslag, motionensSlag, type Motionsslag } from "../src/yrkandeslag.ts";
import { cachat, politeFetch } from "./kallcache.mts";

const rot = resolve(import.meta.dirname, "../..");
const argv = process.argv.slice(2);
const varde = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const motionstyp = varde("--motionstyp");
const baraKopplade = argv.includes("--kopplade");

/**
 * Budgetramverkets substantiv, utan verb.
 *
 * Mönstren i `yrkandeslag.ts` binder sak och verb tillsammans, och det var
 * verbet som svek. Svepet söker därför bara på saken: nämns utgiftstaket,
 * anvisas anslag, beräknas inkomster eller fördelas utgifter på utgiftsområden,
 * så ska lydelsen inte tyst hamna bland sakyrkandena.
 */
const RAMVERKETS_ORD =
  /utgiftstak|riktlinjer(?:na)? för den ekonomiska politiken|anvis\w*\s+anslag|beräkning\w*\s+av\s+(?:statens\s+)?inkomster(?:na)?|fördelning\w*\s+av\s+utgifter\s+på\s+utgiftsområden|utgiftsram/iu;

const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));
const kopplingar: KopplingPost[] = JSON.parse(readFileSync(resolve(rot, "data/kopplingar.json"), "utf8"));
const kopplade = new Set(kopplingar.map((k) => k.handling_id));

let motioner = handlingar.filter((h) => h.kind === "motion");
if (motionstyp !== undefined) {
  motioner = motioner.filter((h) => (h as { motionstyp?: string }).motionstyp === motionstyp);
}
if (baraKopplade) motioner = motioner.filter((h) => kopplade.has(h.id));

const dokIds = [...new Set(motioner.map((h) => h.dok_id))].filter((d) => d !== "");
console.error(`${dokIds.length} motionsdokument att svepa.`);

const perDok = new Map<string, string[]>();
let n = 0;
for (const dokId of dokIds) {
  const y = (await cachat(`yrkanden-${dokId}`, () => fetchYrkanden(politeFetch, dokId))) ?? [];
  perDok.set(dokId, y.map((x) => x.lydelse));
  if (++n % 500 === 0) console.error(`  ${n}/${dokIds.length}`);
}

// ─────────────────────────────────────────────────────────────── utskrift ──

const allaLydelser = [...perDok.values()].flat();
const unika = [...new Set(allaLydelser)];
console.log(
  `\n${perDok.size} motioner · ${allaLydelser.length} yrkanden · ${unika.length} skilda lydelser`,
);

console.log("\nYrkandena per slag:");
for (const slag of ["anslag", "ramverk", "inkomstberakning", "sak"] as const) {
  const antal = unika.filter((l) => yrkandeslag(l) === slag).length;
  console.log(`  ${slag.padEnd(18)} ${String(antal).padStart(5)}`);
}

console.log("\nMotionerna per slag:");
const perSlag = new Map<Motionsslag, number>();
for (const lydelser of perDok.values()) {
  const s = motionensSlag(lydelser);
  perSlag.set(s, (perSlag.get(s) ?? 0) + 1);
}
for (const [slag, antal] of [...perSlag].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${slag.padEnd(18)} ${String(antal).padStart(5)}`);
}

const luckor = unika.filter((l) => yrkandeslag(l) === "sak" && RAMVERKETS_ORD.test(l));
console.log(
  luckor.length === 0
    ? "\nIngen lydelse bär ramverkets ord och kallas ändå sakyrkande. Mönstren täcker beståndet."
    : `\n⚠ ${luckor.length} lydelser bär ramverkets ord men klassas som sakyrkanden — läs dem:`,
);
for (const l of luckor) {
  const dok = [...perDok].filter(([, ls]) => ls.includes(l)).map(([d]) => d);
  console.log(`\n  ${dok.join(" ")}\n    ${l.slice(0, 400)}`);
}
