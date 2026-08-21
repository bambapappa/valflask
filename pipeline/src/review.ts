import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { computeDataHash, type ChangelogEntry } from "./publish.ts";
import { konyckel, lasProvningar, provningsGrind } from "./provningar.ts";
import { avvisa, hav, slaUpp, type Avvisning } from "./avvisningar.ts";
import { partiForUrl } from "./skordeordning.ts";
import { taLaset } from "./datalas.ts";

const DATA_DIR = join(import.meta.dirname, "../../data");

/** Schemats tak för cost.calculation — texten visas publikt på löftessidan. */
const MAX_CALCULATION = 800;

/**
 * Kostnadssteget skriver en platshållare i metodnoten när modellsvaret inte
 * gick att använda: «LLM-kostnadssvar saknade giltiga tal — belopp MÅSTE
 * sättas manuellt». Det är ett meddelande till oss, inte till läsaren.
 *
 * Noten renderas på löftessidan och ligger i det publika API:et. Sex
 * publicerade löften bar den här texten den 2026-08-14 — och den motsade
 * dessutom sidan intill, eftersom beloppet vid det laget var satt. Skälet är
 * att godkännandet la till «(belopp satt av granskare)» EFTER den gamla noten
 * i stället för att ersätta den.
 */
const HAVERITEXT =
  /\s*LLM-kostnadssvar\s+(?:saknade giltiga tal|ej tolkbart[^—]*?)\s*—\s*belopp MÅSTE sättas manuellt\.?/giu;

export function utanHaveritext(note: string): string {
  return note.replace(HAVERITEXT, "").trim();
}

/**
 * Stabilt id för en kö-post: hash av articleUrl + kandidattitel — samma nyckel
 * som publish.ts dedupar kön på. Beräknas on-the-fly (lagras inte i filen) och
 * används av GitHub-issueflödet: issue-titeln bär id:t, och /godkänn//avvisa
 * slår upp posten oavsett hur index förskjutits sedan issuet skapades.
 */
export function reviewId(entry: Pick<ReviewCandidate, "articleUrl" | "candidate">): string {
  const title = (entry.candidate as { title?: string } | null | undefined)?.title ?? "";
  return createHash("sha256").update(`${entry.articleUrl ?? ""}::${title}`).digest("hex").slice(0, 12);
}

export function findIndexByReviewId(items: ReviewCandidate[], id: string): number {
  return items.findIndex((e) => reviewId(e) === id);
}

/**
 * Löser ett kö-argument som är ANTINGEN ett index ELLER ett stabilt review-id.
 *
 * VARFÖR: index är positioner, och positioner flyttar sig. Ett beslutsunderlag
 * skrivs mot kön en dag och verkställs mot kön en annan, och däremellan har
 * någon avgjort poster ovanför. Då pekar varje nummer i dokumentet på fel post
 * — och godkännandet säger ingenting, för index 17 finns fortfarande.
 *
 * Det är mätt, inte befarat. När `REVIEWKO-79-2026-08-16.md` skrevs låg 79
 * poster i kön; sexton avgjordes samma dag, och därefter hade **ingen av de 59
 * kvarvarande kvar sitt nummer** — inte en enda. Ett dokument skrivet på
 * förmiddagen godkände alltså på eftermiddagen 59 fel löften, tyst.
 *
 * Id:t räknas ur adressen och rubriken och rör sig inte när kön krymper. Det
 * bar redan issueflödet (`approve-id`), men den vägen var osynlig i listningen
 * och krävde ett eget kommandonamn. Nu duger id:t överallt ett index duger, och
 * `list` skriver ut det — så ett underlag skrivet ur listningen bär den stabila
 * nyckeln utan att någon behöver tänka på saken.
 *
 * `ko:`-prefixet godtas därför att granskningsloggen och kö-issuen skriver
 * nyckeln i den formen; det är samma tolv tecken.
 */
export function loesKoArgument(items: ReviewCandidate[], arg: string | undefined): number {
  const rå = (arg ?? "").trim();
  if (rå === "") {
    console.error("Ange ett index eller ett review-id (tolv tecken, står i listningen och i issue-titeln).");
    process.exit(1);
  }

  const utanPrefix = rå.startsWith("ko:") ? rå.slice(3) : rå;
  const serUtSomId = /^[0-9a-f]{12}$/u.test(utanPrefix);
  // Ett rent tal som inte är tolv tecken långt kan bara vara ett index.
  const serUtSomIndex = /^\d+$/u.test(rå) && rå.length < 12;

  if (serUtSomId && !serUtSomIndex) {
    const index = findIndexByReviewId(items, utanPrefix);
    if (index < 0) {
      console.error(`Ingen kö-post med review-id ${utanPrefix} — redan avgjord?`);
      process.exit(1);
    }
    return index;
  }

  if (serUtSomIndex) {
    const index = parseInt(rå, 10);
    if (index < 0 || index >= items.length) {
      console.error(`Ogiltigt index: ${rå}. Tillgängliga: 0–${items.length - 1}`);
      process.exit(1);
    }
    return index;
  }

  console.error(
    `Varken index eller review-id: ${rå}\n` +
      "Ett index är ett tal; ett review-id är tolv tecken 0–9a–f, med eller utan ko:-prefix.",
  );
  process.exit(1);
}

export const KOSTNADSTYPER = [
  "utgift",
  "intäktsminskning",
  "besparing",
  "intäktsökning",
] as const;
export type Kostnadstyp = (typeof KOSTNADSTYPER)[number];

/**
 * Om beloppet gäller ett år eller en gång — samma lista som `promises.schema.json`.
 *
 * Perioden ärvdes förut rakt av från kö-posten och gick inte att sätta. Ett
 * parti som anger en summa över tio eller femton år får då hela summan bokförd
 * i ett fyraårigt fönster: Vänsterpartiets 700 miljarder över tio år och
 * Miljöpartiets 150 miljarder över femton–tjugo stod bägge som `engang`, alltså
 * 536 miljarder som aldrig hörde hemma i mandatperioden. Att räkna om till en
 * årstakt kräver att perioden byts i samma steg som beloppet — annars beskriver
 * fältet en annan sak än siffran bredvid.
 */
export const PERIODER = ["per_ar", "engang"] as const;
export type Period = (typeof PERIODER)[number];

/**
 * Hur förankrat ett belopp är — samma lista som `promises.schema.json`.
 *
 * Ordningen är den metodsidan redovisar för läsaren, mest pålitlig först.
 * `rut` finns i schemat sedan tidigare och står kvar; den betecknar Riksdagens
 * utredningstjänst.
 */
export const BASISVARDEN = [
  "rut",
  "myndighet",
  "parti",
  "media",
  "granskare",
  "llm_estimat",
] as const;

export type ReviewCommand =
  | {
      action: "approve";
      amounts?: [number, number, number];
      group?: string;
      calculation?: string;
      costType?: Kostnadstyp;
      period?: Period;
    }
  | { action: "reject"; reason: string };

/**
 * Tolkar en issue-kommentar från ägaren till ett granskningsbeslut.
 *  /godkänn                       → ja (föreslagen kostnad tas som den är)
 *  /godkänn 500 1000 2000         → ja med ändrade belopp (msek: low base high)
 *  /godkänn --group p-2026-0123   → ja, länka som dublett (delad group_id)
 *  /godkänn 0 4500 9000 --typ intäktsminskning → ja, med angiven kostnadstyp
 *  /godkänn 52500 70000 94500 --period per_ar  → ja, med beloppet omräknat till årstakt
 *  /avvisa <skäl>                 → nej
 * Engelska alias: /approve, /reject. Endast FÖRSTA raden tolkas som kommando.
 * En rad som börjar "Uträkning:" blir uträkningen bakom beloppet och visas
 * publikt på löftessidan; övrig text är fritext och används inte. Okänt
 * kommando ⇒ null (workflown svarar med hjälptext).
 */
export function parseReviewCommand(body: string): ReviewCommand | null {
  const text = (body ?? "").trim();
  const line = text.split("\n", 1)[0]!.trim();
  // Uträkningen bakom ett eget belopp anges med en rad som börjar "Uträkning:".
  // Den visas PUBLIKT på löftessidan, så den måste vara uttryckligen märkt —
  // annars hade vilken kommentar som helst under kommandot hamnat på sajten.
  // En kommentar bär ofta en signatur under en vågrät linje. Den är inte en del
  // av uträkningen, men uträkningen VISAS PUBLIKT på löftessidan — så allt från
  // första vågräta linjen och nedåt kapas innan texten läses ut. Utan den här
  // kapningen hamnade en signatur mitt i den publicerade uträkningen (rättat i
  // p-2026-0580).
  const efterKommando = text
    .slice(line.length)
    .split(/\n[ \t]*(?:-{3,}|_{3,}|\*{3,})[ \t]*(?:\n|$)/u)[0]!;
  const calcMatch = efterKommando.match(/^\s*Uträkning:\s*([\s\S]+)$/imu);
  const calculationText = (calcMatch?.[1] ?? "").trim().replace(/\s+/gu, " ").slice(0, MAX_CALCULATION);
  const approve = line.match(/^\/(?:godkänn|godkann|approve)\b(.*)$/iu);
  if (approve) {
    const rest = approve[1]!.trim();
    const groupMatch = rest.match(/--group[= ]+(\S+)/u);
    // En kö-post utan färdig kostnad hade ingen typ att ärva och föll tillbaka
    // på "utgift". Ett skattesänkningslöfte publicerades då som en utgift
    // (rättat på p-2026-0592 och p-2026-0593) — därför kan typen anges här.
    const typMatch = rest.match(/--typ[= ]+(\S+)/u);
    // Perioden måste bort ur beloppsläsningen på samma sätt som typen: annars
    // läses «per_ar» som ett tal, blir NaN, och hela kommandot faller till
    // hjälptext trots att det är riktigt skrivet.
    const periodMatch = rest.match(/--period[= ]+(\S+)/u);
    const numbers = rest
      .replace(/--group[= ]+\S+/u, "")
      .replace(/--typ[= ]+\S+/u, "")
      .replace(/--period[= ]+\S+/u, "")
      .trim()
      .split(/\s+/u)
      .filter((s) => s !== "")
      .map((s) => Number(s.replace(",", ".")));
    const cmd: ReviewCommand = { action: "approve" };
    if (groupMatch) cmd.group = groupMatch[1]!;
    if (typMatch) {
      const typ = typMatch[1]!.toLowerCase();
      // En felstavad typ får inte tyst bli "utgift" — det var just tystnaden
      // som gjorde det förra felet osynligt. Oklart kommando ⇒ hjälptext.
      if (!(KOSTNADSTYPER as readonly string[]).includes(typ)) return null;
      cmd.costType = typ as Kostnadstyp;
    }
    if (periodMatch) {
      const period = periodMatch[1]!.toLowerCase();
      // Samma skäl som för typen: en felstavad period får inte tyst bli den
      // ärvda. Perioden avgör om beloppet räknas en gång eller fyra.
      if (!(PERIODER as readonly string[]).includes(period)) return null;
      cmd.period = period as Period;
    }
    if (numbers.length === 3 && numbers.every((n) => Number.isFinite(n) && n >= 0)) {
      cmd.amounts = [numbers[0]!, numbers[1]!, numbers[2]!];
    } else if (numbers.length > 0) {
      return null; // belopp angivna men inte tre giltiga tal — be om förtydligande
    }
    if (calculationText !== "") cmd.calculation = calculationText;
    return cmd;
  }
  const reject = line.match(/^\/(?:avvisa|reject)\b(.*)$/iu);
  if (reject) {
    const reason = reject[1]!.trim();
    return { action: "reject", reason: reason === "" ? "avvisad via review-issue" : reason };
  }
  return null;
}

export interface CostShape {
  type: string;
  period: string;
  msek_low: number;
  msek_base: number;
  msek_high: number;
  basis: string;
  basis_url: string | null;
  method_note: string;
  calculation?: string;
  confidence: number;
}

export interface ReviewCandidate {
  candidate: {
    title?: string;
    parties?: string[];
    quote?: string;
    category?: string;
    person?: { name: string; role: string } | null;
    amount_in_text_msek?: number | null;
  };
  failures: Array<{ gate: string; reason: string }>;
  articleUrl: string;
  articleTitle: string;
  verifyReason?: string;
  costReason?: string;
  manualReason?: string;
  duplicateOf?: string;
  /**
   * Vad dubblettflaggan läste, när den kom från politikkollen: samma tal eller
   * samma uttryck. De andra dublettkollarna säger sig själva — samma citat,
   * samma titel — men den här har läst något som inte syns när man lägger de
   * två löftena bredvid varandra, och då ska skälet stå i granskningen.
   */
  duplicateReason?: string;
  cost?: CostShape;
}

interface PromiseEntry {
  id: string;
  group_id: string | null;
  title: string;
  slug: string;
  parties: string[];
  person: { name: string; role: string } | null;
  quote: string;
  date_stated: string;
  source: { url: string; domain: string; archive_url: string | null; fetched_at: string };
  category: string;
  cost: Record<string, unknown>;
  financing_claimed: Record<string, unknown>;
  comparisons: string[];
  quip: string | null;
  status: string;
  history: unknown[];
  extraction: Record<string, unknown>;
}

function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s.length > 0 ? s : "lofte";
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function saveJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

/**
 * Appenda en changelog-post så `data_hash` och "senast uppdaterad" följer med
 * varje godkännande — annars släpar de efter promises.json tills nästa
 * pipelinekörning (samma post-form som publish.ts skriver). Saknad changelog ⇒
 * börja tom (robust i tester och första körning). Avvisningar loggas ALDRIG:
 * kön är inte publicerad data och promises.json/hashen ändras inte.
 */
function appendChangelog(dataDir: string, entry: ChangelogEntry): void {
  const path = join(dataDir, "changelog.json");
  let log: ChangelogEntry[];
  try {
    log = loadJson<ChangelogEntry[]>(path);
  } catch {
    log = [];
  }
  log.push(entry);
  saveJson(path, log);
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return ""; // manuell källa kan vara fritext (t.ex. "SVT Aktuellt, rikssänt")
  }
}

function list(dataDir: string = DATA_DIR): void {
  const items = loadJson<ReviewCandidate[]>(join(dataDir, "needs_review.json"));
  if (items.length === 0) {
    console.log("Inga poster i needs_review.");
    return;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const title = item.candidate?.title ?? item.articleTitle ?? "(ingen titel)";
    const parties = item.candidate?.parties?.join(",") ?? "?";
    const reasons: string[] = [];
    if (item.failures.length > 0) reasons.push(item.failures.map((f) => f.gate).join(","));
    if (item.verifyReason) reasons.push(`verify: ${item.verifyReason}`);
    if (item.costReason) reasons.push(`cost: ${item.costReason}`);
    if (item.manualReason) reasons.push(`manuell: ${item.manualReason}`);
    if (item.duplicateOf) {
      reasons.push(
        item.duplicateOf.startsWith("p-")
          ? `möjlig dublett av ${item.duplicateOf} (länka: approve ${i} --group ${item.duplicateOf}, annars avvisa)`
          : "möjlig dublett inom samma körning",
      );
    }

    // Id:t står FÖRE numret med flit. Numret är en position och flyttar sig så
    // snart en post ovanför avgörs; id:t gör det inte. Ett underlag som skrivs
    // ur den här listningen ska bära den nyckel som fortfarande pekar rätt när
    // besluten verkställs, och den som läser raden ska se vilken det är.
    console.log(`${reviewId(item)}  [${i}] ${title}`);
    console.log(`    Partier: ${parties}`);
    console.log(`    Källa: ${item.articleUrl}`);
    if (item.cost) {
      console.log(
        `    Kostnad: ${item.cost.msek_base} msek (${item.cost.msek_low}–${item.cost.msek_high}), ` +
          `${item.cost.basis}, conf ${item.cost.confidence}`,
      );
      if (item.cost.calculation) console.log(`    Uträkning: ${item.cost.calculation}`);
    }
    if (reasons.length > 0) console.log(`    Anledning: ${reasons.join("; ")}`);
    console.log();
  }

  console.log(`Totalt: ${items.length} post(er) i needs_review.`);
}

function nextId(promises: PromiseEntry[]): string {
  const maxNum = promises.reduce((max, p) => {
    const m = p.id.match(/^p-2026-(\d+)$/);
    return m ? Math.max(max, parseInt(m[1]!, 10)) : max;
  }, 0);
  return `p-2026-${String(maxNum + 1).padStart(4, "0")}`;
}

export function approve(
  rawArgs: string[],
  dataDir: string = DATA_DIR,
): { id: string; title: string; msekBase: number } {
  // Plocka ut --group <id> / --group=<id> (länkning av dublett), --calc <text>
  // (uträkningen bakom ett belopp satt för hand), --typ <kostnadstyp> och
  // --period <per_ar|engang> ur
  // argumenten.
  let linkTo: string | undefined;
  let calculationFlag: string | undefined;
  let typFlag: string | undefined;
  let periodFlag: string | undefined;
  let noteFlag: string | undefined;
  let basisFlag: string | undefined;
  let basisUrlFlag: string | undefined;
  const args: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i]!;
    if (a === "--group") {
      linkTo = rawArgs[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--group=")) {
      linkTo = a.slice("--group=".length);
      continue;
    }
    if (a === "--calc") {
      calculationFlag = rawArgs[i + 1]?.slice(0, MAX_CALCULATION);
      i++;
      continue;
    }
    if (a.startsWith("--calc=")) {
      calculationFlag = a.slice("--calc=".length).slice(0, MAX_CALCULATION);
      continue;
    }
    if (a === "--typ") {
      typFlag = rawArgs[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--typ=")) {
      typFlag = a.slice("--typ=".length);
      continue;
    }
    if (a === "--note") {
      noteFlag = rawArgs[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--note=")) {
      noteFlag = a.slice("--note=".length);
      continue;
    }
    if (a === "--period") {
      periodFlag = rawArgs[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--period=")) {
      periodFlag = a.slice("--period=".length);
      continue;
    }
    if (a === "--basis") {
      basisFlag = rawArgs[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--basis=")) {
      basisFlag = a.slice("--basis=".length);
      continue;
    }
    if (a === "--basis-url") {
      basisUrlFlag = rawArgs[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--basis-url=")) {
      basisUrlFlag = a.slice("--basis-url=".length);
      continue;
    }
    args.push(a);
  }

  // Ingen skrivning medan sviten muterar data/ — dess återställning skulle ta
  // bort den utan ett ord. Se datalas.ts för vad det kostade.
  const slappLas = taLaset(dataDir, "review approve");
  try {
    return approveLast(dataDir, args, linkTo, calculationFlag, typFlag, basisFlag, basisUrlFlag, periodFlag, noteFlag);
  } finally {
    slappLas();
  }
}

/** Själva godkännandet. Bruten ur `approve` bara för att låset ska ha ett finally. */
function approveLast(
  dataDir: string,
  args: string[],
  linkTo: string | undefined,
  calculationFlag: string | undefined,
  typFlag: string | undefined,
  basisFlag: string | undefined,
  basisUrlFlag: string | undefined,
  periodFlag: string | undefined,
  noteFlag: string | undefined,
): { id: string; title: string; msekBase: number } {
  const items = loadJson<ReviewCandidate[]>(join(dataDir, "needs_review.json"));
  const index = loesKoArgument(items, args[0]);

  const item = items[index]!;
  const cand = item.candidate ?? {};

  // Ett löfte måste vara partiets EGET ord ur partiets egen källa.
  //
  // Kö-posten «Socialdemokraterna lovar att införa bolåneskatt» var hämtad från
  // moderaterna.se/var-politik/bolaneskatt/ — Moderaternas kampanjsida OM
  // Socialdemokraterna. Citatet är motståndarens beskrivning av vad partiet
  // ska göra, inte något partiet sagt. Den hade publicerats som ett
  // socialdemokratiskt löfte på 9 000 miljoner kronor per år; ingen grind såg
  // den, för `failures` var tom.
  //
  // Kartan fanns redan, men bara för att fördela skörden. Här avgör den i
  // stället en publicering: ligger källan på ett annat partis egen domän är
  // det inte partiets ord. Mätt när regeln skrevs: noll av 2 084 publicerade
  // löften och ett av 782 kö-poster.
  const kallansParti = partiForUrl(item.articleUrl ?? "");
  const tillskrivna: string[] = (cand as { parties?: string[] }).parties ?? [];
  if (kallansParti && tillskrivna.length > 0 && !tillskrivna.includes(kallansParti)) {
    console.error(
      `Källan tillhör ett annat parti. Löftet tillskrivs ${tillskrivna.join("/")}, men\n` +
        `${item.articleUrl}\nligger på ${kallansParti}:s egen sajt — det är motståndarens\n` +
        "beskrivning av partiet, inte partiets eget ord.\n\n" +
        "Hitta partiets egen källa, eller avvisa posten:\n" +
        `  pnpm review reject ${index} "källan är ett annat partis sajt"`,
    );
    process.exit(1);
  }

  // Kostnad: bär med beräknad kostnad; tillåt manuell override <low> <base> <high>.
  let cost: CostShape | null = item.cost ?? null;
  if (args.length >= 4) {
    const low = Number(args[1]);
    const base = Number(args[2]);
    const high = Number(args[3]);
    if (![low, base, high].every((n) => Number.isFinite(n) && n >= 0)) {
      console.error("Ogiltiga belopp. Användning: approve <post> <low> <base> <high> (msek)");
      process.exit(1);
    }
    // Den gamla uträkningen räknade fram det gamla beloppet och får inte följa
    // med ett nytt — då visar löftessidan en räkning som inte ger summan intill.
    // Granskaren anger en ny med --calc; utan den står löftet utan uträkning.
    const calculation = calculationFlag ?? undefined;
    if (typFlag !== undefined && !(KOSTNADSTYPER as readonly string[]).includes(typFlag)) {
      console.error(
        `Okänd kostnadstyp: ${typFlag}. Giltiga: ${KOSTNADSTYPER.join(", ")}.`,
      );
      process.exit(1);
    }
    // Utan angiven typ ärvs postens egen, och saknas den blir det "utgift".
    // Ett skattesänkningslöfte utan färdig kostnad blev då en utgift — därför
    // varnar vi när granskaren sätter belopp på en post som ingen typ har.
    if (typFlag === undefined && !cost) {
      console.warn(
        "Varning: posten saknar kostnadstyp och publiceras som utgift. Sänker löftet\n" +
          `         en skatt eller en utgift: ange --typ (${KOSTNADSTYPER.join(", ")}).`,
      );
    }
    if (basisFlag !== undefined && !(BASISVARDEN as readonly string[]).includes(basisFlag)) {
      console.error(`Okänd källnivå: ${basisFlag}. Giltiga: ${BASISVARDEN.join(", ")}.`);
      process.exit(1);
    }
    if (periodFlag !== undefined && !(PERIODER as readonly string[]).includes(periodFlag)) {
      console.error(`Okänd period: ${periodFlag}. Giltiga: ${PERIODER.join(", ")}.`);
      process.exit(1);
    }
    cost = {
      type: typFlag ?? cost?.type ?? "utgift",
      period: periodFlag ?? cost?.period ?? "per_ar",
      msek_low: Math.round(low),
      msek_base: Math.round(base),
      msek_high: Math.round(high),
      // `basis` säger hur förankrat beloppet är, och det fältet får aldrig
      // beskriva ett annat belopp än det som står bredvid.
      //
      // Kö-postens basis ärvdes förut rakt av. Sätter granskaren ett NYTT
      // belopp är den etiketten fel: den säger «en språkmodell uppskattade
      // det här» om en siffra modellen inte längre står bakom. Mätt
      // 2026-08-15: noll av 134 kö-poster vilade på partiets egen siffra,
      // och 345 av 425 granskade löften bar `llm_estimat` — regeln att
      // partiets egen siffra gäller gick inte att uttrycka i verktyget.
      //
      // Nu: den som sätter beloppet säger också var det kommer ifrån.
      // Utan `--basis` blir det `granskare` — en människa satte det — och
      // aldrig kö-postens gamla etikett.
      basis: basisFlag ?? "granskare",
      basis_url: basisUrlFlag ?? (basisFlag ? null : cost?.basis_url ?? null),
      // Noten beskriver hur beloppet kommit till, och den måste beskriva DET
      // belopp som står bredvid.
      //
      // Samma regel som för uträkningen, av samma skäl — men den fanns bara för
      // uträkningen. Kö-postens note ärvdes rakt av, så när granskaren satte ett
      // nytt belopp följde beskrivningen av det gamla med. Sju löften som sattes
      // till noll 2026-08-21 bar noter som «prissatt som statens stödandel …»
      // och «kostnad = ersättning/markinköp … fördelat på ~10 år» — intill en
      // nolla. Läsaren möter då en förklaring av ett belopp som inte står där.
      //
      // Nu: den som sätter beloppet skriver noten själv med --note, annars står
      // bara att en människa satt det. Uträkningen bär resonemanget och är
      // obligatorisk, så ingenting går förlorat.
      method_note: noteFlag ? `${noteFlag.trim()} (belopp satt av granskare)` : "(belopp satt av granskare)",
      ...(calculation ? { calculation } : {}),
      confidence: 0.9,
    };
  } else if (calculationFlag) {
    cost = cost ? { ...cost, calculation: calculationFlag } : cost;
  }

  if (!cost) {
    console.error(
      "Posten saknar kostnad. Ange den: pnpm review approve " + index + " <low> <base> <high> (msek)",
    );
    process.exit(1);
  }

  // Uträkningen är offentlig, och det måste gälla vid den punkt där något blir
  // publicerat — inte bara när granskaren råkar sätta ett nytt belopp. Kön bär
  // poster vars kostnadssteg havererat: de har siffror, de ser färdiga ut, och
  // godkänns de som de står publiceras ett belopp utan ett enda steg bakom sig.
  // Tre löften gick den vägen, och alla tre visade sig vara fel när de lästes.
  // Kontrollen låg tidigare som en varning i den ena grenen och missade därför
  // just den väg posterna faktiskt tog.
  // Taket gällde bara `--calc`, som kapas vid MAX_CALCULATION. En ÄRVD
  // uträkning gick förbi: kö-posten p-2026-2209 publicerades med 803 tecken och
  // fälldes först av schemaprovet, efter att löftet redan låg i promises.json.
  // Kapa inte — en avhuggen uträkning slutar mitt i ett led och blir omöjlig att
  // följa. Säg ifrån, så att en människa kortar den med förståndet i behåll.
  if ((cost.calculation ?? "").length > MAX_CALCULATION) {
    console.error(
      `Uträkningen är ${(cost.calculation ?? "").length} tecken; taket är ${MAX_CALCULATION}.\n` +
        "Den visas publikt på löftessidan och schemat vägrar längre text.\n\n" +
        `  pnpm review approve ${index} <low> <base> <high> --calc "…"\n\n` +
        "Korta den så att varje led står kvar — kapa den inte på mitten.",
    );
    process.exit(1);
  }

  if (((cost.calculation ?? "").trim()) === "") {
    console.error(
      "Uträkningen saknas, och den visas publikt på löftessidan — ett belopp\n" +
        "utan steg bakom sig går inte att följa för den som läser.\n\n" +
        `  pnpm review approve ${index} <low> <base> <high> --calc "…"\n\n` +
        "I issue-flödet: skriv en rad som börjar «Uträkning:» under kommandot.",
    );
    process.exit(1);
  }

  const promises = loadJson<PromiseEntry[]>(join(dataDir, "promises.json"));
  const newId = nextId(promises);
  const title = cand.title ?? item.articleTitle ?? "Okänt löfte";

  // Dublettlänkning: dela group_id med målet (R3 räknar gruppen en gång).
  let group_id: string | null = null;
  let groupTargetModified = false;
  if (linkTo) {
    const target = promises.find((p) => p.id === linkTo);
    if (!target) {
      console.error(`Hittade inget löfte att länka till: ${linkTo}`);
      process.exit(1);
    }
    group_id = target.group_id ?? `g-${linkTo}`;
    if (!target.group_id) {
      target.group_id = group_id;
      groupTargetModified = true;
    }
  }

  const newPromise: PromiseEntry = {
    id: newId,
    group_id,
    title,
    slug: slugify(title),
    parties: cand.parties ?? [],
    person: cand.person ?? null,
    quote: cand.quote ?? "",
    date_stated: new Date().toISOString().slice(0, 10),
    source: {
      url: item.articleUrl,
      domain: domainOf(item.articleUrl),
      // Fylls av arkiv-backfillsteget (scripts/archive-backfill.mts) vid nästa
      // pipelinekörning — SPEC §6.2 "nytt försök nästa run tills satt".
      archive_url: null,
      fetched_at: new Date().toISOString(),
    },
    category: cand.category ?? "övrigt",
    cost: { ...cost },
    // Beloppet i citatet är INTE en finansieringsuppgift. Fältet fylldes förut
    // med `amount_in_text_msek`, och då hamnade ISK-gränsen på 500 000 kronor,
    // barnavdragets 10 000 per barn och ett anslag på 16 miljoner i fältet för
    // vad partiet säger att löftet finansieras med — och drogs av från vad
    // partiernas löften kostar. Beskriver löftet ingen finansiering är fältet
    // tomt (rättat på p-2026-0463, p-2026-0465 och p-2026-0571).
    financing_claimed: {
      described: false,
      summary: null,
      msek: null,
    },
    comparisons: [],
    quip: null,
    status: "aktiv",
    history: [],
    extraction: {
      model: "review",
      verified_by: "owner",
      run_id: `review-${new Date().toISOString().slice(0, 13)}`,
    },
  };

  // Kvalitetsfiltret, som grind. Hashen räknas på löftet som det FAKTISKT
  // kommer att publiceras — inte på kö-posten — så ett belopp satt för hand
  // vid godkännandet kräver att just det beloppet är prövat. Prövningen kan
  // stå under kö-postens issue-id, under den innehållshärledda kö-nyckeln
  // eller under löftets id om det redan funnits. Se `provningar.ts`.
  const grind = provningsGrind(
    lasProvningar(dataDir),
    [`ko:${reviewId(item)}`, konyckel(item.articleUrl, cand.quote), newId],
    "lofte",
    newPromise as unknown as Record<string, unknown>,
  );
  if (!grind.ok) {
    console.error(`Godkännandet stoppades: posten ${grind.skal}`);
    process.exit(1);
  }

  promises.push(newPromise);
  promises.sort((a, b) => a.id.localeCompare(b.id));
  const remaining = items.filter((_, i) => i !== index);

  saveJson(join(dataDir, "promises.json"), promises);
  saveJson(join(dataDir, "needs_review.json"), remaining);

  // Håll data_hash + "senast uppdaterad" i synk vid varje godkännande (annars
  // släpar de tills nästa pipelinekörning — se DECISION_LOG 2026-07-08).
  appendChangelog(dataDir, {
    run_id: `review-${newId}`,
    added: [newId],
    updated: groupTargetModified ? [linkTo!] : [],
    retracted: [],
    data_hash: computeDataHash(promises),
    timestamp: new Date().toISOString(),
  });

  const linkNote = group_id ? ` [länkad till group ${group_id}]` : "";
  console.log(`Godkänd: ${newId} "${title}" — ${cost.msek_base} msek (${cost.basis})${linkNote}`);
  console.log(`Commit-meddelande: data: review approve ${newId}`);
  return { id: newId, title, msekBase: cost.msek_base };
}

export function reject(
  indexStr: string,
  reason: string,
  dataDir: string = DATA_DIR,
): { title: string } {
  // Samma skäl som i `approve`: sviten återställer data/ ur en säkerhetskopia,
  // och en avvisning skriven under tiden försvinner spårlöst.
  const slappLas = taLaset(dataDir, "review reject");
  try {
    return rejectLast(indexStr, reason, dataDir);
  } finally {
    slappLas();
  }
}

/** Själva avvisningen. Bruten ur `reject` bara för att låset ska ha ett finally. */
function rejectLast(indexStr: string, reason: string, dataDir: string): { title: string } {
  const items = loadJson<ReviewCandidate[]>(join(dataDir, "needs_review.json"));
  const index = loesKoArgument(items, indexStr);

  const item = items[index]!;
  const title = item.candidate?.title ?? item.articleTitle ?? "(okänd)";
  const remaining = items.filter((_, i) => i !== index);
  saveJson(join(dataDir, "needs_review.json"), remaining);

  // Avvisningen ska lämna spår. Utan minnet hittar nästa skörd samma mening i
  // samma dokument och lägger in den på nytt — det hände tre gånger i rad i
  // början av augusti. Mänskligt beslut 2026-08-09; se `avvisningar.ts`.
  const url = item.articleUrl ?? "";
  const citat = item.candidate?.quote ?? "";
  if (url !== "" && citat !== "") {
    const minne = lasAvvisade(dataDir);
    saveJson(
      join(dataDir, "avvisade.json"),
      avvisa(minne, url, citat, reason, new Date().toISOString().slice(0, 10)),
    );
  }
  console.log(`Avvisad: "${title}" — ${reason}`);
  return { title };
}

/** Avvisningsminnet, eller en tom lista när filen ännu inte finns. */
export function lasAvvisade(dataDir: string = DATA_DIR): Avvisning[] {
  try {
    return loadJson<Avvisning[]>(join(dataDir, "avvisade.json"));
  } catch {
    return [];
  }
}

/**
 * Häver en avvisning, så att kandidaten kan komma tillbaka i kön.
 *
 * Mänskligt beslut 2026-08-09: en avvisning ska gå att häva. Ett löfte som
 * upprepas i valmanifestet väger tyngre än samma mening i ett tal. Det gamla
 * skälet står kvar — historik skrivs inte om.
 */
export function havAvvisning(nyckel: string, skal: string, dataDir: string = DATA_DIR): void {
  const minne = lasAvvisade(dataDir);
  const ut = hav(minne, nyckel, skal, new Date().toISOString().slice(0, 10));
  if (!ut) {
    console.error(`Ingen avvisning med nyckeln ${nyckel}. Kör \`pnpm review avvisade\` för att se dem.`);
    process.exit(1);
  }
  saveJson(join(dataDir, "avvisade.json"), ut);
  const post = ut.find((a) => a.nyckel === nyckel)!;
  console.log(`Hävd: ${nyckel}\n  avvisades ${post.datum}: ${post.skal}\n  hävs ${post.havd!.datum}: ${skal}`);
}

/** Listar avvisningsminnet, så att en nyckel går att hitta utan att räknas fram. */
export function listaAvvisade(dataDir: string = DATA_DIR): void {
  const minne = lasAvvisade(dataDir);
  if (minne.length === 0) {
    console.log("Avvisningsminnet är tomt.");
    return;
  }
  console.log(`${minne.length} avvisning(ar), varav ${minne.filter((a) => a.havd).length} hävda:\n`);
  for (const a of minne) {
    console.log(`${a.nyckel}  ${a.havd ? "HÄVD" : "gäller"}  ${a.datum}`);
    console.log(`   ${a.citat.slice(0, 96)}`);
    console.log(`   ${a.url}`);
    console.log(`   skäl: ${a.skal}`);
    if (a.havd) console.log(`   hävd ${a.havd.datum}: ${a.havd.skal}`);
    console.log("");
  }
}

/**
 * Manuell inrapportering av ett löfte modellen missat (t.ex. uttalande i
 * rikssänd TV). Läser en JSON-fil och lägger den i needs_review för granskning —
 * granskaren vouchar för källan vid approve. Mall: {title, parties, quote,
 * category, source, date_stated?, amount_in_text_msek?, person?, cost?}.
 */
function add(file: string | undefined, dataDir: string = DATA_DIR): void {
  if (!file) {
    console.error('Användning: pnpm review add <fil.json>');
    console.error('  Filen ska innehålla: {"title","parties":["s"],"quote","category","source", ...}');
    process.exit(1);
  }
  const m = loadJson<Record<string, unknown>>(file);
  for (const req of ["title", "parties", "quote", "source"]) {
    if (!m[req]) {
      console.error(`Manuell post saknar obligatoriskt fält: ${req}`);
      process.exit(1);
    }
  }

  const VALID_PARTIES = ["s", "m", "sd", "c", "v", "kd", "l", "mp"];
  const VALID_CATEGORIES = [
    "välfärd", "skatter", "försvar", "klimat-miljö", "rättsväsende",
    "utbildning", "infrastruktur", "migration", "övrigt",
  ];
  if (!/^https:\/\//.test(String(m.source))) {
    console.error(
      "Källan måste vara en https-länk — löften behöver en citerbar URL (t.ex. SVT-programmets sida eller klipp).",
    );
    process.exit(1);
  }
  const parties = m.parties as unknown;
  if (!Array.isArray(parties) || parties.length === 0 || !parties.every((p) => VALID_PARTIES.includes(String(p)))) {
    console.error(`"parties" måste vara minst en kod ur: ${VALID_PARTIES.join(", ")}`);
    process.exit(1);
  }
  const category = m.category ? String(m.category) : "övrigt";
  if (!VALID_CATEGORIES.includes(category)) {
    console.error(`Ogiltig kategori. Tillåtna: ${VALID_CATEGORIES.join(", ")}`);
    process.exit(1);
  }

  const entry: ReviewCandidate = {
    candidate: {
      title: String(m.title),
      parties: m.parties as string[],
      quote: String(m.quote),
      category: m.category ? String(m.category) : "övrigt",
      person: (m.person as { name: string; role: string } | null) ?? null,
      amount_in_text_msek: (m.amount_in_text_msek as number | null) ?? null,
    },
    failures: [],
    articleUrl: String(m.source),
    articleTitle: String(m.title),
    manualReason: "Manuellt inrapporterad — granska källans trovärdighet och sätt kostnad",
  };
  if (m.cost) entry.cost = m.cost as CostShape;

  const items = loadJson<ReviewCandidate[]>(join(dataDir, "needs_review.json"));
  items.push(entry);
  saveJson(join(dataDir, "needs_review.json"), items);

  console.log(`Tillagd i needs_review som [${items.length - 1}]: "${m.title}".`);
  console.log(
    `Godkänn med: pnpm review approve ${items.length - 1} <low> <base> <high>   (msek, om inget belopp angetts)`,
  );
}

/** Löser ett review-id till aktuellt index i kön, eller avslutar med fel. */
function resolveIdOrExit(id: string | undefined): number {
  if (!id) {
    console.error("Ange ett review-id (12 hex-tecken ur issue-titeln).");
    process.exit(1);
  }
  const items = loadJson<ReviewCandidate[]>(join(DATA_DIR, "needs_review.json"));
  const index = findIndexByReviewId(items, id);
  if (index < 0) {
    console.error(`Ingen kö-post med review-id ${id} — redan hanterad?`);
    process.exit(1);
  }
  return index;
}

// CLI körs ENDAST som direkt entrypoint (pnpm review …) — modulen importeras
// också av sync-review-issues/handle-review-comment och får då inte exekvera.
import { pathToFileURL } from "node:url";
const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

const cliArgv: string[] = isCli ? process.argv.slice(2) : ["__noop__"];
const [command, ...args] = cliArgv;

switch (command) {
  case "__noop__":
    break;
  case "list":
    list();
    break;
  case "approve-id": {
    const index = resolveIdOrExit(args[0]);
    approve([String(index), ...args.slice(1)]);
    break;
  }
  case "reject-id": {
    const index = resolveIdOrExit(args[0]);
    if (!args[1]) {
      console.error("Användning: pnpm review reject-id <review-id> <orsak>");
      process.exit(1);
    }
    reject(String(index), args.slice(1).join(" "));
    break;
  }
  case "approve":
    if (!args[0]) {
      console.error(
        'Användning: pnpm review approve <post> [low base high] [--calc "uträkningen"]\n' +
          '  <post> är ett review-id (tolv tecken, står i listningen) eller ett index.\n' +
          '  Id:t är det som håller — index flyttar sig när poster ovanför avgörs.\n' +
          '                    [--typ <kostnadstyp>] [--period <per_ar|engang>]\n' +
          '                    [--basis <källnivå>] [--basis-url <adress>]',
      );
      process.exit(1);
    }
    approve(args);
    break;
  case "avvisade":
    listaAvvisade();
    break;
  case "hav": {
    if (args.length < 2) {
      console.error("Användning: pnpm review hav <nyckel> <skäl>");
      process.exit(1);
    }
    havAvvisning(args[0]!, args.slice(1).join(" "));
    break;
  }
  case "reject":
    if (!args[0] || !args[1]) {
      console.error("Användning: pnpm review reject <post> <orsak>  (<post> = review-id eller index)");
      process.exit(1);
    }
    reject(args[0], args.slice(1).join(" "));
    break;
  case "add":
    add(args[0]);
    break;
  default:
    console.log("Användning: pnpm review <list|approve|reject|add>");
    console.log("  list                         Visa poster i needs_review");
    console.log("  approve <post> [low base high] [--group p-XXXX]  Godkänn; kostnad; länka dublett");
    console.log("           [--typ <kostnadstyp>] [--period <per_ar|engang>] [--basis <källnivå>]");
    console.log("  reject <post> <orsak>        Avvisa post\n" +
      "  <post> är ett review-id (tolv tecken ur listningen) eller ett index.\n" +
      "  Skriv id. Index flyttar sig så snart en post ovanför avgörs.");
    console.log("  avvisade                     Visa avvisningsminnet");
    console.log("  hav <nyckel> <skäl>          Häv en avvisning så posten kan komma tillbaka");
    console.log("  add <fil.json>               Lägg in ett manuellt inrapporterat löfte för granskning");
    process.exit(command ? 1 : 0);
}
