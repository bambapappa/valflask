import type { PromisePost } from "./data";

/** Två oberoende läsval: vad slags löfte det är och vem som satt beloppet. */
export type Beloppsunderlag = "parti" | "utlovat" | "alla";
export type LoeftestypFilter = "reform" | "inriktning" | "alla";

export interface Loeftesfilter {
  underlag: Beloppsunderlag;
  loftestyp: LoeftestypFilter;
}

export const STANDARD_LOFTESFILTER: Loeftesfilter = {
  underlag: "parti",
  loftestyp: "reform",
};

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
  return rattUnderlag && rattTyp;
}

export function filtreraLoeften(promises: PromisePost[], filter: Loeftesfilter): PromisePost[] {
  return promises.filter((promise) => matcharLoeftesfilter(promise, filter));
}

export function filterNyckel(filter: Loeftesfilter): string {
  return `${filter.underlag}:${filter.loftestyp}`;
}
