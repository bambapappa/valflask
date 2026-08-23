/**
 * Byter rubrik på redan publicerade löften — en läst hög i en körning.
 *
 *   pnpm rubrik-byt -- <fil>                       # torrkörning, alltid först
 *   pnpm rubrik-byt -- <fil> --skriv --varfor "…"
 *
 * En rad per byte, tre fält åtskilda av tabb:
 *
 *   p-2026-2357<TAB>Göra den utflyttade trålgränsen permanent<TAB>rubriken beskrev en annan åtgärd än citatet
 *
 * Rader som börjar med # är kommentarer. Faller en enda rad skrivs ingenting —
 * en halv verkställighet syns inte.
 *
 * **Skriptet väljer aldrig rubrik.** Det prövar den som skrivits: att posten
 * finns och är aktiv, att rubriken är ny och inte bär en intern beteckning,
 * och att den har täckning i citatet. Vilken rubrik citatet förtjänar är en
 * läsning, och den ska vara gjord innan raden skrivs.
 *
 * Körningen avslutas med vilka löften som nu är OPRÖVADE. Rubriken ingår i
 * prövningens nyckel, så varje byte river prövningen under posten. Skriv de
 * nya prövningarna i samma session, annars fäller provningsstatusens tak.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeDataHash, type ChangelogEntry } from "../src/publish.ts";
import { provaRad, tillampa, type Rubrikpost, type Rubrikrad } from "../src/rubrikbyte.ts";
import { svenskDag } from "../src/dagen.ts";

const DATA = join(import.meta.dirname, "../../data");
const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
const varde = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const varfor = varde("--varfor");
const fil = argv.find((a) => !a.startsWith("--") && a !== varfor);
const datum = svenskDag();

if (!fil) {
  console.error("Ange en fil: <id>\\t<ny rubrik>\\t<skäl>. Se skriptets huvud.");
  process.exit(1);
}

const rader: Rubrikrad[] = readFileSync(fil, "utf8")
  .split("\n")
  .map((r) => r.replace(/\r$/u, ""))
  .filter((r) => r.trim() !== "" && !r.startsWith("#"))
  .map((r) => {
    const [id, rubrik, skal] = r.split("\t");
    return { id: (id ?? "").trim(), rubrik: (rubrik ?? "").trim(), skal: (skal ?? "").trim() };
  });

const loften = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Rubrikpost[];
const karta = new Map(loften.map((p) => [p.id, p]));

const fel: string[] = [];
for (const rad of rader) fel.push(...provaRad(rad, karta).fel);

for (const rad of rader) {
  const p = karta.get(rad.id);
  console.log(`${rad.id}`);
  console.log(`     före:  ${p?.title ?? "—"}`);
  console.log(`     efter: ${rad.rubrik}`);
  console.log(`     skäl:  ${rad.skal}`);
  console.log();
}

if (fel.length > 0) {
  console.error(`FÄLLDA RADER (${fel.length}) — ingenting skrivet:`);
  for (const f of fel) console.error(`  · ${f}`);
  process.exit(1);
}

console.log(`${rader.length} byten`);

if (!skriv) {
  console.log("\nIngenting skrivet. Kör med --skriv för att verkställa.");
  process.exit(0);
}
if (!varfor) {
  console.error("\n--skriv kräver --varfor: rättelseloggen ska säga varför högen lästes.");
  process.exit(1);
}

const nya = loften.map((p) => {
  const rad = rader.find((r) => r.id === p.id);
  return rad ? tillampa(p, rad) : p;
});

const rattelser = JSON.parse(readFileSync(join(DATA, "rattelser.json"), "utf8")) as unknown[];
// Fälten är `date`/`affects`/`what`/`why` och inget annat: `rattelsenoter.ts`
// läser `affects` med `.includes()` och `.match()`, och en post med ett eget
// schema kraschar grinden i stället för att bara saknas. Kostade en röd
// körning 2026-08-23.
rattelser.push({
  date: datum,
  affects: `Löftessidorna för ${rader.map((r) => r.id).join(", ")}`,
  // `affects` får bära beteckningarna — noten slår upp sina sidor på dem.
  // `what` är prosa som möter läsaren, och där är de förbjudna (F4/F5).
  // Rubriken före och efter räcker för att säga vad som ändrats.
  what: rader
    .map((r) => `Rubriken «${karta.get(r.id)?.title ?? "—"}» är utbytt mot «${r.rubrik}» — ${r.skal}.`)
    .join(" "),
  why: varfor,
  commit: "0000000",
});

const changelog = JSON.parse(readFileSync(join(DATA, "changelog.json"), "utf8")) as ChangelogEntry[];
changelog.push({
  run_id: `rubrik-byt-${datum}`,
  added: [],
  updated: rader.map((r) => r.id),
  retracted: [],
  data_hash: computeDataHash(nya),
  timestamp: new Date().toISOString(),
});

writeFileSync(join(DATA, "promises.json"), JSON.stringify(nya, null, 2) + "\n");
writeFileSync(join(DATA, "rattelser.json"), JSON.stringify(rattelser, null, 2) + "\n");
writeFileSync(join(DATA, "changelog.json"), JSON.stringify(changelog, null, 2) + "\n");

console.log("\nSkrivet: data/promises.json, data/rattelser.json, data/changelog.json");
console.log("\nOPRÖVADE efter bytet — rubriken ingår i prövningens nyckel:");
for (const r of rader) console.log(`  · ${r.id}  «${r.rubrik}»`);
console.log("\nSkriv de nya prövningarna i samma session. Annars fäller provningsstatusens tak.");
console.log("Kvar att göra för hand: backfilla commit-hashen i rättelseposten (andra commiten).");
