/**
 * Betar av ankarskulden, ett läst pass i taget.
 *
 *   pnpm ankarpasset -- <fil>                       # torrkörning, alltid först
 *   pnpm ankarpasset -- <fil> --skriv --varfor "…"
 *
 * En rad per löfte, fyra fält åtskilda av tabb:
 *
 *   p-2026-2485<TAB>ankare<TAB>p-2026-0578<TAB>uträkningen namnger SD:s löfte om…
 *   p-2026-2857<TAB>grupp<TAB>g-p-2026-0017<TAB>samma reform som…, dubbelräknad
 *   p-2026-2504<TAB>egen<TAB>Ny uträkning …<TAB>ingen jämförelse går att peka ut
 *
 * `egen` tar ett femte fält: en ny metodnot, när den gamla bär samma ogrundade
 * påstående som uträkningen. Noten står intill uträkningen på löftessidan.
 *
 * Skriptet VÄLJER ALDRIG ett ankare. Det prövar det som skrivits: att målet
 * finns, är aktivt, inte är posten själv och inte lånar tillbaka. Vilket löfte
 * uträkningen menade är en läsning, och den ska vara gjord innan raden skrivs.
 *
 * Faller en enda rad skrivs ingenting.
 *
 * Kör `pnpm ankarsvepet -- --beroende <id>` före ett pass som rör ett löfte
 * andra lånar av.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeDataHash } from "../src/publish.ts";
import { ankarbrott } from "../src/ankarkravet.ts";
import { provaRad, tillampa, type Ankarrad, type Lofte, type Utfall } from "../src/ankarpasset.ts";
import { svenskDag } from "../src/dagen.ts";

const ROT = join(import.meta.dirname, "../..");
const DATA = join(ROT, "data");
const FACIT = join(ROT, "pipeline/facit/ankarskulden.json");

const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
const varde = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const varfor = varde("--varfor");
const fil = argv.find((a) => !a.startsWith("--") && a !== varfor);
const datum = svenskDag();

if (!fil) {
  console.error("Ange en fil: <id>\\t<ankare|grupp|egen>\\t<värde>\\t<skäl>. Se skriptets huvud.");
  process.exit(1);
}

const rader: Ankarrad[] = readFileSync(fil, "utf8")
  .split("\n")
  .map((r) => r.replace(/\r$/u, ""))
  .filter((r) => r.trim() !== "" && !r.startsWith("#"))
  .map((r) => {
    const [id, utfall, v, skal, metodnot] = r.split("\t");
    return {
      id: (id ?? "").trim(),
      utfall: ((utfall ?? "").trim() as Utfall),
      varde: (v ?? "").trim(),
      skal: (skal ?? "").trim(),
      ...(metodnot?.trim() ? { metodnot: metodnot.trim() } : {}),
    };
  });

if (rader.length === 0) {
  console.error("Filen innehåller inga rader.");
  process.exit(1);
}

const loften: Lofte[] = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8"));
const perId = new Map(loften.map((l) => [l.id, l]));
const skuld = JSON.parse(readFileSync(FACIT, "utf8")) as { ids: string[]; count: number; [k: string]: unknown };
const iSkulden = new Set(skuld.ids);

const fel: string[] = [];
const sedda = new Set<string>();
for (const rad of rader) {
  if (sedda.has(rad.id)) fel.push(`${rad.id} står två gånger i filen`);
  sedda.add(rad.id);
  if (!["ankare", "grupp", "egen"].includes(rad.utfall)) {
    fel.push(`${rad.id}: okänt utfall "${rad.utfall}" — ankare, grupp eller egen`);
    continue;
  }
  if (!iSkulden.has(rad.id)) fel.push(`${rad.id} står inte i ankarskulden`);
  fel.push(...provaRad(rad, perId).fel);
}

for (const rad of rader) {
  const p = perId.get(rad.id);
  console.log(`\n${rad.id}  ${rad.utfall}  →  ${rad.varde.slice(0, 90)}`);
  if (rad.utfall === "ankare") {
    for (const m of rad.varde.split(",").map((s) => s.trim())) {
      const t = perId.get(m);
      console.log(`     ${m}  ${t?.cost.msek_base ?? "?"} msek  ${(t?.title ?? "").slice(0, 60)}`);
    }
    console.log(`     posten själv: ${p?.cost.msek_base ?? "?"} msek`);
  }
  console.log(`     skäl: ${rad.skal}`);
}

if (fel.length > 0) {
  console.error(`\n${fel.length} rad(er) håller inte. Ingenting skrivet:`);
  for (const f of fel) console.error(`  · ${f}`);
  process.exit(1);
}

console.log(`\n${rader.length} poster · skulden ${skuld.count} → ${skuld.count - rader.length}`);

if (!skriv) {
  console.log("\nIngenting skrivet. Kör med --skriv för att verkställa.");
  process.exit(0);
}
if (!varfor) {
  console.error("\n--varfor krävs vid --skriv: rättelseloggen ska förklara varför, inte bara vad.");
  process.exit(1);
}

const nya = loften.map((l) => {
  const rad = rader.find((r) => r.id === l.id);
  return rad ? tillampa(l, rad) : l;
});
writeFileSync(join(DATA, "promises.json"), JSON.stringify(nya, null, 2) + "\n");

// Skulden krymper med exakt de poster som lämnat den — mätt om, inte antaget.
const kvar = ankarbrott(nya as never[]);
const lamnade = skuld.ids.filter((id) => !kvar.includes(id));
skuld.ids = skuld.ids.filter((id) => kvar.includes(id));
skuld.count = skuld.ids.length;
writeFileSync(FACIT, JSON.stringify(skuld, null, 2) + "\n");

// Hashen i sista changelog-posten ska beskriva filen som ligger där.
const changelogPath = join(DATA, "changelog.json");
const changelog = JSON.parse(readFileSync(changelogPath, "utf8")) as Array<Record<string, unknown>>;
changelog[changelog.length - 1]!["data_hash"] = computeDataHash(nya);
writeFileSync(changelogPath, JSON.stringify(changelog, null, 2) + "\n");

const rattelserPath = join(DATA, "rattelser.json");
const rattelser = JSON.parse(readFileSync(rattelserPath, "utf8")) as unknown[];
const perUtfall = (u: Utfall) => rader.filter((r) => r.utfall === u).length;
rattelser.push({
  date: datum,
  affects: `Löftessidorna för ${rader.map((r) => r.id).sort().join(", ")} — uträkningens grund`,
  what:
    `${rader.length} uträkningar som lånade ett belopp ur ett annat löfte har fått sin grund ` +
    `utskriven: ${perUtfall("ankare")} pekar nu ut löftet de lånar av, ${perUtfall("grupp")} visade sig vara ` +
    `samma reform och räknas nu en gång, och ${perUtfall("egen")} har fått en uträkning som står på egen ` +
    "aritmetik. Inget basbelopp har ändrats av själva kopplingen.",
  why: varfor,
  commit: "0000000",
});
writeFileSync(rattelserPath, JSON.stringify(rattelser, null, 2) + "\n");

console.log(`\nSkrivet: data/promises.json, pipeline/facit/ankarskulden.json, data/changelog.json, data/rattelser.json`);
console.log(`Skulden: ${skuld.count} kvar (${lamnade.length} lämnade listan)`);
console.log("\nKvar att göra för hand: backfilla commit-hashen i rättelseposten (andra commiten).");
