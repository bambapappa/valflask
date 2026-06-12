import type { ExtractionCandidate } from "./gates.ts";

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

export function estimateCost(
  candidate: ExtractionCandidate,
): CostEstimate {
  const amount = candidate.amount_in_text_msek;

  if (amount !== null && amount > 0) {
    const low = Math.round(amount * 0.75);
    const high = Math.round(amount * 1.35);
    return {
      type: "utgift",
      period: "per_ar",
      msek_low: low,
      msek_base: amount,
      msek_high: high,
      basis: "parti",
      basis_url: null,
      method_note: "Belopp angivet i källtext.",
      confidence: 0.7,
    };
  }

  return {
    type: "utgift",
    period: "per_ar",
    msek_low: 2000,
    msek_base: 4000,
    msek_high: 6000,
    basis: "llm_estimat",
    basis_url: null,
    method_note: "LLM-estimat: inget belopp angivet i källtext.",
    confidence: 0.4,
  };
}
