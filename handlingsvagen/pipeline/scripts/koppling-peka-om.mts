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
 * **Faller en enda rad skrivs ingenting.** Koppling och synlig rättelse
 * skrivs i samma återställbara filpaket.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  provaOmpekningslista,
  pekaOm,
  malUtanKvarvarandeKoppling,
  type LoftesUppgift,
  type Ompekningsrad,
} from "../src/ompekning.ts";
import { svenskDag } from "../../../pipeline/src/dagen.ts";
import { lasKopplingsrattelselage, skrivKopplingsrattelse } from "../src/kopplingsrattelse.ts";

const rot = resolve(import.meta.dirname, "../..");
const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
const fil = argv.find((a) => !a.startsWith("--"));
const datum = svenskDag();

if (fil === undefined) {
  console.error("Ange en fil med rader: <koppling-id>\\t<löfte-id>\\t<skäl>. Se skriptets huvud.");
  process.exit(1);
}
if (!existsSync(fil)) {
  console.error(`Filen ${fil} finns inte.`);
  process.exit(1);
}

const dataDir = resolve(rot, "data");
const loftesfil = resolve(rot, "../data/promises.json");
const { fore: filfore, kopplingar, rattelser } = lasKopplingsrattelselage(dataDir);
const loftesText = readFileSync(loftesfil, "utf8");
const loften = JSON.parse(loftesText) as LoftesUppgift[];

const kopplingPerId = new Map(kopplingar.map((k) => [k.id, k]));

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

const fel = provaOmpekningslista(kopplingar, loften, rader);

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

// Gruppen och målet får inte ändras under den här körningens prövning.
if (readFileSync(loftesfil, "utf8") !== loftesText) {
  throw new Error("Löftesbeståndet ändrades under ompekningen — kör om från början");
}
const radPerId = new Map(rader.map((r) => [r.id, r]));
const nya = kopplingar.map((k) => {
  const rad = radPerId.get(k.id);
  return rad === undefined ? k : pekaOm(k, rad.till, rad.skal, datum);
});
const berorda = new Set<string>();
for (const rad of rader) {
  const fran = kopplingPerId.get(rad.id)?.promise_id;
  if (fran) berorda.add(fran);
  berorda.add(rad.till);
}
rattelser.push({
  date: datum,
  affects: `Handlingsvågens rutnät och löftessidorna för ${[...berorda].sort().join(", ")} — ${rader.length} kopplingar har pekats om.`,
  what: `${rader.length} publicerade kopplingar har flyttats till andra löften inom samma dokumenterade grupp. Handling, citat och riktning är oförändrade; tidigare och nytt löfte står på varje koppling.`,
  why: rader.map((r) => r.skal).join(" "),
  commit: "0000000",
});
skrivKopplingsrattelse(dataDir, filfore, nya, rattelser);
console.log(`\nSkrivet: data/kopplingar.json — ${rader.length} kopplingar ompekade`);
console.log("Skrivet: data/rattelser.json — en post för hela genomgången");
console.log("Kör `npm run domar -- --promises ../../data/promises.json` innan du committar.");
