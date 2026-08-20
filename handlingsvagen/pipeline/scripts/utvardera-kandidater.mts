/**
 * Var i kandidatlistan ligger de kopplingar en människa faktiskt godkände?
 *
 * VARFÖR. Förslagskörningen betalar ett modellanrop per (löfte, handling)-par,
 * och prompten bär hela riksdagsdokumentet — det är körningens dyraste del med
 * bred marginal. `--max-kandidater` styr hur många dokument varje löfte prövas
 * mot, och står i dag på åtta. Åtta är en gissning: ingen har mätt var de
 * godkända kopplingarna faktiskt hamnar i rankningen.
 *
 * Det här skriptet mäter det, och det gör det UTAN ETT ENDA MODELLANROP.
 * Rankningen är en ren funktion över korpusen, så den går att räkna om i
 * efterhand för varje redan godkänd koppling och läsa av vilken plats
 * handlingen hade.
 *
 * Ligger nästan alla träffar högt upp går taket att sänka, och besparingen är
 * proportionell: från åtta till fyra halverar anropen. Ligger de spridda är
 * taket rätt, och pengarna måste sparas någon annanstans.
 *
 * VAD DET INTE SVARAR PÅ. Att en godkänd koppling låg på plats sju betyder
 * inte att plats sju är värd att behålla i allmänhet — bara att just den
 * hade missats med ett lägre tak. Skriptet räknar därför både träffarna per
 * plats OCH vad varje tak hade kostat i missade kopplingar.
 *
 *   node --import tsx/esm scripts/utvardera-kandidater.mts
 *   node --import tsx/esm scripts/utvardera-kandidater.mts --json ut.json
 *
 * Läser bara. Skriver ingen data och committar ingenting.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { rankaKandidater, rankaVoteringsKandidater, type Lofte, type TermIndex } from "../src/foreslag.ts";
import { dokumentfrekvenser, slaIhopSkarvor, type Skarva } from "../src/nyckelord.ts";
import type { Handling } from "../src/handlingar.ts";
import type { Betankande } from "../src/betankanden.ts";
import { LAGE_A_FONSTER } from "../src/grindar.ts";

/** Hur långt upp vi mäter. Måste vara minst lika stort som dagens tak. */
const TAK = 24;

interface Koppling {
  id: string;
  promise_id?: string;
  stance_id?: string;
  handling_id: string;
  status?: string;
}

const rot = resolve(import.meta.dirname, "../..");
const jsonUt = (() => {
  const i = process.argv.indexOf("--json");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

const las = <T,>(p: string): T => JSON.parse(readFileSync(resolve(rot, p), "utf8")) as T;

const handlingar = las<Handling[]>("data/handlingar.json");
const loften = las<Array<Lofte & { status?: string }>>("../data/promises.json").filter(
  (l) => (l.status ?? "aktiv") === "aktiv",
);
const kopplingar = las<Koppling[]>("data/kopplingar.json").filter((k) => k.status === "aktiv");
const betPath = resolve(rot, "data/betankanden.json");
const betankanden: Betankande[] = existsSync(betPath) ? las<Betankande[]>("data/betankanden.json") : [];

// Nyckelordsindexet måste vara med — utan det rankas det på titeln allena, och
// mätningen hade beskrivit en annan sökning än den som faktiskt körs.
const indexKatalog = resolve(rot, "data/nyckelord");
let termIndex: TermIndex | undefined;
if (existsSync(indexKatalog)) {
  const skarvor = readdirSync(indexKatalog)
    .filter((f) => f.endsWith(".json"))
    .map((f) => las<Skarva>(`data/nyckelord/${f}`));
  const termer = slaIhopSkarvor(skarvor);
  if (termer.size > 0) termIndex = { termer, df: dokumentfrekvenser(termer), antalDok: termer.size };
}
if (!termIndex) {
  console.error("VARNING: nyckelordsindexet saknas — mätningen beskriver en annan sökning än den som körs.");
}

const lofteById = new Map(loften.map((l) => [l.id, l]));
/** Godkända kopplingar per löfte — det är dem vi letar efter i rankningen. */
const godkandaPerLofte = new Map<string, Set<string>>();
for (const k of kopplingar) {
  const id = k.promise_id ?? k.stance_id;
  if (!id || !lofteById.has(id)) continue;
  const s = godkandaPerLofte.get(id) ?? new Set<string>();
  s.add(k.handling_id);
  godkandaPerLofte.set(id, s);
}

console.log(
  `${godkandaPerLofte.size} löften bär tillsammans ${kopplingar.length} godkända kopplingar. ` +
    `Räknar om rankningen för dem (tak ${TAK}) …\n`,
);

const platser: number[] = [];
const utanfor: Array<{ lofte: string; handling: string }> = [];
for (const [lofteId, godkanda] of godkandaPerLofte) {
  const lofte = lofteById.get(lofteId)!;
  const dok = rankaKandidater(lofte, handlingar, TAK, termIndex);
  const vot = rankaVoteringsKandidater(lofte, handlingar, betankanden, TAK);
  // Samma ordning som körningen bygger listan i: dokument först, sedan
  // voteringar. Platsen är den plats anropet faktiskt hade fått.
  const lista = [...dok, ...vot].map((k) => k.handling.id);
  for (const h of godkanda) {
    const plats = lista.indexOf(h);
    if (plats < 0) utanfor.push({ lofte: lofteId, handling: h });
    else platser.push(plats + 1);
  }
}

platser.sort((a, b) => a - b);
const funna = platser.length;
console.log(`Godkända kopplingar som gick att återfinna i rankningen: ${funna}`);
console.log(`Utanför de ${TAK} första (korpusen eller rankningen har ändrats sedan de skapades): ${utanfor.length}\n`);

console.log("PLATS I KANDIDATLISTAN");
const perPlats = new Map<number, number>();
for (const p of platser) perPlats.set(p, (perPlats.get(p) ?? 0) + 1);
let ackum = 0;
for (let p = 1; p <= TAK; p++) {
  const n = perPlats.get(p) ?? 0;
  if (n === 0 && p > 12) continue;
  ackum += n;
  const andel = funna === 0 ? 0 : (ackum / funna) * 100;
  const stapel = "█".repeat(Math.round((n / Math.max(1, funna)) * 60));
  console.log(`  ${String(p).padStart(2)}: ${String(n).padStart(4)}  ${andel.toFixed(1).padStart(5)} % ack  ${stapel}`);
}

console.log("\nVAD ETT LÄGRE TAK HADE KOSTAT");
console.log("  tak   anrop mot i dag   godkända som missats");
const idag = 8;
for (const tak of [2, 3, 4, 5, 6, 8, 12]) {
  const missade = platser.filter((p) => p > tak).length;
  const kvot = ((tak / idag) * 100).toFixed(0);
  const flagga = tak === idag ? "   ← i dag" : "";
  console.log(
    `  ${String(tak).padStart(3)}   ${String(kvot).padStart(11)} %   ${String(missade).padStart(6)} av ${funna}` +
      ` (${funna === 0 ? "0" : ((missade / funna) * 100).toFixed(1)} %)${flagga}`,
  );
}

if (jsonUt) {
  writeFileSync(
    jsonUt,
    JSON.stringify({ tak: TAK, funna, utanfor: utanfor.length, platser, fonster: LAGE_A_FONSTER }, null, 2) + "\n",
  );
  console.log(`\nSkrivet: ${jsonUt}`);
}
