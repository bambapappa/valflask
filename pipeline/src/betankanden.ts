/**
 * Betänkandeindex — voteringars källtexter.
 *
 * En votering gäller en förslagspunkt i ett utskottsbetänkande; betänkandet
 * är därför den text ett bevis-citat för en voteringskoppling ska stå
 * ordagrant i (grind H2). Betänkanden är utskottens dokument — inga
 * partihandlingar — så de lagras i ett eget slimmat index,
 * data/betankanden.json, inte i handlingar.json. Fulltexter lagras aldrig
 * i bulk (b-0012): de hämtas vid behov via dok_id.
 *
 * Nyckeln (rm utan snedstreck + ":" + beteckning, t.ex. "202223:AU10")
 * är exakt formen voteringshandlingars dok_id redan har.
 */

import type { RdDokument } from "./riksdagen.ts";

export interface Betankande {
  /** Riksdagens dokument-id, t.ex. "HA01AU10" — vägen till fulltexten. */
  dok_id: string;
  rm: string;
  beteckning: string;
  datum: string;
  titel: string;
  organ?: string;
}

/** Nyckel i voteringarnas dok_id-form: "2022/23" + "AU10" → "202223:AU10". */
export function betankandeNyckel(rm: string, beteckning: string): string {
  return `${rm.replace("/", "")}:${beteckning}`;
}

/**
 * Normaliserar ett dokumentlista-svar till en indexpost. Utan beteckning
 * finns ingen nyckel att para voteringar mot — då lämnas dokumentet
 * utanför (tomt är ärligt) i stället för att en nyckel gissas ur dok_id.
 */
export function normaliseraBetankande(dok: RdDokument): Betankande | null {
  if (dok.doktyp !== "bet") return null;
  if (!dok.dok_id || !dok.rm || !dok.beteckning || !dok.datum) return null;
  return {
    dok_id: dok.dok_id,
    rm: dok.rm,
    beteckning: dok.beteckning,
    datum: dok.datum,
    titel: dok.titel,
    ...(dok.organ ? { organ: dok.organ } : {}),
  };
}

export function sorteraBetankanden(bs: Betankande[]): Betankande[] {
  return [...bs].sort((a, b) => a.datum.localeCompare(b.datum) || a.dok_id.localeCompare(b.dok_id));
}

/**
 * Idempotent sammanslagning på dok_id: kända poster behålls oförändrade
 * (ingen tyst uppdatering), nya läggs till, allt deterministiskt sorterat.
 */
export function mergeBetankanden(existing: Betankande[], incoming: Betankande[]): Betankande[] {
  const known = new Set(existing.map((b) => b.dok_id));
  const out = [...existing];
  for (const b of sorteraBetankanden(incoming)) {
    if (known.has(b.dok_id)) continue;
    known.add(b.dok_id);
    out.push(b);
  }
  return sorteraBetankanden(out);
}

/** Index nyckel → betänkande för uppslag från voteringars dok_id. */
export function indexeraBetankanden(bs: Betankande[]): Map<string, Betankande> {
  const index = new Map<string, Betankande>();
  for (const b of bs) index.set(betankandeNyckel(b.rm, b.beteckning), b);
  return index;
}
