/**
 * Skriver granskarens belopp PÅ kö-posten, före godkännandet.
 *
 *   pnpm ko-belopp -- <beslut-review.jsonl>            # torrkörning
 *   pnpm ko-belopp -- <beslut-review.jsonl> --skriv
 *
 * VARFÖR DET HÄR STEGET FINNS. Kvalitetsfiltret prövar löftet som det FAKTISKT
 * kommer att publiceras, och prövningen skrivs mot kö-posten innan beslutet.
 * Sätter granskaren ett eget belopp vid godkännandet bygger `approve()` en
 * annan kostnad än den som prövades — annat tal, annan `basis`, annan metodnot
 * — och grinden fäller den med rätta: prövningen beskriver en annan version.
 *
 * 231 beslut satt fast där 2026-08-25. Vägen ut är att flytta beloppet ETT STEG
 * TIDIGARE: skriv granskarens tal på kö-posten, svep prövningarna mot den, och
 * godkänn sedan posten som den står. Då beskriver prövningen exakt det som
 * publiceras.
 *
 * Fälten sätts likadant som `approve()` sätter dem, och `koBeloppTest` i
 * testsviten låser fast att de två inte glider isär.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reviewId, type ReviewCandidate } from "../src/review.ts";
import { senaste, type Beslut } from "../src/reviewbeslut.ts";
import { koKostnad } from "../src/kobelopp.ts";
import { skrivOmBeteckningar, type Loftesuppgift } from "../src/beteckningar.ts";

const DATA = join(import.meta.dirname, "../../data");
const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
const fil = argv.find((a) => !a.startsWith("--"));
if (!fil) {
  console.error("Ange beslutsfilen: pnpm ko-belopp -- <beslut-review.jsonl>");
  process.exit(1);
}

const beslut = senaste(
  readFileSync(fil, "utf8").split("\n").filter((r) => r.trim()).map((r) => JSON.parse(r) as Beslut),
).filter((b) => b.val === "godkann_belopp");

const ko = JSON.parse(readFileSync(join(DATA, "needs_review.json"), "utf8")) as ReviewCandidate[];
const perId = new Map(ko.map((p) => [reviewId(p), p]));
// Granskarens anteckning BLIR uträkningen, och uträkningen visas publikt. Bär
// noten ett löftes-id måste det bli ord här — annars fälls posten först vid
// godkännandet, efter att prövningarna redan svepts mot fel text.
const loften = new Map<string, Loftesuppgift>(
  (JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Loftesuppgift[]).map((p) => [p.id, p]),
);

let satta = 0, skrivnaOm = 0;
const saknas: string[] = [];
for (const b of beslut) {
  const post = perId.get(b.id);
  if (!post) continue;
  if (!b.belopp) { saknas.push(b.id); continue; }
  const omskriven = skrivOmBeteckningar((b.not ?? "").trim(), loften);
  const kostnad = koKostnad(post.cost as never, b.belopp, omskriven.text);
  if (omskriven.ankare.length > 0) kostnad["anchor_ids"] = omskriven.ankare;
  (post as { cost?: unknown }).cost = kostnad;
  if (omskriven.text !== (b.not ?? "").trim()) skrivnaOm += 1;
  satta += 1;
}

console.log(`${beslut.length} beslut med eget belopp · ${satta} skrivna på kö-posten · ${skrivnaOm} noter med intern beteckning omskrivna` +
  (saknas.length > 0 ? ` · ${saknas.length} utan spann: ${saknas.slice(0, 5).join(", ")}` : ""));

if (!skriv) { console.log("\nTorrkörning. Lägg till --skriv för att verkställa."); process.exit(0); }
writeFileSync(join(DATA, "needs_review.json"), JSON.stringify(ko, null, 2) + "\n");
console.log("Skrivet: data/needs_review.json");
console.log("Kör svepet över kön och skriv prövningarna innan du godkänner.");
