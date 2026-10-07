import type { PromisePost } from "./data";

/** Obestämbart är inte samma sak som en kostnadsfri åtgärd. */
export function harOkantBelopp(p: PromisePost): boolean {
  return p.cost.harledning?.belopp_okant !== undefined;
}

export function kostnadsluckor(posts: PromisePost[]): { antal: number; ids: string[] } {
  const ids = posts.filter(p => p.status !== "tillbakadragen" && harOkantBelopp(p)).map(p => p.id);
  return { antal: ids.length, ids };
}

