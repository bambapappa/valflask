import type { PromisePost } from "./data";
import { REGERINGSGRANS_2026, verifieradRegeringsgrans, type Regeringsgrans } from "./regeringsgrans.ts";

/** Oberoende läsval för belopp, löftestyp, valdag och regeringens tillträde. */
export type Beloppsunderlag = "parti" | "utlovat" | "alla";
export type LoeftestypFilter = "reform" | "inriktning" | "alla";
export type ValdagFilter = "fore" | "valdagen" | "efter" | "oklar" | "alla";
export type RegeringFilter = "fore" | "tilltradesdagen" | "efter" | "oklar" | "alla";
export const VALDAGEN_2026 = "2026-09-13";

export interface Loeftesfilter {
  underlag: Beloppsunderlag;
  loftestyp: LoeftestypFilter;
  valdag: ValdagFilter;
  regering?: RegeringFilter;
}

export const STANDARD_LOFTESFILTER: Loeftesfilter = {
  underlag: "parti",
  loftestyp: "reform",
  // Unknown legacy date provenance must not blank the site's default view.
  // Each promise keeps its verified period label, and readers can filter it.
  valdag: "alla",
  regering: "alla",
};

export function allaLoeftesfilter(grans: Regeringsgrans = REGERINGSGRANS_2026): Loeftesfilter[] {
  return   (["parti", "utlovat", "alla"] as const).flatMap((underlag) =>
    (["reform", "inriktning", "alla"] as const).flatMap((loftestyp) =>
      (["fore", "valdagen", "efter", "oklar", "alla"] as const).flatMap((valdag) =>
        (verifieradRegeringsgrans(grans) ? ["fore", "tilltradesdagen", "efter", "oklar", "alla"] as const : ["alla"] as const).map((regering) =>
          ({ underlag, loftestyp, valdag, regering })))));
}
export const ALLA_LOFTESFILTER = allaLoeftesfilter();

/**
 * Samlad mänsklig bedömning 2026-10-02 av det befintliga beståndet.
 * Den gäller ID-serien fram till p-2026-4667, vars publicerade dataversion
 * var 9ac291b8b39a796bbd50c4c28735ae5de2e7d678d2e34eb218956fb17a597344.
 * Poster i denna frysta ID-serie med ett registrerat datum före valdagen
 * omfattas. Nya ID:n måste ha egen källgrund.
 */
const SAMMANLAGD_FORVALSDAGSBEDOMNING = { maxLofteNummer: 4667 } as const;

function giltigtKalenderdatum(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function omfattasAvSamladBedomning(promise: PromisePost, date: string): boolean {
  if (date >= VALDAGEN_2026 || promise.source.date_basis != null) return false;
  const match = /^p-2026-(\d{4})$/.exec(promise.id);
  if (!match || Number(match[1]) > SAMMANLAGD_FORVALSDAGSBEDOMNING.maxLofteNummer) return false;
  return true;
}

/** Insamlingsdag ensam styr inte perioden för nya löften. */
export function valdagKategori(promise: PromisePost): Exclude<ValdagFilter, "alla"> {
  const date = promise.date_stated;
  if (!giltigtKalenderdatum(date)) return "oklar";
  const harKallgrund = promise.source.date_basis === "kalla";
  if (!harKallgrund && !omfattasAvSamladBedomning(promise, date)) return "oklar";
  if (date < VALDAGEN_2026) return "fore";
  if (date === VALDAGEN_2026) return "valdagen";
  return "efter";
}

/** En samlad före-valdagsbedömning ger ingen exakt dag för regeringsgränsen. */
export function regeringKategori(promise: PromisePost, grans: Regeringsgrans = REGERINGSGRANS_2026): Exclude<RegeringFilter, "alla"> | "ej_faststalld" {
  const tilltrade = verifieradRegeringsgrans(grans);
  if (tilltrade === null) return "ej_faststalld";
  if (valdagKategori(promise) === "fore" && tilltrade >= VALDAGEN_2026) return "fore";
  const datum = promise.date_stated;
  if (promise.source.date_basis !== "kalla" || !giltigtKalenderdatum(datum)) return "oklar";
  return datum < tilltrade ? "fore" : datum === tilltrade ? "tilltradesdagen" : "efter";
}

export function regeringEtikett(promise: PromisePost): string {
  return { fore: "Före regeringens tillträde", tilltradesdagen: "På tillträdesdagen", efter: "Efter regeringens tillträde", oklar: "Tidpunkt mot regeringen oklar", ej_faststalld: "Regeringens tillträdesdatum inte fastställt" }[regeringKategori(promise)];
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

export function matcharLoeftesfilter(promise: PromisePost, filter: Loeftesfilter, grans: Regeringsgrans = REGERINGSGRANS_2026): boolean {
  const rattUnderlag =
    filter.underlag === "alla" ||
    (filter.underlag === "parti" ? harPartietsBelopp(promise) : arUtlovatBerakning(promise));
  const rattTyp = filter.loftestyp === "alla" || promise.loftestyp === filter.loftestyp;
  const rattValdag = filter.valdag === "alla" || valdagKategori(promise) === filter.valdag;
  const rattRegering = !filter.regering || filter.regering === "alla" || regeringKategori(promise, grans) === filter.regering;
  return rattUnderlag && rattTyp && rattValdag && rattRegering;
}

export function filtreraLoeften(promises: PromisePost[], filter: Loeftesfilter, grans: Regeringsgrans = REGERINGSGRANS_2026): PromisePost[] {
  return promises.filter((promise) => matcharLoeftesfilter(promise, filter, grans));
}

export function filterNyckel(filter: Loeftesfilter): string {
  return `${filter.underlag}:${filter.loftestyp}:${filter.valdag}:${filter.regering ?? "alla"}`;
}

/** Dela samma statiska vy när flera datumval ännu ger exakt samma urval. */
export function loftesvyer(promises: PromisePost[], grans: Regeringsgrans = REGERINGSGRANS_2026): Array<{ key: string; keys: string[]; selected: PromisePost[] }> {
  const views: Array<{ key: string; keys: string[]; selected: PromisePost[] }> = [];
  const seen = new Map<string, (typeof views)[number]>();
  for (const filter of allaLoeftesfilter(grans)) {
    const selected = filtreraLoeften(promises, filter, grans);
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
