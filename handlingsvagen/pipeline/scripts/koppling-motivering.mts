/**
 * Skriver om motiveringen på redan publicerade kopplingar, en läst hög i taget.
 *
 * Motiveringen står intill citatet i rutnätet: skrivs den om utan spår är det
 * en tyst rättelse. Reglerna ligger i `src/motiveringsbyte.ts` och prövas av
 * testsviten.
 *
 *   npm run motivering -- <fil>            # torrkörning, alltid först
 *   npm run motivering -- <fil> --skriv --varfor "…"
 *
 * En rad per koppling, tre fält åtskilda av tabb:
 *
 *   k-2026-0308<TAB>Motionen föreslår …<TAB>motiveringen sa «rejält», motionen säger 400 kr
 *
 * Tredje fältet är skälet: vad läsningen fann. Det går in i rättelseloggen,
 * aldrig i motiveringen. Rader som börjar med # är kommentarer.
 *
 * **Faller en enda rad skrivs ingenting.** En halvt verkställd genomgång
 * lämnar rutnätet i ett läge ingen har beslutat om.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { KopplingPost } from "../src/granskning.ts";
import { bytMotivering, provaMotivering, rattelsePost, type Motiveringsrad } from "../src/motiveringsbyte.ts";

const rot = resolve(import.meta.dirname, "../..");
const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
const varde = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const varfor = varde("--varfor");
const fil = argv.find((a) => !a.startsWith("--") && a !== varfor);
const datum = new Date().toISOString().slice(0, 10);

if (fil === undefined) {
  console.error("Ange en fil med rader: <koppling-id>\\t<ny motivering>\\t<skäl>. Se skriptets huvud.");
  process.exit(1);
}

const rader: Motiveringsrad[] = readFileSync(resolve(fil), "utf8")
  .split("\n")
  .map((r) => r.replace(/\r$/u, ""))
  .filter((r) => r.trim() !== "" && !r.startsWith("#"))
  .map((r) => {
    const [id, motivering, skal] = r.split("\t");
    return { id: (id ?? "").trim(), motivering: (motivering ?? "").trim(), skal: (skal ?? "").trim() };
  });

if (rader.length === 0) {
  console.error("Filen innehåller inga rader.");
  process.exit(1);
}

const kopplingarPath = resolve(rot, "data/kopplingar.json");
const kopplingar: KopplingPost[] = JSON.parse(readFileSync(kopplingarPath, "utf8"));
const perId = new Map(kopplingar.map((k) => [k.id, k]));

const fel: string[] = [];
const sedda = new Set<string>();
for (const rad of rader) {
  if (sedda.has(rad.id)) fel.push(`${rad.id} står två gånger i filen`);
  sedda.add(rad.id);
  fel.push(...provaMotivering(perId.get(rad.id), rad).fel);
}

for (const rad of rader) {
  const k = perId.get(rad.id);
  console.log(`\n${rad.id}  ${k?.promise_id ?? "—"}`);
  console.log(`  före : ${(k?.method_note ?? "").slice(0, 160)}`);
  console.log(`  efter: ${rad.motivering.slice(0, 160)}`);
  console.log(`  skäl : ${rad.skal}`);
}

if (fel.length > 0) {
  console.error(`\n${fel.length} rad(er) håller inte. Ingenting skrivet:`);
  for (const f of fel) console.error(`  · ${f}`);
  process.exit(1);
}

console.log(`\n${rader.length} motiveringar att skriva om.`);

if (!skriv) {
  console.log("\nIngenting skrivet. Kör med --skriv för att verkställa.");
  process.exit(0);
}
if (!varfor) {
  console.error("\n--varfor krävs vid --skriv: rättelseloggen ska förklara varför, inte bara vad.");
  process.exit(1);
}

const loften = new Set<string>();
const nya = kopplingar.map((k) => {
  const rad = rader.find((r) => r.id === k.id);
  if (rad === undefined) return k;
  if (k.promise_id) loften.add(k.promise_id);
  return bytMotivering(k, rad);
});
writeFileSync(kopplingarPath, JSON.stringify(nya, null, 2) + "\n");

const rattelserPath = resolve(rot, "data/rattelser.json");
const rattelser: unknown[] = existsSync(rattelserPath)
  ? JSON.parse(readFileSync(rattelserPath, "utf8"))
  : [];
rattelser.push(rattelsePost(rader, [...loften].sort(), datum, varfor));
writeFileSync(rattelserPath, JSON.stringify(rattelser, null, 2) + "\n");

console.log(`\nSkrivet: data/kopplingar.json — ${rader.length} motiveringar omskrivna`);
console.log("Skrivet: data/rattelser.json — en post för hela genomgången");
console.log("\nKvar att göra för hand: backfilla commit-hashen i rättelseposten (andra commiten).");
