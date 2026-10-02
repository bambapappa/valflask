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
  // Unknown legacy date provenance must not blank the site's default view.
  // Each promise keeps its verified period label, and readers can filter it.
  valdag: "alla",
};

export const ALLA_LOFTESFILTER: Loeftesfilter[] =
  (["parti", "utlovat", "alla"] as const).flatMap((underlag) =>
    (["reform", "inriktning", "alla"] as const).flatMap((loftestyp) =>
      (["fore", "valdagen", "efter", "oklar", "alla"] as const).map((valdag) =>
        ({ underlag, loftestyp, valdag }))));

/**
 * Samlad mänsklig bedömning 2026-10-02 av det befintliga beståndet.
 * Den gäller ID-serien fram till p-2026-4667, vars publicerade dataversion
 * var 9ac291b8b39a796bbd50c4c28735ae5de2e7d678d2e34eb218956fb17a597344.
 * Endast poster som också samlades in före valdagen och har ett datum före
 * valdagen omfattas. Nya ID:n måste ha egen källgrund.
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
  const fetchedAt = promise.source.fetched_at;
  if (typeof fetchedAt !== "string") return false;
  const fetchedDate = fetchedAt.slice(0, 10);
  return giltigtKalenderdatum(fetchedDate) && fetchedDate < VALDAGEN_2026;
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
