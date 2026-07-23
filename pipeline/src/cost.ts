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
  type: "utgift" | "intäktsminskning" | "besparing";
  period: "per_ar" | "engang";
  msek_low: number;
  msek_base: number;
  msek_high: number;
  basis: "rut" | "myndighet" | "parti" | "media" | "llm_estimat";
  basis_url: string | null;
  method_note: string;
  confidence: number;
}

function finiteNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
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

const TYPES = ["utgift", "intäktsminskning", "besparing"];
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
    return {
      type: "utgift",
      period: "per_ar",
      msek_low: Math.round(amount * 0.75),
      msek_base: amount,
      msek_high: Math.round(amount * 1.35),
      basis: "parti",
      basis_url: null,
      method_note: "Belopp angivet i källtext.",
      confidence: 0.7,
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
      ? p.method_note.slice(0, 200)
      : "LLM-estimat utan angivet belopp i källtext.";
  const note = oneOff
    ? `${baseNote} [period satt till engang: engångssignal i löftet]`.slice(0, 240)
    : baseNote;

  return {
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
}
