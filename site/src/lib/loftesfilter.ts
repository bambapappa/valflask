import type { PromisePost } from "./data";

/** Tre oberoende läsval: beloppsunderlag, löftestyp och tidpunkt. */
export type Beloppsunderlag = "parti" | "utlovat" | "alla";
export type LoeftestypFilter = "reform" | "inriktning" | "alla";
export type ValdagFilter = "fore" | "valdagen" | "efter" | "oklar" | "alla";
export const VALDAGEN_2026 = "2026-09-13";

export interface Loeftesfilter {
  underlag: Beloppsunderlag;
  loftestyp: LoeftestypFilter;
  valdag: ValdagFilter;
}

export const STANDARD_LOFTESFILTER: Loeftesfilter = {
  underlag: "parti",
  loftestyp: "reform",
  valdag: "fore",
};

export const ALLA_LOFTESFILTER: Loeftesfilter[] =
  (["parti", "utlovat", "alla"] as const).flatMap((underlag) =>
    (["reform", "inriktning", "alla"] as const).flatMap((loftestyp) =>
      (["fore", "valdagen", "efter", "oklar", "alla"] as const).map((valdag) =>
        ({ underlag, loftestyp, valdag }))));

/** En insamling efter valet är inte i sig belägg för när löftet gavs. */
export function valdagKategori(promise: PromisePost): Exclude<ValdagFilter, "alla"> {
  const date = promise.date_stated;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return "oklar";
  if (date < VALDAGEN_2026) return "fore";
  if (date === VALDAGEN_2026) return promise.source.date_basis === "kalla" ? "valdagen" : "oklar";
  return promise.source.date_basis === "kalla" ? "efter" : "oklar";
}

export function valdagEtikett(promise: PromisePost): string {
  switch (valdagKategori(promise)) {
    case "fore": return "Före valdagen";
    case "valdagen": return "På valdagen";
    case "efter": return "Efter valdagen";
    case "oklar": return "Tidpunkt oklar";
  }
}

/** Ett partibelopp är ett belopp som partiet självt har angett i källan. */
export function harPartietsBelopp(promise: PromisePost): boolean {
  return promise.cost.basis === "parti";
}

/**
 * Alla andra grunder är Utlovat.se:s beräkning, även när en myndighets- eller
 * mediekälla är beräkningsankaret. Källan bär då indata, men inte partiets
 * eget belopp.
 */
export function arUtlovatBerakning(promise: PromisePost): boolean {
  return !harPartietsBelopp(promise);
}

export function matcharLoeftesfilter(promise: PromisePost, filter: Loeftesfilter): boolean {
  const rattUnderlag =
    filter.underlag === "alla" ||
    (filter.underlag === "parti" ? harPartietsBelopp(promise) : arUtlovatBerakning(promise));
  const rattTyp = filter.loftestyp === "alla" || promise.loftestyp === filter.loftestyp;
  const rattValdag = filter.valdag === "alla" || valdagKategori(promise) === filter.valdag;
  return rattUnderlag && rattTyp && rattValdag;
}

export function filtreraLoeften(promises: PromisePost[], filter: Loeftesfilter): PromisePost[] {
  return promises.filter((promise) => matcharLoeftesfilter(promise, filter));
}

export function filterNyckel(filter: Loeftesfilter): string {
  return `${filter.underlag}:${filter.loftestyp}:${filter.valdag}`;
}

/** Dela samma statiska vy när flera datumval ännu ger exakt samma urval. */
export function loftesvyer(promises: PromisePost[]): Array<{ key: string; keys: string[]; selected: PromisePost[] }> {
  const views: Array<{ key: string; keys: string[]; selected: PromisePost[] }> = [];
  const seen = new Map<string, (typeof views)[number]>();
  for (const filter of ALLA_LOFTESFILTER) {
    const selected = filtreraLoeften(promises, filter);
    const key = filterNyckel(filter);
    const signature = `${filter.underlag}:${filter.loftestyp}:${selected.map((promise) => promise.id).join(",")}`;
    const existing = seen.get(signature);
    if (existing) existing.keys.push(key);
    else {
      const view = { key, keys: [key], selected };
      views.push(view);
      seen.set(signature, view);
    }
  }
  return views;
}
