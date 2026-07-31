/**
 * test-interval.mts — enhetstest för totalFlasketInterval (viktad totalformel,
 * DECISION_LOG 2026-06-29). Körs i sajtens teststil (node --experimental-strip-types).
 */
import { totalFlasketInterval } from "../src/lib/aggregates.ts";
import type { PromisePost } from "../src/lib/data";

let errors = 0;
function check(label: string, cond: boolean, msg?: string): void {
  if (cond) console.log(`  OK: ${label}`);
  else { console.error(`FAIL: ${label}${msg ? ` — ${msg}` : ""}`); errors++; }
}

function p(
  type: "utgift" | "intäktsminskning" | "besparing",
  low: number, base: number, high: number,
  period: "per_ar" | "engang" = "per_ar",
): PromisePost {
  return {
    status: "aktiv",
    cost: { type, period, msek_low: low, msek_base: base, msek_high: high,
      basis: "llm_estimat", basis_url: null, method_note: "x", confidence: 0.4 },
  } as unknown as PromisePost;
}

// base = Σ msek_base × multiplikator (per_ar ×4); = totalFlasket.
{
  const r = totalFlasketInterval([p("utgift", 800, 1000, 1200)], 0.3, 0.8);
  check("base = 1000 × 4 = 4000", r.base === 4000, `fick ${r.base}`);
  check("band symmetriskt runt base", Math.abs((r.high - r.base) - (r.base - r.low)) < 1e-6);
  check("low ≥ 0", r.low >= 0);
}

// besparing exkluderas; intäktsminskning räknas; neutral-noll bidrar 0.
{
  const r = totalFlasketInterval(
    [p("utgift", 100, 100, 100), p("intäktsminskning", 50, 50, 50), p("besparing", 999, 999, 999)],
    0.3, 0.8,
  );
  check("besparing exkluderad, base = (100+50)×4 = 600", r.base === 600, `fick ${r.base}`);
}

// engång: multiplikator 1.
{
  const r = totalFlasketInterval([p("utgift", 10, 10, 10, "engang")], 0.3, 0.8);
  check("engång → ×1, base = 10", r.base === 10, `fick ${r.base}`);
}

// ρ monotonicitet: högre korrelation → bredare band (≥2 osäkra löften).
{
  const set = [p("utgift", 500, 1000, 2000), p("utgift", 500, 1000, 2000), p("utgift", 500, 1000, 2000)];
  const lo = totalFlasketInterval(set, 0.0, 0.8);
  const mid = totalFlasketInterval(set, 0.3, 0.8);
  const hi = totalFlasketInterval(set, 1.0, 0.8);
  check("samma base oavsett ρ", lo.base === mid.base && mid.base === hi.base);
  check("ρ=0 < ρ=0.3 < ρ=1 i bandbredd", lo.sd < mid.sd && mid.sd < hi.sd,
    `sd: ${lo.sd.toFixed(1)} / ${mid.sd.toFixed(1)} / ${hi.sd.toFixed(1)}`);
}

// noll osäkerhet (low=base=high) → sd 0, band = base.
{
  const r = totalFlasketInterval([p("utgift", 1000, 1000, 1000)], 0.3, 0.8);
  check("ingen spridning → sd 0", r.sd === 0);
  check("band kollapsar till base", r.low === r.base && r.high === r.base);
}

// högre täckningsgrad → bredare band.
{
  const set = [p("utgift", 500, 1000, 2000)];
  const r80 = totalFlasketInterval(set, 0.3, 0.8);
  const r95 = totalFlasketInterval(set, 0.3, 0.95);
  check("95% bredare än 80%", (r95.high - r95.low) > (r80.high - r80.low));
}

console.log(errors === 0 ? "\nAlla intervall-tester gröna." : `\n${errors} fel.`);
process.exit(errors === 0 ? 0 : 1);
