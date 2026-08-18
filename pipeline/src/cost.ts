import { readFileSync } from "node:fs";
import type { ExtractionCandidate } from "./gates.ts";
import { R5_CAP_MSEK } from "./gates.ts";
import type { LlmClient } from "./llm.ts";
import { extractJsonPayload } from "./extract.ts";
import type { ComparableCost } from "./similarity.ts";

const A5_SYSTEM = (() => {
  const raw = readFileSync(
    new URL("../prompts/A5-cost.md", import.meta.url),
    "utf8",
  );
  return raw.replace(/^#\s+.*\n/, "").trim();
})();

export interface CostEstimate {
  type: "utgift" | "intäktsminskning" | "besparing" | "intäktsökning";
  period: "per_ar" | "engang";
  msek_low: number;
  msek_base: number;
  msek_high: number;
  /** "granskare" = beloppet är satt för hand av den som godkände löftet. */
  basis: "rut" | "myndighet" | "parti" | "media" | "llm_estimat" | "granskare";
  basis_url: string | null;
  method_note: string;
  /**
   * Den fullständiga, stegvisa uträkningen bakom beloppet (antaganden × räkning).
   * Sparas och visas både i granskning och publikt — så att ett LLM-estimat går
   * att syna i efterhand. Valfritt: deterministiska belopp (basis "parti") och
   * fallback-fall saknar uträkning.
   */
  calculation?: string;
  confidence: number;
}

/**
 * Kapar en not till `max` tecken utan att hugga av mitt i ett ord.
 *
 * Noten är publik text — den står under beloppet på löftessidan. En rå
 * teckenavkapning gav meningar som slutade mitt i ett ord ("jämförbart med
 * befintliga milj"), vilket ser ut som ett fel i datat snarare än som en
 * förkortning. Vi backar därför till närmaste ordgräns och sätter ut ett
 * uteslutningstecken, så att läsaren ser att texten är avkortad.
 *
 * Ligger kvar en gräns alls för att noten är en sammanfattning; den fulla
 * beviskedjan finns i `calculation`, som kapas mildare.
 */
/**
 * Tusenavskiljare som mellanslag — «5 000», inte «5000». Skrivs för hand i
 * stället för med toLocaleString, eftersom uträkningen är publik text som
 * måste bli likadan i varje körning: toLocaleString hämtar sitt mellanslag ur
 * körmiljöns ICU-data och kan ge ett annat tecken på en annan runner.
 */
export function tusental(n: number): string {
  const neg = n < 0;
  const siffror = Math.round(Math.abs(n)).toString();
  let ut = "";
  for (let i = 0; i < siffror.length; i += 1) {
    if (i > 0 && (siffror.length - i) % 3 === 0) ut += " ";
    ut += siffror[i];
  }
  return neg ? `−${ut}` : ut;
}

export function kapaNot(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  // Ett tecken sparas åt uteslutningstecknet.
  const hard = t.slice(0, max - 1);
  const lastSpace = hard.lastIndexOf(" ");
  // Faller tillbaka på den hårda kapningen om ordet är längre än hela taket.
  const cut = lastSpace > max * 0.6 ? hard.slice(0, lastSpace) : hard;
  return `${cut.replace(/[\s,;:.–-]+$/, "")}…`;
}

/**
 * Ett tal ur modellsvaret — men bara när värdet betecknar EXAKT ett tal.
 *
 * Fältet var tidigare `typeof v === "number"`, och allt annat kastades. Det
 * fällde hela kostnadssteget så snart modellen svarade med samma tal som
 * sträng, vilket den gör titt som tätt: `"1200"`, `"1 200"` med tusentalsrymd,
 * eller `"1,5"` med svenskt decimaltecken. Utfallet blev `failedCost`, alltså
 * belopp 0 och tom uträkning — och en nolla i datat ser ut som ett omdöme om
 * att löftet är gratis, inte som en körning som inte gick igenom. **Nitton av
 * 79 poster i kön 2026-08-16 låg där, och fyra av dem var skatte- och
 * fortbildningslöften som säkert kostar pengar.**
 *
 * Toleransen är avsiktligt smal: ett värde som betecknar mer än ett tal ska
 * fortsätta falla. `"100-200"` är ett spann och säger inte vilket tal som
 * avses; `"upp till 100"` och `"minst 100"` är gränser, inte belopp. Att gissa
 * åt modellen vore att uppfinna en siffra, och det är värre än att falla.
 */
function finiteNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;

  // Normalisera rymder (inkl. hårt och smalt blanksteg) och minustecken.
  const t = v
    .replace(/[\u00a0\u202f\u2007\u2009]/gu, " ")
    .replace(/[\u2212\u2013\u2014]/gu, "-")
    .trim();
  if (t === "") return null;

  // Ett ensamt ungefärstecken framför talet ändrar inte VILKET tal som avses.
  const utanCirka = t.replace(/^(?:~|ca\.?|cirka|omkring)\s*/iu, "").trim();

  // Exakt ett tal, inget mer: valfritt minus, siffror med tusentalsrymd, och
  // ett decimaltecken som får vara komma eller punkt. Allt annat faller.
  const m = /^-?\d{1,3}(?: \d{3})*(?:[.,]\d+)?$|^-?\d+(?:[.,]\d+)?$/u.exec(utanCirka);
  if (!m) return null;

  const n = Number(utanCirka.replace(/ /gu, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function placeholder(method_note: string, confidence: number): CostEstimate {
  return {
    type: "utgift",
    period: "per_ar",
    msek_low: 2000,
    msek_base: 4000,
    msek_high: 6000,
    basis: "llm_estimat",
    basis_url: null,
    method_note,
    confidence,
  };
}

/**
 * När kostnadssteget FALLERAR (LLM-anrop dött, ogiltig JSON, saknade tal) får vi
 * INTE returnera ett trovärdigt schablonbelopp (2000/4000/6000) — det maskerar
 * sig som ett riktigt estimat och kan bulk-godkännas (så fick p-2026-0371 base
 * 4000 med noten "LLM-kostnadsanrop misslyckades"). Returnera base 0 + tydlig
 * note + låg confidence → syns i review som "måste sättas", bidrar 0 om det ändå
 * publiceras.
 */
function failedCost(method_note: string): CostEstimate {
  return {
    type: "utgift",
    period: "per_ar",
    msek_low: 0,
    msek_base: 0,
    msek_high: 0,
    basis: "llm_estimat",
    basis_url: null,
    method_note: `${method_note} — belopp MÅSTE sättas manuellt.`,
    confidence: 0.1,
  };
}

/**
 * Engångssignaler i löftet (gåva/inlösen/återköp/engångs, eller "under
 * mandatperioden" = totalbelopp över 4 år). Kostnadssteget defaultar till per_ar
 * (×4 i summan) vilket felaktigt fyrdubblade t.ex. Gripen-gåvan (0043) och
 * landsbygdsinvesteringen (0336). Matchar signal → period tvingas till engang.
 */
export function looksLikeOneOff(text: string): boolean {
  return /\b(?:engångs\w*|en\s+gång|inlösen|återköp|skänk\w*|gåv(?:a|or))\b|under\s+(?:nästa\s+)?mandatperiod/iu.test(
    text,
  );
}

/**
 * Säger källtexten SJÄLV att beloppet återkommer?
 *
 * Motsatt fråga mot `looksLikeOneOff`, och den ställs för att `per_ar` aldrig
 * ska bli ett antagande. Ett belopp bokfört per år räknas fyra gånger i
 * mandatperiodens summa; säger källan ingenting om takten är de tre extra
 * årens pengar våra, inte partiets.
 *
 * Mätt 2026-08-18: av de sju löften nattens körning publicerade förbi
 * granskningskön bar två ett återkommandeord — «bör öka till årlig
 * anslagsnivå på 7 miljarder» och «satsa en havsmiljard årligen» — och deras
 * period var rätt. De fem övriga sade «totalt», «uppgår till» eller ingenting
 * alls, och alla fem fyrdubblades. Miljöpartiets egen artikel bar båda
 * fallen: «årligen» om havsmiljarden, inget om restaureringsmiljarden, och vi
 * satte samma period på båda.
 */
export function angerLopandePeriod(text: string): boolean {
  // Inga `\b`/`\w` kring de svenska orden: i JS är båda ASCII även med
  // u-flaggan, så «årligen» aldrig matchade — ordgränsen håller varken före
  // «å» eller inuti «årlig|en». Provet fällde första versionen på just det.
  // Lookbehind i stället, så att «fyraårig» och «flerårig» inte råkar träffa.
  return /(?<![a-zåäöéèü])(?:årlig|per\s+år|om\s+året|varje\s+år)|\/\s*år(?![a-zåäöéèü])/iu.test(
    text,
  );
}

const TYPES = ["utgift", "intäktsminskning", "besparing", "intäktsökning"];
const PERIODS = ["per_ar", "engang"];

/**
 * Golv för att lita på ett källtextbelopp som TOTALKOSTNAD (basis "parti").
 * Ett nationellt vallöfte under 50 msek är nästan alltid ett per-enhetspris
 * eller tröskelvärde ("30 000 kr per barn", "300 000 kr på ISK") som råkat
 * extraheras som belopp — inte löftets kostnad.
 */
export const PARTI_AMOUNT_FLOOR_MSEK = 50;

/**
 * Per-enhetsbelopp i citatet ("per barn", "1500 kr i månaden") är priser,
 * inte totalkostnader — de gav p-2026-0337 prislappen 30 000 kr på ett
 * miljardlöfte. OBS: "per år" triggar INTE — totalkostnader anges ofta så.
 */
export function looksLikeUnitAmount(quote: string): boolean {
  return /\b(?:per|\/)\s*(?:barn|person|elev|anställd|capita|hushåll|familj|pensionär|student|patient|brukare|medlem|månad|vecka|dag|dygn|timme|mil)\b|\bi\s+(?:månaden|veckan|timmen)\b/iu.test(
    quote,
  );
}

/**
 * Kostnadssättning (§8). Har källtexten ett uttryckligt belopp härleds ett spann
 * deterministiskt (basis "parti", confidence 0.7). Saknas beloppet görs ett
 * LLM-estimat (basis "llm_estimat", markeras med ≈ på sajten) — om llm/model ges.
 * Confidence kapas under verifierat belopp; spannet tvingas low ≤ base ≤ high med
 * high ≥ 1,5 × low (R2) och kapas till R5-taket.
 */
/**
 * Bygger ett riktmärkesblock av jämförbara löften (samma politik hos andra
 * partier m.m.) så LLM:en kan ankra sitt estimat i samma storleksordning.
 */
export function formatComparables(comparables: readonly ComparableCost[]): string {
  if (comparables.length === 0) return "";
  const rows = comparables.map(
    (c) =>
      `${c.id} [${c.party}] ${c.msek_base} msek/${c.period === "per_ar" ? "år" : "engång"} (${c.basis}): ${c.title}`,
  );
  return `\n<JÄMFÖRBARA LÖFTEN>\n${rows.join("\n")}\n</JÄMFÖRBARA LÖFTEN>`;
}

export interface DeviationFlag {
  /** Hur många gånger beloppet avviker från medianen; 0 när ratio är obestämd (0-fall). */
  factor: number;
  median: number;
  message: string;
}

/** Median av jämförbara löftens basbelopp (inklusive nollställda). */
function medianBase(comparables: readonly ComparableCost[]): number {
  const bases = comparables.map((c) => c.msek_base).sort((a, b) => a - b);
  const mid = Math.floor(bases.length / 2);
  return bases.length % 2 === 0 ? (bases[mid - 1]! + bases[mid]!) / 2 : bases[mid]!;
}

/**
 * Flaggar när ett estimat avviker kraftigt (default ≥ 3×) från medianen av
 * jämförbara löften — så granskaren ser i review att "samma politik" prissatts
 * olika (mängdrabatt 500 vs 1 500). Rent en signal till människan; ändrar aldrig
 * beloppet automatiskt. Returnerar null när inget att flagga.
 */
export function costDeviation(
  base: number,
  comparables: readonly ComparableCost[],
  factorThreshold = 3,
): DeviationFlag | null {
  if (comparables.length === 0) return null;
  const median = medianBase(comparables);
  if (median === 0 && base === 0) return null; // båda 0 — inget att flagga
  if (median === 0 || base === 0) {
    return {
      factor: 0,
      median,
      message:
        median === 0
          ? `belopp ${base} men jämförbara ligger på 0`
          : `satt till 0 men jämförbara ligger på ~${median}`,
    };
  }
  const factor = base >= median ? base / median : median / base;
  if (factor < factorThreshold) return null;
  return {
    factor,
    median,
    message: `${base} avviker ${factor.toFixed(1)}× från jämförbara (median ${median})`,
  };
}

export async function estimateCost(
  candidate: ExtractionCandidate,
  llm?: LlmClient,
  model?: string,
  comparables: readonly ComparableCost[] = [],
): Promise<CostEstimate> {
  const amount = candidate.amount_in_text_msek;

  if (
    amount !== null &&
    amount > 0 &&
    amount >= PARTI_AMOUNT_FLOOR_MSEK &&
    !looksLikeUnitAmount(candidate.quote)
  ) {
    const low = Math.round(amount * 0.75);
    const high = Math.round(amount * 1.35);
    // Perioden LÄSES ur källan, den antas inte. Fram till 2026-08-18 stod
    // `period: "per_ar"` hårdkodat här medan LLM-grenen nedan sedan länge
    // vägde in `looksLikeOneOff` — samma rättelse gjord på ett ställe av två.
    // Priset blev fyra löften i en enda körning: V:s «totalt 1,2 miljarder»
    // till Norrland och MP:s restaureringsmiljard fyrdubblades, och V:s
    // tioåriga klimatprogram om 700 miljarder bokfördes per år, vilket gav
    // posten 38,77 procent av hela rikssumman.
    const text = `${candidate.quote} ${candidate.title}`;
    const lopande = angerLopandePeriod(text);
    const engangs = looksLikeOneOff(text);
    // Varken–eller är det farliga fallet: källan säger ett belopp men ingen
    // takt. Då sätts ingen takt av oss — posten går till granskningskön med
    // partiets siffra bevarad, och en människa avgör perioden.
    const periodOkand = !lopande && !engangs;
    return {
      type: "utgift",
      period: lopande ? "per_ar" : "engang",
      msek_low: low,
      msek_base: amount,
      msek_high: high,
      basis: "parti",
      basis_url: null,
      method_note: periodOkand
        ? "Belopp angivet i källtext; källan anger ingen takt — perioden måste avgöras av en människa."
        : "Belopp angivet i källtext.",
      // Stegen är korta här, men de finns: partiet anger sin egen siffra och
      // vi behåller den. Fältet stod tomt fram till 2026-08-16, och i lägen
      // där körningen publicerar utan mänsklig granskning nådde det läsaren
      // som ett belopp utan något bakom sig — p-2026-0865 gick ut med fem
      // miljarder kronor per år och tomt uträkningsfält. En granskare som
      // godkänner löftet skriver en fylligare uträkning i stället för den här.
      calculation:
        `Partiet anger själv beloppet i källtexten: ${tusental(amount)} miljoner kronor. ` +
        `Den siffran är partiets och byts inte ut mot en egen. ` +
        `Spannet är vårt, inte partiets: ${tusental(low)}–${tusental(high)} miljoner kronor, ` +
        `en fjärdedel under och drygt en tredjedel över partiets siffra. Det står för ` +
        `att källtexten anger en nivå utan att skriva ut hur den fasas in eller ` +
        `fördelas över åren.` +
        (periodOkand
          ? ` Källan säger inte om beloppet återkommer varje år eller gäller en gång. ` +
            `Takten är därför inte satt av oss, utan lämnad till den som granskar posten.`
          : ``),
      // Confidence styr routningen i index.ts: under 0,6 går posten till
      // granskningskön i stället för att publiceras. En okänd takt ÄR en lägre
      // säkerhet — fältet används alltså som det är menat, inte som en spak.
      confidence: periodOkand ? 0.5 : 0.7,
    };
  }
  // Per-enhetsbelopp/tröskelvärde eller misstänkt litet belopp: totalen måste
  // estimeras (basis "llm_estimat") — vilket per §8 alltid går till review.

  if (!llm || !model) {
    return placeholder("Inget belopp i källtext; ingen LLM-uppskattning tillgänglig.", 0.3);
  }

  const userPrompt =
    `<LÖFTE>\n` +
    JSON.stringify({
      title: candidate.title,
      quote: candidate.quote,
      category: candidate.category,
    }) +
    `\n</LÖFTE>` +
    formatComparables(comparables);

  let raw: string;
  try {
    raw = await llm.complete(userPrompt, {
      systemPrompt: A5_SYSTEM,
      temperature: 0,
      model,
    });
  } catch {
    return failedCost("LLM-kostnadsanrop misslyckades");
  }

  let p: Record<string, unknown>;
  try {
    p = JSON.parse(extractJsonPayload(raw)) as Record<string, unknown>;
  } catch {
    return failedCost("LLM-kostnadssvar ej tolkbart (ogiltig JSON)");
  }

  const rawLow = finiteNum(p.msek_low);
  const rawBase = finiteNum(p.msek_base);
  const rawHigh = finiteNum(p.msek_high);
  if (rawLow === null || rawBase === null || rawHigh === null) {
    return failedCost("LLM-kostnadssvar saknade giltiga tal");
  }

  let low = Math.max(0, rawLow);
  let base = Math.max(low, rawBase);
  let high = Math.max(base, rawHigh, low * 1.5); // R2: high ≥ 1,5 × low
  low = Math.min(low, R5_CAP_MSEK);
  base = Math.min(base, R5_CAP_MSEK);
  high = Math.min(high, R5_CAP_MSEK);

  const type = TYPES.includes(String(p.type))
    ? (p.type as CostEstimate["type"])
    : "utgift";
  const llmPeriod = PERIODS.includes(String(p.period))
    ? (p.period as CostEstimate["period"])
    : "per_ar";
  // Engångssignal i löftet vinner över LLM:ens per_ar-default (annars ×4-fel).
  const oneOff =
    llmPeriod === "per_ar" &&
    looksLikeOneOff(`${candidate.quote} ${candidate.title}`);
  const period: CostEstimate["period"] = oneOff ? "engang" : llmPeriod;

  const conf = finiteNum(p.confidence) ?? 0.4;
  const confidence = Math.max(0, Math.min(conf, 0.65)); // under verifierat (0.7)

  const baseNote =
    typeof p.method_note === "string" && p.method_note.trim().length > 0
      ? kapaNot(p.method_note, 200)
      : "LLM-estimat utan angivet belopp i källtext.";
  const note = oneOff
    ? kapaNot(`${baseNote} [period satt till engang: engångssignal i löftet]`, 240)
    : baseNote;

  // Full uträkning (antaganden × räkning) — sparas för spårbarhet. Kapas mildare
  // än method_note eftersom det är själva beviskedjan bakom beloppet.
  const calcRaw = typeof p.calculation === "string" ? p.calculation.trim() : "";
  const calculation = calcRaw.length > 0 ? calcRaw.slice(0, 800) : undefined;

  const estimate: CostEstimate = {
    type,
    period,
    msek_low: Math.round(low),
    msek_base: Math.round(base),
    msek_high: Math.round(high),
    basis: "llm_estimat",
    basis_url: null,
    method_note: note,
    confidence,
  };
  if (calculation) estimate.calculation = calculation;
  return estimate;
}
