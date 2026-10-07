import type { PromisePost } from "./data";
import { formatMsek } from "./calc.ts";
import { promiseNetMsek } from "./aggregates.ts";

/** Obestämbart är inte samma sak som en kostnadsfri åtgärd. */
export function harOkantBelopp(p: PromisePost): boolean {
  return p.cost.harledning?.belopp_okant !== undefined;
}

export function formatPromiseCost(p: PromisePost, period: "mandatperiod" | "grund" = "mandatperiod"): string {
  if (harOkantBelopp(p)) return "Kan inte fastställas";
  return formatMsek(p.cost.msek_base * (period === "mandatperiod" && p.cost.period === "per_ar" ? 4 : 1), p.cost.basis);
}

export function kostnadsluckor(posts: PromisePost[]): { antal: number; ids: string[] } {
  const ids = posts.filter(p => p.status !== "tillbakadragen" && harOkantBelopp(p)).map(p => p.id);
  return { antal: ids.length, ids };
}

/** Publikt API får inte översätta en saknad prislapp till kostnadsfrihet. */
export function apiCost(p: PromisePost) {
  const c = p.cost;
  const unknown = harOkantBelopp(p);
  return {
    type: c.type, period: c.period,
    msek_low: unknown ? null : c.msek_low,
    msek_base: unknown ? null : c.msek_base,
    msek_high: unknown ? null : c.msek_high,
    basis: c.basis, basis_url: c.basis_url, method_note: c.method_note,
    calculation: c.calculation, confidence: c.confidence,
    ...(c.harledning ? {harledning: c.harledning} : {}),
    ...(unknown ? {belopp_status: "okant", belopp_skal: c.harledning!.belopp_okant!.skal} : {}),
  };
}

export function formatPromiseNetCost(p: PromisePost): string {
  return harOkantBelopp(p) ? "Kan inte fastställas" : formatMsek(promiseNetMsek(p), p.cost.basis);
}
