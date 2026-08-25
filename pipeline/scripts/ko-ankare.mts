/**
 * Sätter ankare — eller skriver om uträkningen — på kö-poster som lånar ett
 * belopp utan spårbar källa.
 *
 *   pnpm ko-ankare -- <fil>            # torrkörning, alltid först
 *   pnpm ko-ankare -- <fil> --skriv
 *
 * En rad per kö-post, fyra fält åtskilda av tabb:
 *
 *   d7088304332d<TAB>p-2026-0357<TAB>-<TAB>Beloppet är hämtat ur …
 *   b53f44d6a2b3<TAB>-<TAB>Antag befintligt klimatbistånd …<TAB>Talet står på …
 *
 * Andra fältet är ankaret eller ankarna (kommaåtskilda), «-» när raden bara
 * skriver om uträkningen. Tredje fältet är den nya uträkningen, «-» när den
 * gamla ska stå kvar. Reglerna och spärrarna ligger i `src/koankare.ts` och
 * prövas av testsviten.
 *
 * **Skriptet avgör aldrig varifrån ett belopp kommer.** Det är en läsning, och
 * den ska vara gjord innan raden skrivs. Vad skriptet prövar är att ankaret
 * finns, lever, bär ett belopp i samma period — och att ankarets tal FAKTISKT
 * STÅR i uträkningen, för annars kommer beloppet inte därifrån.
 *
 * Faller en enda rad skrivs ingenting.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reviewId, type ReviewCandidate } from "../src/review.ts";
import {
  ankarlista,
  provaKoankarrad,
  sattAnkare,
  type Ankarmal,
  type Koankarrad,
  type Kokostnadslage,
} from "../src/koankare.ts";

const DATA = join(import.meta.dirname, "../../data");
const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
const fil = argv.find((a) => !a.startsWith("--"));
if (!fil) {
  console.error("Ange en fil: <ko-id>\\t<ankare|->\\t<uträkning|->\\t<skäl>. Se skriptets huvud.");
  process.exit(1);
}

const rader: Koankarrad[] = readFileSync(fil, "utf8")
  .split("\n")
  .map((r) => r.replace(/\r$/u, ""))
  .filter((r) => r.trim() !== "" && !r.startsWith("#"))
  .map((r) => {
    const [id, ankare, utrakning, ...resten] = r.split("\t");
    const tom = (v: string | undefined) => ((v ?? "").trim() === "-" ? "" : (v ?? "").trim());
    return {
      id: (id ?? "").trim(),
      ankare: tom(ankare),
      utrakning: tom(utrakning),
      skal: resten.join("\t").trim(),
    };
  });

const ko = JSON.parse(readFileSync(join(DATA, "needs_review.json"), "utf8")) as ReviewCandidate[];
const perId = new Map(ko.map((p) => [reviewId(p), p]));
const malen = new Map<string, Ankarmal>(
  (JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Array<{
    id: string; status?: string; title?: string; cost?: { msek_base?: number; period?: string; type?: string };
  }>).map((p) => [
    p.id,
    { id: p.id, status: p.status, title: p.title, msek_base: p.cost?.msek_base ?? 0, period: p.cost?.period, type: p.cost?.type },
  ]),
);

const fel: string[] = [];
const attGora: Koankarrad[] = [];
let hoppade = 0;
for (const rad of rader) {
  const post = perId.get(rad.id);
  const prov = provaKoankarrad(rad, post?.cost as Kokostnadslage | undefined, malen);
  fel.push(...prov.fel);
  if (prov.hoppas !== undefined) { hoppade += 1; continue; }
  if (prov.ok) attGora.push(rad);
}

console.log(`${rader.length} rad(er) · ${attGora.length} att skriva · ${hoppade} hoppas över\n`);
for (const rad of attGora) {
  const post = perId.get(rad.id)!;
  const c = (post.cost ?? {}) as Kokostnadslage;
  const ankaren = ankarlista(rad);
  const namn = ankaren.map((a) => `${a} (${malen.get(a)?.title?.slice(0, 34) ?? "?"})`).join(", ");
  console.log(`  ${rad.id}  ${c.msek_base} mkr ${c.period}`);
  console.log(`     ${ankaren.length > 0 ? `ankare: ${namn}` : "uträkningen skrivs om, lånepåståendet försvinner"}`);
  console.log(`     ${rad.skal}`);
}

if (fel.length > 0) {
  console.error(`\nFÄLLDA RADER (${fel.length}) — ingenting skrivet:`);
  for (const f of fel) console.error(`  · ${f}`);
  process.exit(1);
}

if (!skriv) { console.log("\nTorrkörning. Lägg till --skriv för att verkställa."); process.exit(0); }

for (const rad of attGora) {
  const post = perId.get(rad.id)!;
  (post as { cost?: unknown }).cost = sattAnkare((post.cost ?? {}) as Kokostnadslage, rad);
}
writeFileSync(join(DATA, "needs_review.json"), JSON.stringify(ko, null, 2) + "\n");
console.log("\nSkrivet: data/needs_review.json");
console.log("Kör svepet över kön och skriv prövningarna innan du godkänner.");
