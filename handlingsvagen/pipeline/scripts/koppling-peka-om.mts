/**
 * Pekar om publicerade kopplingar till ett annat löfte i samma grupp.
 *
 * Behovet uppstår när ett löfte dras in som ett annat löftes dubblett. Beviset
 * är inte fel — bara bokfört på fel post. Drar man in kopplingen i stället för
 * att flytta den slutar en riktig riksdagshandling räknas som att partiet
 * agerat på sin egen politik. Reglerna, och skälet till grupplåset, ligger i
 * `src/ompekning.ts` och prövas av testsviten.
 *
 *   npm run peka-om -- <fil>            # torrkörning, alltid först
 *   npm run peka-om -- <fil> --skriv
 *
 * En rad per koppling, fälten åtskilda av tabb:
 *
 *   k-2026-0415<TAB>p-2026-0349<TAB>Samma politik som det indragna löftet, …
 *
 * **Faller en enda rad skrivs ingenting.** En halvt verkställd flytt lämnar
 * rutnätet i ett läge ingen har beslutat om — samma regel som indragningen.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { KopplingPost } from "../src/granskning.ts";
import {
  provaOmpekning,
  pekaOm,
  malUtanKvarvarandeKoppling,
  type LoftesUppgift,
  type Ompekningsrad,
} from "../src/ompekning.ts";

const rot = resolve(import.meta.dirname, "../..");
const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
const fil = argv.find((a) => !a.startsWith("--"));
const datum = new Date().toISOString().slice(0, 10);

if (fil === undefined) {
  console.error("Ange en fil med rader: <koppling-id>\\t<löfte-id>\\t<skäl>. Se skriptets huvud.");
  process.exit(1);
}
if (!existsSync(fil)) {
  console.error(`Filen ${fil} finns inte.`);
  process.exit(1);
}

const kopplingsfil = resolve(rot, "data/kopplingar.json");
const loftesfil = resolve(rot, "../data/promises.json");
const kopplingar = JSON.parse(readFileSync(kopplingsfil, "utf8")) as KopplingPost[];
const loften = JSON.parse(readFileSync(loftesfil, "utf8")) as LoftesUppgift[];

const kopplingPerId = new Map(kopplingar.map((k) => [k.id, k]));
const loftePerId = new Map(loften.map((p) => [p.id, p]));

const rader: Ompekningsrad[] = readFileSync(fil, "utf8")
  .split("\n")
  .map((r) => r.trim())
  .filter((r) => r !== "" && !r.startsWith("#"))
  .map((r) => {
    const [id, till, ...resten] = r.split("\t");
    return { id: (id ?? "").trim(), till: (till ?? "").trim(), skal: resten.join("\t").trim() };
  });

if (rader.length === 0) {
  console.error("Filen innehåller inga rader.");
  process.exit(1);
}

const fel: string[] = [];
for (const rad of rader) {
  const k = kopplingPerId.get(rad.id);
  const fran = k?.promise_id === undefined ? undefined : loftePerId.get(k.promise_id);
  const prov = provaOmpekning(k, fran, loftePerId.get(rad.till), kopplingar, rad);
  fel.push(...prov.fel);
}

if (fel.length > 0) {
  console.error(`${fel.length} rad(er) går inte att verkställa. Ingenting skrivs.\n`);
  for (const f of fel) console.error(`  ${f}`);
  process.exit(1);
}

const flyttas = new Map(rader.map((r) => [r.id, r.till]));
const tomma = malUtanKvarvarandeKoppling(kopplingar, flyttas);

console.log(`${rader.length} koppling(ar) pekas om:\n`);
for (const rad of rader) {
  const k = kopplingPerId.get(rad.id)!;
  console.log(`  ${rad.id}  ${k.promise_id} → ${rad.till}   (handling ${k.handling_id})`);
  console.log(`     ${rad.skal}`);
}

if (tomma.length > 0) {
  console.log(
    `\nLöften som mister sin sista aktiva koppling: ${tomma.join(", ")}.` +
      "\nDeras rader försvinner ur rutnätet. Kör om `npm run domar` och namnge de fallna" +
      "\nbedömningarna i rättelseposten.",
  );
}

if (!skriv) {
  console.log("\nTorrkörning. Lägg till --skriv för att verkställa.");
  process.exit(0);
}

const nya = kopplingar.map((k) => {
  const rad = rader.find((r) => r.id === k.id);
  return rad === undefined ? k : pekaOm(k, rad.till, rad.skal, datum);
});
writeFileSync(kopplingsfil, `${JSON.stringify(nya, null, 2)}\n`);
console.log(`\nSkrivet till ${kopplingsfil}.`);
console.log("Kör `npm run domar -- --promises ../../data/promises.json` innan du committar.");
