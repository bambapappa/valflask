/**
 * Byter uträkning på redan publicerade löften — en läst hög i en körning.
 *
 *   pnpm utrakning-byt -- <fil>                       # torrkörning, alltid först
 *   pnpm utrakning-byt -- <fil> --skriv --varfor "…"
 *
 * En rad per byte, tre fält åtskilda av tabb:
 *
 *   p-2026-1616<TAB>~250 000 barn × 2 000 kr …<TAB>sista meningen var ett äldre utkast
 *
 * Rader som börjar med # är kommentarer. Faller en enda rad skrivs ingenting.
 *
 * **BELOPPET RÖRS ALDRIG.** Verktyget rättar texten om ett tal, inte talet. Ska
 * summan flyttas är det ett annat beslut med andra spärrar — `ankarsattning`
 * eller `regelnollning`, som mäter vad ändringen gör med partiets och rikets
 * summor. Här står låg, bas och hög stilla, och provet i `utrakningsbyte.ts`
 * låser fast att den nya texten LEDER FRAM TILL det publicerade basbeloppet.
 *
 * **Skriptet skriver aldrig uträkningen.** Det prövar den som skrivits. Vad
 * citatet och källan förtjänar för resonemang är en läsning, och den ska vara
 * gjord innan raden skrivs.
 *
 * Till skillnad från rubrikbytet river det här ingen prövning: uträkningen står
 * inte i prövningens NYCKEL. Men den står i `kanon()`, så prövningen beskriver
 * en äldre version efteråt — kör svepet och skriv om prövningen i samma pass.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeDataHash, type ChangelogEntry } from "../src/publish.ts";
import { lasOrsak, ORSAKKODER } from "../src/orsakkoder.ts";
import { svenskDag } from "../src/dagen.ts";
import {
  provaUtrakningsrad,
  tillampa,
  type Utrakningspost,
  type Utrakningsrad,
} from "../src/utrakningsbyte.ts";

const DATA = join(import.meta.dirname, "../../data");
const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
const varde = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const varfor = varde("--varfor");
const fil = argv.find((a) => !a.startsWith("--") && a !== varfor);
const datum = svenskDag();

if (!fil) {
  console.error("Ange en fil: <id>\\t<ny uträkning>\\t<skäl>. Se skriptets huvud.");
  process.exit(1);
}

// En rättelsepost ska bära sin orsak. Kravet lades 2026-09-02 på de fyra
// verktyg som då skrev rättelser, men det här skriver också en — och luckan
// syntes först när grinden fällde den första posten som gick igenom här.
const orsakArg = lasOrsak(process.argv);
if (skriv && orsakArg === null) {
  console.error("En rättelsepost kräver --orsak med en av koderna (grind: rattelseschema.test.ts):");
  for (const k of ORSAKKODER) console.error(`  · ${k}`);
  process.exit(1);
}

const rader: Utrakningsrad[] = readFileSync(fil, "utf8")
  .split("\n")
  .map((r) => r.replace(/\r$/u, ""))
  .filter((r) => r.trim() !== "" && !r.startsWith("#"))
  .map((r) => {
    const [id, utrakning, ...resten] = r.split("\t");
    return { id: (id ?? "").trim(), utrakning: (utrakning ?? "").trim(), skal: resten.join("\t").trim() };
  });

const loften = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Utrakningspost[];
const karta = new Map(loften.map((p) => [p.id, p]));

const fel: string[] = [];
for (const rad of rader) fel.push(...provaUtrakningsrad(rad, karta).fel);

for (const rad of rader) {
  const p = karta.get(rad.id);
  const c = p?.cost;
  console.log(`${rad.id}  ${c?.msek_low}/${c?.msek_base}/${c?.msek_high} — beloppet står stilla`);
  console.log(`     före:  ${(c?.calculation ?? "—").slice(0, 200)}`);
  console.log(`     efter: ${rad.utrakning.slice(0, 200)}`);
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
// Fälten är `date`/`affects`/`what`/`why`/`orsak` och inget annat — se rubrik-byt.
rattelser.push({
  date: datum,
  affects: `Löftessidorna för ${rader.map((r) => r.id).join(", ")}`,
  // `what` möter läsaren och får inte bära beteckningar. Att beloppet står
  // stilla är det viktigaste att säga: en läsare som ser uträkningen ändrad
  // ska veta att prislappen inte rörts.
  what:
    `${rader.length} löften har fått uträkningen omskriven. Beloppen är oförändrade — ` +
    `det är bara texten som förklarar hur de räknats fram som ändrats. ` +
    rader.map((r) => r.skal.replace(/\.?$/u, ".")).join(" "),
  why: varfor,
  orsak: orsakArg,
  commit: "0000000",
});

const changelog = JSON.parse(readFileSync(join(DATA, "changelog.json"), "utf8")) as ChangelogEntry[];
changelog.push({
  run_id: `utrakning-byt-${datum}`,
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
console.log("\nUträkningen står i kanon — prövningarna beskriver nu en äldre version:");
for (const r of rader) console.log(`  · ${r.id}`);
console.log("Kör svepet och skriv om prövningarna i samma pass.");
console.log("Kvar att göra för hand: backfilla commit-hashen i rättelseposten (andra commiten).");
