/**
 * Verkställer Avgörandets review-beslut: publicerar kön eller avvisar den.
 *
 *   pnpm review-verkstall -- <beslut-review.jsonl>            # torrkörning
 *   pnpm review-verkstall -- <beslut-review.jsonl> --skriv
 *
 * VARFÖR VERKTYGET FINNS. Kön är 503 poster lång och 495 av dem har inte fällts
 * av en enda grind — de ligger kvar därför att ett maskinutvunnet löfte aldrig
 * publiceras utan en människas ja. Den vägen har gått via ett GitHub-issue per
 * post, och 270 av posterna har inte ens fått sitt issue än. Avgörandet ställer
 * frågorna i ett svep; det här tar emot svaren.
 *
 * ORDNINGEN: allt prövas FÖRST, och faller en enda rad skrivs ingenting. Ett
 * halvt verkställt pass lämnar kön i ett läge ingen har beslutat om, och till
 * skillnad från de andra verktygen går det här inte att köra om utan vidare:
 * `approve` PLOCKAR BORT posten ur kön, så en andra körning över samma fil
 * hittar inte det som redan tagits.
 *
 * Skriptet avgör aldrig om ett löfte ska publiceras. Det prövar beslutet,
 * mäter vad summorna gör med sajtens egen uträkning, och skriver.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { approve, reject, reviewId, type ReviewCandidate } from "../src/review.ts";
import { computeDataHash, type ChangelogEntry } from "../src/publish.ts";
import { svenskDag } from "../src/dagen.ts";
import {
  flytta,
  forandring,
  provaFlytt,
  type Flyttrad,
  type Malpost,
} from "../src/kalkylflytt.ts";
import {
  avvisningsskal,
  godkannandeArgument,
  provaBeslut,
  senaste,
  AVVISAR,
  type Beslut,
  type Kopost,
  type Lofteslage,
  type Val,
} from "../src/reviewbeslut.ts";

const aggregates = (await import(
  pathToFileURL(join(import.meta.dirname, "../../site/src/lib/aggregates.ts")).href
)) as { totalFlasket: (p: unknown[]) => number };

const DATA = join(import.meta.dirname, "../../data");
const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
const fil = argv.find((a) => !a.startsWith("--"));

if (!fil) {
  console.error("Ange beslutsfilen: pnpm review-verkstall -- <beslut-review.jsonl>");
  process.exit(1);
}

const rader: Beslut[] = readFileSync(resolve(fil), "utf8")
  .split("\n")
  .filter((r) => r.trim())
  .map((r) => JSON.parse(r) as Beslut)
  .filter((b) => (b.spar ?? "review") === "review");

const beslut = senaste(rader).filter((b) => b.val !== "oklart");
if (beslut.length === 0) {
  console.log("Inga beslut att verkställa.");
  process.exit(0);
}

const ko = JSON.parse(readFileSync(join(DATA, "needs_review.json"), "utf8")) as ReviewCandidate[];
const koKarta = new Map<string, Kopost>(
  ko.map((p) => [
    reviewId(p),
    {
      id: reviewId(p),
      citat: p.candidate?.quote ?? "",
      harKostnad: p.cost?.msek_base !== undefined && p.cost?.msek_base !== null,
      bas: p.cost?.msek_base ?? null,
    },
  ]),
);
const loften = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Array<{
  id: string;
  status?: string;
}>;
const lofteKarta = new Map<string, Lofteslage>(
  loften.map((p) => [p.id, { id: p.id, aktiv: (p.status ?? "aktiv") === "aktiv" }]),
);

// ── Prövningen ───────────────────────────────────────────────────────────
const fel: string[] = [];
for (const b of beslut) fel.push(...provaBeslut(b, koKarta, lofteKarta).fel);

// Flytten ändrar ett PUBLICERAT belopp, så den prövas för sig och med sina
// egna regler. Kostnaden tas i första hand ur beslutet — den som stod där när
// människan läste — och först därefter ur kön.
const malKarta = new Map(loften.map((p) => [p.id, p as Malpost]));
const flyttar: Flyttrad[] = beslut
  .filter((b) => b.val === "dubblett_kalkyl")
  .map((b) => {
    const koPost = ko.find((p) => reviewId(p) === b.id);
    return {
      fran: b.id,
      till: b.kalkyl_till ?? "",
      kostnad: (b.kostnad_da ?? koPost?.cost ?? {}) as Flyttrad["kostnad"],
      skal: (b.not ?? "").trim() || avvisningsskal(b),
    };
  });
for (const f of flyttar) fel.push(...provaFlytt(f, malKarta.get(f.till)).fel);

if (flyttar.length > 0) {
  console.log(`\n${flyttar.length} kalkyl(er) flyttas till publicerade löften:`);
  for (const f of flyttar) {
    const mal = malKarta.get(f.till);
    const d = mal ? forandring(f, mal) : 0;
    console.log(
      `  ${f.till}  ${(mal?.title ?? "").slice(0, 46)}  ` +
        `${d === 0 ? "beloppet oförändrat" : `${d > 0 ? "+" : ""}${d.toLocaleString("sv-SE")} mkr`}`,
    );
  }
}

const per = new Map<Val, number>();
for (const b of beslut) per.set(b.val as Val, (per.get(b.val as Val) ?? 0) + 1);
for (const [v, n] of [...per].sort(([a], [b2]) => a.localeCompare(b2))) {
  console.log(`  ${String(n).padStart(4)}  ${v}`);
}

const godkanns = beslut.filter((b) => !AVVISAR.includes(b.val as Val));
const nyaKronor = godkanns.reduce((n, b) => {
  const post = ko.find((p) => reviewId(p) === b.id);
  const bas = b.belopp?.bas ?? post?.cost?.msek_base ?? 0;
  return n + bas * (post?.cost?.period === "per_ar" ? 4 : 1);
}, 0);
console.log(
  `\n${beslut.length} beslut · ${godkanns.length} publiceras · ${beslut.length - godkanns.length} avvisas`,
);
console.log(`Rikssumman före: ${aggregates.totalFlasket(loften).toLocaleString("sv-SE")} msek`);
console.log(`De godkända bär: ${nyaKronor.toLocaleString("sv-SE")} msek över mandatperioden`);
console.log(`Kön är ${ko.length} poster; ${ko.length - beslut.length} blir kvar.`);

if (fel.length > 0) {
  console.error(`\nFÄLLDA RADER (${fel.length}) — ingenting skrivet:`);
  for (const f of fel) console.error(`  · ${f}`);
  process.exit(1);
}

if (!skriv) {
  console.log("\nTorrkörning. Lägg till --skriv för att verkställa.");
  process.exit(0);
}

// ── Verkställigheten ─────────────────────────────────────────────────────
// En post i taget, och varje `approve`/`reject` plockar bort den ur kön. Går
// något sönder mitt i ska utskriften säga exakt hur långt den kom — annars
// vet ingen vad som är gjort.
// Flyttarna FÖRST, medan kö-posterna ännu finns kvar: går en flytt sönder ska
// kandidaten inte redan vara avvisad, för då är uträkningen borta ur bägge.
const datum = svenskDag();
if (flyttar.length > 0) {
  let loftenNu = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Malpost[];
  const rorda: string[] = [];
  let riket = 0;
  for (const f of flyttar) {
    const i = loftenNu.findIndex((p) => p.id === f.till);
    riket += forandring(f, loftenNu[i]!);
    loftenNu[i] = flytta(loftenNu[i]!, f, datum);
    rorda.push(f.till);
  }
  writeFileSync(join(DATA, "promises.json"), JSON.stringify(loftenNu, null, 2) + "\n");

  const rattelser = JSON.parse(readFileSync(join(DATA, "rattelser.json"), "utf8")) as unknown[];
  rattelser.push({
    date: datum,
    affects: `Löftessidorna för ${rorda.join(", ")}`,
    what:
      `${rorda.length} löften har fått en ny uträkning och i förekommande fall ett nytt belopp. ` +
      `Summan för alla partier ${riket < 0 ? "minskar" : "ökar"} med ` +
      `${Math.abs(riket).toLocaleString("sv-SE")} miljoner kronor för mandatperioden. ` +
      "Skälet står på varje löfte.",
    why:
      "Ett löfte med samma innebörd låg i granskningskön och avvisades som en dubblett — samma parti " +
      "hade redan åtagandet publicerat. Men kö-postens uträkning var bättre grundad än den som stod på " +
      "det publicerade löftet, och en dubblett som avvisas rakt av tar den med sig. Uträkningen är " +
      "därför flyttad till det löfte som står kvar. Citatet, rubriken och källan är oförändrade: det är " +
      "bara prislappen som bytts.",
    commit: "0000000",
  });
  writeFileSync(join(DATA, "rattelser.json"), JSON.stringify(rattelser, null, 2) + "\n");

  const changelog = JSON.parse(readFileSync(join(DATA, "changelog.json"), "utf8")) as ChangelogEntry[];
  changelog.push({
    run_id: `kalkylflytt-${datum}`,
    added: [], updated: rorda, retracted: [],
    data_hash: computeDataHash(loftenNu as unknown[]),
    timestamp: new Date().toISOString(),
  });
  writeFileSync(join(DATA, "changelog.json"), JSON.stringify(changelog, null, 2) + "\n");
  console.log(`${rorda.length} kalkyl(er) flyttade.`);
}

let gjorda = 0;
try {
  for (const b of beslut) {
    if (AVVISAR.includes(b.val as Val)) reject(b.id, avvisningsskal(b), DATA);
    else approve(godkannandeArgument(b), DATA);
    gjorda += 1;
  }
} catch (e) {
  console.error(`\nAvbröt efter ${gjorda} av ${beslut.length}: ${(e as Error).message}`);
  console.error("De redan verkställda ligger kvar. Ta bort deras rader ur beslutsfilen innan du kör om.");
  process.exit(1);
}

console.log(`\n${gjorda} beslut verkställda.`);
console.log("Kvar att göra för hand:");
console.log("  · backfilla commit-hashen (pnpm backfilla-commit) i andra commiten");
console.log("  · bygg om läskopian i Handlingsvågen");
console.log("  · stäng de issues som avser de avgjorda posterna");
