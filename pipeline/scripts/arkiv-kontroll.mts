/**
 * Arkivkontrollen — öppnar ögonblicksbilden och prövar att citatet står i den.
 *
 * "Arkivlänkar måste bära citatet" är en kärnprincip: en arkivkopia accepteras
 * bara om citatet står ordagrant i själva ögonblicksbilden. Kontrollen fanns
 * sedan tidigare i `archive-verify.ts`, men bara vid SKRIVNING — när en
 * arkivlänk sattes. Ingenting öppnade kopiorna för det som redan var
 * publicerat, och varje enskild prövning i granskningsloggen bar därför raden
 * "arkivkopian öppnades inte". Det här skriptet stänger den luckan: det sveper
 * hela det publicerade datat och kan också prövas på en enda post.
 *
 * En arkivlänk ruttnar inte som en vanlig källa gör — men den kan ha satts mot
 * en ögonblicksbild som är äldre än sidinnehållet, och den kan peka på en
 * snapshot Wayback senare bytt ut. Det syns bara om någon öppnar den.
 *
 *   pnpm arkiv:kontroll                     alla publicerade löften
 *   pnpm arkiv:kontroll --standpunkter      Frågevågens belagda ståndpunkter
 *   pnpm arkiv:kontroll --allt              båda
 *   pnpm arkiv:kontroll --id p-2026-0021    en enda post (kvalitetsfiltret)
 *   pnpm arkiv:kontroll --bara-fel          tyst om det som håller
 *   pnpm arkiv:kontroll --json              maskinläsbart
 *   pnpm arkiv:kontroll --max 40            bryt efter N ögonblicksbilder
 *
 * Utfall per post:
 *   bar         citatet står ordagrant i ögonblicksbilden
 *   bar-inte    ögonblicksbilden hämtades, citatet står INTE i den
 *   saknas      posten har ingen arkivkopia alls
 *   oavgjort    nätet nådde inte fram — säger ingenting om kopian
 *   ej-provad   kom aldrig till (--max slog till) — skilj den från oavgjort,
 *               annars ser en avbruten körning ut som ett nätstrul
 *
 * Exitkod 1 sätts BARA av "bar-inte". Ett nätfel får aldrig se ut som ett
 * underkänt citat; det är samma regel som källrötebevakningen följer, och
 * skälet är att vi annars anklagar en ögonblicksbild för vårt eget nätstrul.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { quoteInSnapshotText, snapshotText } from "../src/archive-verify.ts";

const ROOT = resolve(import.meta.dirname, "../../");
const DATA = join(ROOT, "data");
const args = process.argv.slice(2);
const har = (f: string) => args.includes(f);
const varde = (f: string): string | undefined => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const ettId = varde("--id");
const baraFel = har("--bara-fel");
const somJson = har("--json");
const max = Number(varde("--max") ?? "0") || Infinity;
// Wayback tål inte snabb eld. Pausen gäller mellan hämtningar, inte mellan
// citat — flera citat ur samma sida prövas mot en och samma hämtning.
const paus = Number(varde("--paus") ?? "1200");
const sov = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Utfall = "bar" | "bar-inte" | "saknas" | "oavgjort" | "ej-provad";
type Post = { id: string; slag: "löfte" | "ståndpunkt"; quote: string; kalla: string; arkiv: string | null };
type Rad = Post & { utfall: Utfall };

type Promise_ = {
  id: string;
  status?: string;
  quote?: string;
  source?: { url?: string; archive_url?: string | null };
};
type StanceCell = {
  subquestion_id: string;
  party: string;
  current?: { statement_id?: string | null };
  statements?: { id: string; quote?: string; source_url?: string; archive_url?: string | null }[];
};

function loften(): Post[] {
  const rows = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Promise_[];
  return rows
    .filter((p) => p.status === "aktiv")
    .map((p) => ({
      id: p.id,
      slag: "löfte" as const,
      quote: p.quote ?? "",
      kalla: p.source?.url ?? "",
      arkiv: p.source?.archive_url ?? null,
    }));
}

function standpunkter(): Post[] {
  const celler = JSON.parse(readFileSync(join(DATA, "stances.json"), "utf8")) as StanceCell[];
  const ut: Post[] = [];
  for (const c of celler) {
    // Bara det som faktiskt är publicerat med ett belägg. En tom cell är
    // ärlig och har ingen arkivkopia att pröva.
    const id = c.current?.statement_id;
    if (!id) continue;
    const st = (c.statements ?? []).find((s) => s.id === id);
    if (!st) continue;
    ut.push({
      id: `${c.subquestion_id}/${c.party}`,
      slag: "ståndpunkt",
      quote: st.quote ?? "",
      kalla: st.source_url ?? "",
      arkiv: st.archive_url ?? null,
    });
  }
  return ut;
}

let poster: Post[] = [];
if (har("--allt")) poster = [...loften(), ...standpunkter()];
else if (har("--standpunkter")) poster = standpunkter();
else poster = loften();
if (ettId) poster = poster.filter((p) => p.id === ettId);

if (poster.length === 0) {
  console.error(ettId ? `Hittade ingen publicerad post med id ${ettId}.` : "Inga poster att pröva.");
  process.exit(2);
}

// Flera löften delar ofta samma källsida, och därmed samma arkivlänk. Gruppera
// på arkivlänken så varje ögonblicksbild hämtas EN gång och alla dess citat
// prövas mot den hämtningen.
const perArkiv = new Map<string, Post[]>();
const utanArkiv: Post[] = [];
for (const p of poster) {
  if (!p.arkiv) utanArkiv.push(p);
  else perArkiv.set(p.arkiv, [...(perArkiv.get(p.arkiv) ?? []), p]);
}

const arkivlankar = [...perArkiv.keys()].slice(0, max);
if (!somJson) {
  console.log(
    `Prövar ${poster.length} publicerade poster: ${arkivlankar.length} ögonblicksbilder att öppna, ` +
      `${utanArkiv.length} utan arkivkopia.`,
  );
}

const rader: Rad[] = utanArkiv.map((p) => ({ ...p, utfall: "saknas" as const }));

let hamtade = 0;
for (const lank of arkivlankar) {
  const grupp = perArkiv.get(lank)!;
  const text = await snapshotText(lank);
  hamtade++;
  for (const p of grupp) {
    const utfall: Utfall = text === null ? "oavgjort" : quoteInSnapshotText(text, p.quote) ? "bar" : "bar-inte";
    rader.push({ ...p, utfall });
    if (!somJson && (!baraFel || utfall === "bar-inte")) {
      const märke: Record<Utfall, string> = {
        bar: "bär",
        "bar-inte": "BÄR INTE",
        saknas: "saknar",
        oavgjort: "oavgjort",
        "ej-provad": "ej prövad",
      };
      console.log(`${märke[utfall].padEnd(9)} ${p.id.padEnd(24)} ${p.slag.padEnd(11)} ${lank}`);
    }
  }
  // Poster som inte hann prövas för att --max slog till räknas inte som något
  // alls. Att tiga om dem vore att låta en avbruten körning se fullständig ut.
  if (hamtade < arkivlankar.length) await sov(paus);
}
const prövade = new Set(arkivlankar);
for (const [lank, grupp] of perArkiv) {
  if (!prövade.has(lank)) for (const q of grupp) rader.push({ ...q, utfall: "ej-provad" });
}

const rakna = (u: Utfall) => rader.filter((r) => r.utfall === u).length;
const barInte = rader.filter((r) => r.utfall === "bar-inte");

if (somJson) {
  console.log(JSON.stringify({ prövade: rader.length, rader }, null, 2));
} else {
  console.log("");
  console.log(`Bär citatet:            ${rakna("bar")}`);
  console.log(`BÄR INTE citatet:       ${barInte.length}`);
  console.log(`Saknar arkivkopia:      ${rakna("saknas")}`);
  console.log(`Gick inte att avgöra:   ${rakna("oavgjort")}   (nätet — säger inget om kopian)`);
  if (rakna("ej-provad") > 0) {
    console.log(`Kom aldrig till:        ${rakna("ej-provad")}   (--max ${max} — körningen är inte fullständig)`);
  }
  if (barInte.length > 0) {
    console.log("");
    console.log("Dessa arkivkopior bär inte sitt citat och måste hämtas om eller tömmas:");
    for (const r of barInte) console.log(`  ${r.id}  ${r.arkiv}`);
  }
}

process.exit(barInte.length > 0 ? 1 : 0);
