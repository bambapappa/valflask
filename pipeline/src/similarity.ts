/**
 * Lättviktig dublett-heuristik (§5.3-anda). Flaggar TROLIGA dubletter — t.ex. ett
 * partipressmeddelande och en tidning som skriver om samma löfte — för manuell
 * granskning. Slår aldrig ihop automatiskt; människan länkar (delad group_id) i review.
 */

export interface ExistingPromiseLite {
  id: string;
  title: string;
  parties: string[];
  category: string;
  group_id: string | null;
}

export interface DupKey {
  title: string;
  parties: string[];
  category: string;
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFC")
      .replace(/[^a-z0-9åäöéèü ]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/** Jaccard-likhet (0–1) på ordmängder — robust mot ordföljd och småord. */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Returnerar det mest lika befintliga löftet som troligen är SAMMA löfte:
 * partiöverlapp + samma kategori + titellikhet ≥ tröskel. Annars null.
 */
export function findPossibleDuplicate(
  candidate: DupKey,
  existing: ExistingPromiseLite[],
  // Lågt satt med flit: samma parti + kategori filtrerar redan hårt, och en
  // felflagg går bara till review (människan avgör). Hellre fånga än missa.
  threshold = 0.3,
): ExistingPromiseLite | null {
  const cparties = new Set(candidate.parties);
  let best: ExistingPromiseLite | null = null;
  let bestSim = threshold;
  for (const e of existing) {
    if (e.category !== candidate.category) continue;
    if (!e.parties.some((p) => cparties.has(p))) continue;
    const sim = titleSimilarity(candidate.title, e.title);
    if (sim >= bestSim) {
      best = e;
      bestSim = sim;
    }
  }
  return best;
}

/**
 * Samma politik hos ett ANNAT parti (inget partiöverlapp): samma kategori +
 * hög titellikhet. Fångar t.ex. att flera partier lovar 5 % av BNP till
 * försvaret — sådana ska group-länkas (R3: räknas en gång i totalen/koalitioner,
 * fullt i partijämförelsen). Högre tröskel än intra-parti eftersom partier
 * formulerar samma politik olika och flaggan bara ger ett --group-förslag i
 * review — men fortfarande hellre fånga än missa: människan avgör.
 */
export function findCrossPartyDuplicate(
  candidate: DupKey,
  existing: ExistingPromiseLite[],
  // 0.35: L/C:s "5 procent av BNP"-par — flaggskeppsfallet — ligger på 0.375
  // (partier ordval skiljer: "fem"/"5", "försvaret"/"försvarsanslagen").
  threshold = 0.35,
): ExistingPromiseLite | null {
  const cparties = new Set(candidate.parties);
  let best: ExistingPromiseLite | null = null;
  let bestSim = threshold;
  for (const e of existing) {
    if (e.category !== candidate.category) continue;
    if (e.parties.some((p) => cparties.has(p))) continue; // intra-parti hanteras ovan
    const sim = titleSimilarity(candidate.title, e.title);
    if (sim >= bestSim) {
      best = e;
      bestSim = sim;
    }
  }
  return best;
}
