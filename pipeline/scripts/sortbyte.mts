/**
 * Byter sort på ett löfte — `loftestyp` — och skriver om uträkningen.
 *
 *   pnpm sortbyte -- <fil>                       # torrkörning, alltid först
 *   pnpm sortbyte -- <fil> --skriv --varfor "…"
 *
 * En rad per löfte, fyra fält åtskilda av tabb:
 *
 *   p-2026-0625<TAB>reform<TAB>Ny uträkning …<TAB>citatet pekar ut en bestämd åtgärd
 *
 * VARFÖR SORTEN ÄR EN EGEN SAK. `loftestyp` sattes maskinellt ur citat och
 * prissättning: ett löfte utan belopp blev inriktning. Det gör två fel möjliga
 * samtidigt, och de ska inte förväxlas.
 *
 *   Beloppet kan vara fel — då är det `regelnollning` eller ett ankare.
 *   SORTEN kan vara fel medan beloppet är rätt — och det är vad det här är.
 *
 * En regeländring pekar ut en bestämd åtgärd och är alltså en reform, men dess
 * direkta statliga kostnad är ändå noll enligt kostnadsreglerna. Att den stod
 * som inriktning var en följd av att den var nollad, inte av vad citatet säger.
 * Sorten styr sedan 2026-08-22 även kopplingssteget, så ett fel här fortplantar
 * sig till Handlingsvågen.
 *
 * **Ett inriktningslöfte får aldrig bära ett basbelopp**, och `loftestyp.test.ts`
 * vaktar det. Skriptet vägrar därför byta TILL inriktning på en post med belopp.
 *
 * Beloppet rörs aldrig här. Faller en enda rad skrivs ingenting.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeDataHash, type ChangelogEntry } from "../src/publish.ts";
import { svenskDag } from "../src/dagen.ts";
import { provaSortrad, tillampa, type Sortlofte as Lofte, type Sortrad as Rad } from "../src/sortbyte.ts";

const DATA = join(import.meta.dirname, "../../data");
const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
const varde = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const varfor = varde("--varfor");
const fil = argv.find((a) => !a.startsWith("--") && a !== varfor);
const datum = svenskDag();

if (!fil) {
  console.error("Ange en fil: <id>\\t<reform|inriktning>\\t<ny uträkning>\\t<skäl>.");
  process.exit(1);
}

const rader: Rad[] = readFileSync(fil, "utf8")
  .split("\n").map((r) => r.replace(/\r$/u, ""))
  .filter((r) => r.trim() !== "" && !r.startsWith("#"))
  .map((r) => { const [id, sort, utrakning, skal] = r.split("\t");
    return { id: (id ?? "").trim(), sort: (sort ?? "").trim(), utrakning: (utrakning ?? "").trim(), skal: (skal ?? "").trim() }; });

const loften = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Lofte[];
const karta = new Map(loften.map((p) => [p.id, p]));

const fel: string[] = [];
for (const rad of rader) fel.push(...provaSortrad(karta.get(rad.id), rad).fel);

for (const rad of rader) {
  const p = karta.get(rad.id);
  console.log(`${rad.id} [${(p?.parties ?? []).join(",")}] ${p?.loftestyp} → ${rad.sort}  (beloppet ${p?.cost?.msek_base} rörs inte)`);
  console.log(`     ${(p?.title ?? "").slice(0, 76)}`);
  console.log(`     skäl: ${rad.skal}`);
  console.log();
}

if (fel.length > 0) {
  console.error(`FÄLLDA RADER (${fel.length}) — ingenting skrivet:`);
  for (const f of fel) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`${rader.length} sortbyten`);
if (!skriv) { console.log("\nIngenting skrivet. Kör med --skriv för att verkställa."); process.exit(0); }
if (!varfor) { console.error("\n--skriv kräver --varfor."); process.exit(1); }

const nya = loften.map((p) => {
  const rad = rader.find((r) => r.id === p.id);
  return rad ? tillampa(p, rad, datum) : p;
});

const rattelser = JSON.parse(readFileSync(join(DATA, "rattelser.json"), "utf8")) as unknown[];
rattelser.push({
  date: datum,
  affects: `Löftessidorna för ${rader.map((r) => r.id).join(", ")}`,
  what:
    `${rader.length} löften har bytt sort utan att beloppet ändrats. ` +
    rader.map((r) => `${(karta.get(r.id)?.title ?? "").slice(0, 60)}: ${r.skal}.`).join(" "),
  why: varfor,
  commit: "0000000",
});
const changelog = JSON.parse(readFileSync(join(DATA, "changelog.json"), "utf8")) as ChangelogEntry[];
changelog.push({ run_id: `sortbyte-${datum}`, added: [], updated: rader.map((r) => r.id), retracted: [],
  data_hash: computeDataHash(nya), timestamp: new Date().toISOString() });

writeFileSync(join(DATA, "promises.json"), JSON.stringify(nya, null, 2) + "\n");
writeFileSync(join(DATA, "rattelser.json"), JSON.stringify(rattelser, null, 2) + "\n");
writeFileSync(join(DATA, "changelog.json"), JSON.stringify(changelog, null, 2) + "\n");
console.log("\nSkrivet: promises.json, rattelser.json, changelog.json");
console.log("Kvar: pnpm backfilla-commit, bygg om läskopian, och skriv nya prövningar — sorten ingår i kanon.");
