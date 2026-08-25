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
import { kanon, konyckel, kopostSomLofte, lasProvningar } from "../src/provningar.ts";
import { harledGrupp } from "../src/kogrupp.ts";
import { LANAR_BELOPP } from "../src/ankarkravet.ts";
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
  group_id?: string | null;
}>;
const lofteKarta = new Map<string, Lofteslage>(
  loften.map((p) => [p.id, { id: p.id, aktiv: (p.status ?? "aktiv") === "aktiv" }]),
);

// ── Prövningen ───────────────────────────────────────────────────────────
const fel: string[] = [];
const hoppade = new Set<string>();
for (const b of beslut) {
  const p = provaBeslut(b, koKarta, lofteKarta);
  fel.push(...p.fel);
  if (p.hoppas !== undefined) hoppade.add(b.id);
}

// Flytten ändrar ett PUBLICERAT belopp, så den prövas för sig och med sina
// egna regler. Kostnaden tas i första hand ur beslutet — den som stod där när
// människan läste — och först därefter ur kön.
const attGoraForhands = beslut.filter((b) => !hoppade.has(b.id));
const malKarta = new Map(loften.map((p) => [p.id, p as Malpost]));
const flyttar: Flyttrad[] = beslut
  .filter((b) => b.val === "dubblett_kalkyl" && !hoppade.has(b.id))
  .map((b) => {
    const koPost = ko.find((p) => reviewId(p) === b.id);
    return {
      fran: b.id,
      till: b.kalkyl_till ?? "",
      kostnad: (b.kostnad_da ?? koPost?.cost ?? {}) as Flyttrad["kostnad"],
      // BARA noten. `flytta()` skriver kärnan själv, och avvisningsskälet får
      // bära löftets id — det går till avvisade.json. Historiken på det
      // publicerade löftet får det inte, och där hamnar den här texten.
      skal: (b.not ?? "").trim(),
    };
  });
const flyttarKvar: Flyttrad[] = [];
for (const f of flyttar) {
  const p = provaFlytt(f, malKarta.get(f.till));
  fel.push(...p.fel);
  if (p.hoppas === undefined) flyttarKvar.push(f);
}
if (flyttarKvar.length < flyttar.length) {
  console.log(`${flyttar.length - flyttarKvar.length} kalkylflytt(ar) är redan gjorda och hoppas över.`);
}

// KVALITETSFILTRET, prövat HÄR och inte vid skrivningen.
//
// `approve()` kallar `provningsGrind` och avslutar processen med exit(1) om
// posten inte gått genom filtret. Det går alltså inte att fånga, och det sker
// mitt i skrivningen: 2026-08-25 hann 22 avvisningar bli gjorda innan det
// första godkännandet stoppades, och passet lämnade datat halvskrivet — precis
// det skriptets eget huvud lovar att undvika.
/**
 * Rader som kvalitetsfiltret håller tillbaka: id → skälet, i klartext.
 *
 * DE ÄR ETT UPPEHÅLL, INTE ETT FEL. Skriptets huvudregel — faller en rad skrivs
 * ingenting — finns för att ett HALVT verkställt pass lämnar kön i ett läge
 * ingen beslutat om. En rad som hålls tillbaka här skrivs aldrig alls: den
 * plockas bort före första skrivningen och ligger kvar i kön precis som förut.
 * Regeln skyddar alltså ingenting genom att fälla passet — den gör bara att en
 * enda oprövad post spärrar varje annan.
 *
 * Priset var mätbart: 81 poster med en invändning att besvara höll 13
 * färdigprövade beslut ogjorda, och den siffran minskar bara när någon läser
 * invändningarna en efter en. Det som fortfarande fäller passet är rader som är
 * MOTSÄGELSEFULLA — citatet har ändrats, beloppet är ett annat, målet finns
 * inte. De betyder att beslutet gäller något annat än det ser ut att gälla, och
 * då ska det läsas om, inte hoppas över.
 */
const hallna = new Map<string, string>();
{
  const provningar = lasProvningar(DATA);

  /**
   * Kö-posten med den grupp `approve()` faktiskt kommer att sätta.
   *
   * Kö-postens eget `group_id` räcker inte att lita på: `godkannandeArgument`
   * skickar `--group` ur BESLUTET, och `approve()` härleder gruppen ur målet.
   * Har `ko-grupp` inte körts — eller körts med raden undantagen — står
   * kö-posten grupplös medan godkännandet grupperar den, och hashen som prövas
   * här är inte den `approve()` räknar. Då släpps posten igenom av grinden och
   * fälls inne i skrivningen, som avslutar processen. Exakt det halvskrivna
   * pass hela skriptet är byggt för att undvika.
   */
  const medGruppen = (post: ReviewCandidate, b: Beslut): ReviewCandidate => {
    if (b.val !== "delat" || !b.grupp_id) return post;
    const mal = loften.find((p) => p.id === b.grupp_id);
    if (mal === undefined) return post;
    return { ...post, group_id: harledGrupp(mal) } as ReviewCandidate;
  };

  for (const b of attGoraForhands) {
    if (AVVISAR.includes(b.val as Val)) continue;
    const post = ko.find((p) => reviewId(p) === b.id);
    if (!post) continue;
    // Både att prövningen FINNS och att den höll: grinden släpper bara igenom
    // «haller» och «haller-med-forbehall». Prövas bara existensen halvskrivs
    // passet på nytt, en post längre fram.
    const nycklar = [`ko:${reviewId(post)}`, konyckel(post.articleUrl, post.candidate?.quote ?? "")];
    const traff = nycklar.map((n) => provningar.get(n)).find((x) => x !== undefined);
    if (traff === undefined) hallna.set(b.id, "oprövad");
    else if (!["haller", "haller-med-forbehall"].includes(traff.utfall)) {
      hallna.set(b.id, traff.utfall);
    } else if (traff.underlag_hash !== kanon("lofte", kopostSomLofte(medGruppen(post, b)))) {
      // DEN TREDJE GRINDEN, och den som saknades. `provningsGrind` prövar inte
      // bara att prövningen finns och höll, utan att den beskriver DEN HÄR
      // versionen — hashen av citat, rubrik, parter, status, grupp, källa och
      // kostnad. Prövades bara de två första halvskrevs passet en post längre
      // fram, inne i `approve()`, som avslutar processen.
      //
      // Sjutton `delat`-beslut föll här 2026-08-25 utan att någon grind sa det:
      // gruppen sattes vid godkännandet, prövningen var skriven mot en grupplös
      // version, och hasharna kunde omöjligt stämma. `ko-grupp` och `ko-belopp`
      // finns för att den här raden inte ska behöva bli röd.
      hallna.set(b.id, "prövningen beskriver en annan version — kör ko-grupp/ko-belopp och svep om kön");
    }
    // Ett lånat belopp utan ankare fälls av `approve()` — som avslutar
    // processen och alltså inte går att fånga. Samma kontroll här, före
    // skrivningen, så passet inte halvkörs på nytt. Gruppen räknas som ankare,
    // precis som i `lanarUtanSparbartAnkare`: `group_id` och `cost.anchor_ids`
    // är de två strukturerade fält ankarkravet godtar.
    const c = (post.cost ?? {}) as Record<string, unknown>;
    const ankare = (c["anchor_ids"] as string[] | undefined) ?? [];
    const iGrupp = b.val === "delat" || ((post as { group_id?: string | null }).group_id ?? null) !== null;
    if (
      LANAR_BELOPP.test(String(c["calculation"] ?? "")) &&
      (c["msek_base"] ?? 0) !== 0 &&
      ankare.length === 0 &&
      !iGrupp
    ) {
      hallna.set(b.id, "lånar ett belopp utan spårbart ankare");
    }
  }
}

if (hallna.size > 0) {
  const per = new Map<string, string[]>();
  for (const [id, skal] of hallna) {
    if (!per.has(skal)) per.set(skal, []);
    per.get(skal)!.push(id);
  }
  console.log(`\n${hallna.size} beslut hålls tillbaka av kvalitetsfiltret och ligger kvar i kön:`);
  for (const [skal, ids] of [...per].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(ids.length).padStart(4)}  ${skal}`);
    console.log(`        ${ids.slice(0, 6).join(", ")}${ids.length > 6 ? ` … (+${ids.length - 6})` : ""}`);
  }
  console.log(
    "  Var och en bär en mätt invändning som någon ska besvara. Rättelsen görs med\n" +
      "  skillen fa-det-att-halla, och posten prövas om.",
  );
}

if (flyttarKvar.length > 0) {
  console.log(`\n${flyttarKvar.length} kalkyl(er) flyttas till publicerade löften:`);
  for (const f of flyttarKvar) {
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

const attGora = attGoraForhands.filter((b) => !hallna.has(b.id));
const godkanns = attGora.filter((b) => !AVVISAR.includes(b.val as Val));
const nyaKronor = godkanns.reduce((n, b) => {
  const post = ko.find((p) => reviewId(p) === b.id);
  const bas = b.belopp?.bas ?? post?.cost?.msek_base ?? 0;
  return n + bas * (post?.cost?.period === "per_ar" ? 4 : 1);
}, 0);
console.log(
  `\n${beslut.length} beslut · ${godkanns.length} publiceras · ${attGora.length - godkanns.length} avvisas` +
    (hoppade.size > 0 ? ` · ${hoppade.size} hoppas över (redan avgjorda)` : "") +
    (hallna.size > 0 ? ` · ${hallna.size} hålls tillbaka av filtret` : ""),
);
console.log(`Rikssumman före: ${aggregates.totalFlasket(loften).toLocaleString("sv-SE")} msek`);
console.log(`De godkända bär: ${nyaKronor.toLocaleString("sv-SE")} msek över mandatperioden`);
console.log(`Kön är ${ko.length} poster; ${ko.length - attGora.length} blir kvar.`);

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
if (flyttarKvar.length > 0) {
  let loftenNu = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Malpost[];
  const rorda: string[] = [];
  let riket = 0;
  for (const f of flyttarKvar) {
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
  for (const b of attGora) {
    if (AVVISAR.includes(b.val as Val)) reject(b.id, avvisningsskal(b), DATA);
    else approve(godkannandeArgument(b), DATA);
    gjorda += 1;
  }
} catch (e) {
  console.error(`\nAvbröt efter ${gjorda} av ${attGora.length}: ${(e as Error).message}`);
  console.error("De redan verkställda ligger kvar. Ta bort deras rader ur beslutsfilen innan du kör om.");
  process.exit(1);
}

console.log(`\n${gjorda} beslut verkställda.`);
console.log("Kvar att göra för hand:");
console.log("  · backfilla commit-hashen (pnpm backfilla-commit) i andra commiten");
console.log("  · bygg om läskopian i Handlingsvågen");
console.log("  · stäng de issues som avser de avgjorda posterna");
