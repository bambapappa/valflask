import { readFileSync } from "node:fs";
import type { ExtractionCandidate } from "./gates.ts";
import { R5_CAP_MSEK } from "./gates.ts";
import type { LlmClient } from "./llm.ts";
import { extractJsonPayload } from "./extract.ts";

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

const TYPES = ["utgift", "intäktsminskning", "besparing"];
const PERIODS = ["per_ar", "engang"];

/**
 * Kostnadssättning (§8). Har källtexten ett uttryckligt belopp härleds ett spann
 * deterministiskt (basis "parti", confidence 0.7). Saknas beloppet görs ett
 * LLM-estimat (basis "llm_estimat", markeras med ≈ på sajten) — om llm/model ges.
 * Confidence kapas under verifierat belopp; spannet tvingas low ≤ base ≤ high med
 * high ≥ 1,5 × low (R2) och kapas till R5-taket.
 */
export async function estimateCost(
  candidate: ExtractionCandidate,
  llm?: LlmClient,
  model?: string,
): Promise<CostEstimate> {
  const amount = candidate.amount_in_text_msek;

  if (amount !== null && amount > 0) {
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
    `\n</LÖFTE>`;

  let raw: string;
  try {
    raw = await llm.complete(userPrompt, {
      systemPrompt: A5_SYSTEM,
      temperature: 0,
      model,
    });
  } catch {
    return placeholder("LLM-kostnadsanrop misslyckades.", 0.3);
  }

  let p: Record<string, unknown>;
  try {
    p = JSON.parse(extractJsonPayload(raw)) as Record<string, unknown>;
  } catch {
    return placeholder("LLM-kostnadssvar ej tolkbart (ogiltig JSON).", 0.3);
  }

  const rawLow = finiteNum(p.msek_low);
  const rawBase = finiteNum(p.msek_base);
  const rawHigh = finiteNum(p.msek_high);
  if (rawLow === null || rawBase === null || rawHigh === null) {
    return placeholder("LLM-kostnadssvar saknade giltiga tal.", 0.3);
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
  const period = PERIODS.includes(String(p.period))
    ? (p.period as CostEstimate["period"])
    : "per_ar";

  const conf = finiteNum(p.confidence) ?? 0.4;
  const confidence = Math.max(0, Math.min(conf, 0.65)); // under verifierat (0.7)

  const note =
    typeof p.method_note === "string" && p.method_note.trim().length > 0
      ? p.method_note.slice(0, 200)
      : "LLM-estimat utan angivet belopp i källtext.";

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
