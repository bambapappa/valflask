import type { PromisePost } from "./data";
import { formatMsek } from "./calc.ts";

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
