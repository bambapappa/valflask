/**
 * Drar in publicerade kopplingar, en läst hög i taget.
 *
 * Att dra in ett publicerat belägg är en rättelse: kopplingen syns i rutnätet,
 * och försvinner den utan spår är det en tyst rättelse. Det har gjorts tre
 * gånger av tre olika skript som var och ett ägde sin egen genomgång, och det
 * fjärde tillfället är det här. Reglerna ligger i `src/indragning.ts` och
 * prövas av testsviten.
 *
 *   npm run dra-in -- <fil>            # torrkörning, alltid först
 *   npm run dra-in -- <fil> --skriv
 *
 * En rad per koppling, fälten åtskilda av tabb:
 *
 *   k-2026-0030<TAB>Motionens tre yrkanden gäller hörbarhet och textning, inte …
 *
 * Skälet står på den indragna posten och är det enda en granskare ser om hen
 * frågar varför ett belägg försvann. Det ska säga vad som lästes och vad
 * läsningen fann, i klarspråk och utan interna koder.
 *
 * **Faller en enda rad skrivs ingenting.** En halvt verkställd genomgång är
 * värre än ingen: rutnätet visar då ett läge ingen har beslutat om.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { KopplingPost } from "../src/granskning.ts";
import {
  provaIndragning,
  draIn,
  malUtanKvarvarandeKoppling,
  type Indragningsrad,
} from "../src/indragning.ts";
import { svenskDag } from "../../../pipeline/src/dagen.ts";

const rot = resolve(import.meta.dirname, "../..");
const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
const varde = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const anledning = varde("--anledning");
// Rättelsepostens `why` beskrev till 2026-08-22 bara EN sorts indragning: att
// citatet stod i brödtexten i stället för i yrkandet. Den förklaringen är fel
// för en indragning som gjorts av ett annat skäl — och en publik rättelselogg
// som förklarar fel sak är sämre än en som är kort. Skälet skrivs därför ut.
const varfor = varde("--varfor");
const fil = argv.find((a) => !a.startsWith("--") && a !== anledning && a !== varfor);
const datum = svenskDag();

if (fil === undefined) {
  console.error("Ange en fil med rader: <koppling-id>\\t<skäl>. Se skriptets huvud.");
  process.exit(1);
}

const rader: Indragningsrad[] = readFileSync(resolve(fil), "utf8")
  .split("\n")
  .map((r) => r.trim())
  .filter((r) => r !== "" && !r.startsWith("#"))
  .map((r) => {
    const [id, skal] = r.split("\t");
    return { id: (id ?? "").trim(), skal: (skal ?? "").trim() };
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
  fel.push(...provaIndragning(perId.get(rad.id), rad).fel);
}

for (const rad of rader) {
  const k = perId.get(rad.id);
  console.log(`\n${rad.id}  ${k?.promise_id ?? "—"}  ${k?.status ?? "?"}`);
  console.log(`  ${rad.skal}`);
}

const drasIn = new Set(rader.map((r) => r.id));
const utanKvar = malUtanKvarvarandeKoppling(kopplingar, drasIn);

console.log(`\n${rader.length} kopplingar att dra in.`);
if (utanKvar.length > 0) {
  console.log(
    `\n⚠ ${utanKvar.length} löfte(n) mister sitt sista belägg och försvinner ur rutnätet:\n` +
      `  ${utanKvar.join(", ")}\n` +
      "  Kör om domarna efteråt och namnge de bedömningar som föll i rättelseposten:\n" +
      "    npm run domar -- --promises ../../data/promises.json\n" +
      "    jämför mot git show HEAD:handlingsvagen/data/domar.json",
  );
}

if (fel.length > 0) {
  console.error(`\n${fel.length} rad(er) håller inte. Ingenting skrivet:`);
  for (const f of fel) console.error(`  · ${f}`);
  process.exit(1);
}

if (!skriv) {
  console.log("\nIngenting skrivet. Kör med --skriv för att verkställa.");
  process.exit(0);
}

const berorda = new Set<string>();
const nya = kopplingar.map((k) => {
  const rad = rader.find((r) => r.id === k.id);
  if (rad === undefined) return k;
  if (k.promise_id) berorda.add(k.promise_id);
  return draIn(k, rad.skal, datum);
});
writeFileSync(kopplingarPath, JSON.stringify(nya, null, 2) + "\n");

/** En rättelsepost för hela genomgången — rättelser samlas. */
const rattelserPath = resolve(rot, "data/rattelser.json");
const rattelser: unknown[] = existsSync(rattelserPath)
  ? JSON.parse(readFileSync(rattelserPath, "utf8"))
  : [];
rattelser.push({
  date: datum,
  affects:
    `Handlingsvågens rutnät och löftessidorna för ${[...berorda].sort().join(", ")} — ` +
    `${rader.length} kopplingar är tillbakadragna.` +
    (utanKvar.length > 0
      ? ` ${utanKvar.join(", ")} mister sitt sista belägg och försvinner ur rutnätet.`
      : ""),
  what:
    (anledning ??
      "Vi har läst varje handling mot det löfte kopplingen påstår att den gäller, och funnit att " +
        "handlingen inte bär löftet. Kopplingarna är tillbakadragna med skälet skrivet på var och en.") +
    ` Det gäller ${rader.length} kopplingar.`,
  why:
    varfor ??
    "Ett belägg ska visa vad partiet faktiskt gjorde, inte vad partiet skrev om saken. En motions " +
      "handling är dess yrkande; brödtexten argumenterar för yrkandet. Står det vi citerar bara i " +
      "brödtexten, och begär inget av motionens yrkanden det löftet lovar, har vi visat en åsikt och " +
      "kallat den en handling. Bedömningen av de kopplingar som står kvar är oförändrad.",
  commit: "0000000",
});
writeFileSync(rattelserPath, JSON.stringify(rattelser, null, 2) + "\n");

console.log(`\nSkrivet: data/kopplingar.json — ${rader.length} kopplingar tillbakadragna`);
console.log("Skrivet: data/rattelser.json — en post för hela genomgången");
if (utanKvar.length > 0) {
  console.log(`\nKör om domarna: npm run domar -- --promises ../../data/promises.json`);
}
