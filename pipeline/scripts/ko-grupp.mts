/**
 * Skriver gruppen PÅ kö-posten, före godkännandet.
 *
 *   pnpm ko-grupp -- <beslut-review.jsonl>            # torrkörning
 *   pnpm ko-grupp -- <beslut-review.jsonl> --skriv
 *
 * Systerskriptet till `ko-belopp`, och det finns av exakt samma skäl.
 * `group_id` ingår i `kanon()`: gruppen är en utsaga om att posten gäller samma
 * politik som ett annat löfte, och prövningen ska kunna uttala sig om den.
 * Sätts gruppen först vid godkännandet beskriver prövningen en annan version
 * än den som publiceras, och grinden fäller posten — med rätta.
 *
 * Sjutton `delat`-beslut satt fast där 2026-08-25. Vägen ut är densamma som för
 * beloppet: skriv gruppen på kö-posten, svep prövningarna mot den, och godkänn
 * sedan posten som den står.
 *
 * Skriptet avgör aldrig ATT två löften gäller samma politik. Det är granskarens
 * läsning, och den ligger i beslutet. Vad skriptet prövar är att målet finns och
 * lever, och att posten inte redan står i en annan grupp.
 *
 * Faller en enda rad skrivs ingenting.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reviewId, type ReviewCandidate } from "../src/review.ts";
import { senaste, type Beslut } from "../src/reviewbeslut.ts";
import { harledGrupp, provaKogrupprad, type Gruppmal } from "../src/kogrupp.ts";

const DATA = join(import.meta.dirname, "../../data");
const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
// `--utom` håller tillbaka enskilda rader. Gruppen är en UTSAGA om att två
// löften gäller samma politik, och den utsagan möter läsaren — den ska inte
// skrivas när läsningen säger något annat. Att hålla tillbaka en rad kostar en
// fråga; att skriva en falsk grupp kostar sajtens trovärdighet. De undantagna
// skrivs ut, så att ingen tror att de är gjorda.
const utom = new Set(
  (argv.includes("--utom") ? (argv[argv.indexOf("--utom") + 1] ?? "") : "").split(",").map((s) => s.trim()).filter(Boolean),
);
const fil = argv.find((a) => !a.startsWith("--") && !utom.has(a) && a !== (argv[argv.indexOf("--utom") + 1] ?? "\u0000"));
if (!fil) {
  console.error("Ange beslutsfilen: pnpm ko-grupp -- <beslut-review.jsonl> [--utom id,id]");
  process.exit(1);
}

const beslut = senaste(
  readFileSync(fil, "utf8").split("\n").filter((r) => r.trim()).map((r) => JSON.parse(r) as Beslut),
).filter((b) => b.val === "delat");

const ko = JSON.parse(readFileSync(join(DATA, "needs_review.json"), "utf8")) as ReviewCandidate[];
const perId = new Map(ko.map((p) => [reviewId(p), p]));
const loften = new Map<string, Gruppmal>(
  (JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Gruppmal[]).map((p) => [p.id, p]),
);

const fel: string[] = [];
const attSatta: Array<{ id: string; grupp: string; till: string; titel: string }> = [];
let hoppade = 0;

const undantagna: string[] = [];
for (const b of beslut) {
  if (utom.has(b.id)) { undantagna.push(b.id); continue; }
  if (!b.grupp_id) {
    fel.push(`${b.id}: valet är «gruppera» men inget löfte pekades ut`);
    continue;
  }
  const post = perId.get(b.id) as (ReviewCandidate & { group_id?: string | null }) | undefined;
  const mal = loften.get(b.grupp_id);
  const prov = provaKogrupprad({ id: b.id, till: b.grupp_id }, post === undefined ? undefined : { id: b.id, group_id: post.group_id ?? null }, mal);
  fel.push(...prov.fel);
  if (prov.hoppas !== undefined) { hoppade += 1; continue; }
  if (!prov.ok || mal === undefined) continue;
  attSatta.push({ id: b.id, grupp: harledGrupp(mal), till: b.grupp_id, titel: (mal.title ?? "").slice(0, 52) });
}

console.log(
  `${beslut.length} delat-beslut · ${attSatta.length} får sin grupp · ${hoppade} hoppas över` +
    (undantagna.length > 0 ? ` · ${undantagna.length} undantagna: ${undantagna.join(", ")}` : "") + "\n",
);
for (const r of attSatta) console.log(`  ${r.id}  →  ${r.grupp.padEnd(22)} (${r.till}  ${r.titel})`);

if (fel.length > 0) {
  console.error(`\nFÄLLDA RADER (${fel.length}) — ingenting skrivet:`);
  for (const f of fel) console.error(`  · ${f}`);
  process.exit(1);
}

if (!skriv) { console.log("\nTorrkörning. Lägg till --skriv för att verkställa."); process.exit(0); }

for (const r of attSatta) {
  (perId.get(r.id) as { group_id?: string | null }).group_id = r.grupp;
}
writeFileSync(join(DATA, "needs_review.json"), JSON.stringify(ko, null, 2) + "\n");
console.log("\nSkrivet: data/needs_review.json");
console.log("Kör svepet över kön och skriv prövningarna innan du godkänner.");
