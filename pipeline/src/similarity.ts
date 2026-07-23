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

/** Befintligt löfte med sitt belopp — underlag för kostnadsankring. */
export interface ComparablePromiseLite extends ExistingPromiseLite {
  msek_base: number;
  period: "per_ar" | "engang";
  basis: string;
  status: string;
}

/** Ett jämförbart löfte som riktmärke för ett nytt kostnadsestimat. */
export interface ComparableCost {
  id: string;
  title: string;
  party: string;
  msek_base: number;
  period: "per_ar" | "engang";
  basis: string;
}

/**
 * Lätt svensk avstympning (bara bestämd form/plural, längd ≥ 2) så att samma
 * sakord i olika böjning räknas lika: "mängdrabatten"→"mängdrabatt",
 * "brotten"→"brott". Medvetet konservativ och HÅLLS SKILD från duplettkollarnas
 * `tokens`/`titleSimilarity` så deras trösklar (0,3/0,35) inte rubbas.
 */
const SV_SUFFIXES = ["erna", "arna", "orna", "en", "et", "er", "ar", "or", "na"];
function stem(w: string): string {
  for (const suf of SV_SUFFIXES) {
    if (w.length - suf.length >= 4 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return w;
}
function stemmedTokens(s: string): Set<string> {
  return new Set([...tokens(s)].map(stem));
}

/** Delat sakord (stammat, längd ≥ detta) väger tungt — det är själva politiken. */
const SALIENT_MIN_LEN = 7;

/**
 * Likhetspoäng för ankring: Jaccard på stammade ord PLUS en bonus när titlarna
 * delar ett distinkt sakord. Jaccard ensamt straffar långa titlar som delar ett
 * enda nyckelord ("mängdrabatt") — men det är just det ordet som avgör att det
 * är samma politik. Poängen är intern (ej 0–1) och används för tröskel + rankning.
 */
export function comparableScore(a: string, b: string): number {
  const ta = stemmedTokens(a);
  const tb = stemmedTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  let salient = false;
  for (const t of ta) {
    if (tb.has(t)) {
      inter++;
      if (t.length >= SALIENT_MIN_LEN) salient = true;
    }
  }
  const jaccard = inter / (ta.size + tb.size - inter);
  return jaccard + (salient ? 0.5 : 0);
}

/**
 * Grannarna, inte kopiorna: redan publicerade löften om LIKNANDE politik (samma
 * kategori + likhetspoäng ≥ minSim), oavsett parti, med sitt belopp. Används för
 * att ankra ett nytt LLM-estimat så att samma politik hos olika partier hamnar i
 * samma storleksordning (glappet mängdrabatt 500 vs 1 500 vi rättade för hand).
 *
 * Rena dubbletter fångas separat och går till manuell länkning innan detta
 * anropas — här handlar det om jämförbara, inte identiska, löften. Lägre tröskel
 * än duplettkollarna eftersom vi vill ha ett riktmärke, inte ett påstående om
 * samma löfte; tillbakadragna löften utesluts men nollställda (belopp 0) tas med,
 * eftersom de är giltiga riktmärken för t.ex. ett nytt förbudslöfte.
 */
export function findComparableCosts(
  candidate: { title: string; category: string },
  existing: ComparablePromiseLite[],
  opts: { minSim?: number; maxN?: number } = {},
): ComparableCost[] {
  const minSim = opts.minSim ?? 0.2;
  const maxN = opts.maxN ?? 5;
  const scored: Array<{ e: ComparablePromiseLite; sim: number }> = [];
  for (const e of existing) {
    if (e.category !== candidate.category) continue;
    if (e.status === "tillbakadragen") continue;
    const sim = comparableScore(candidate.title, e.title);
    if (sim >= minSim) scored.push({ e, sim });
  }
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(0, maxN).map(({ e }) => ({
    id: e.id,
    title: e.title,
    party: e.parties[0] ?? "",
    msek_base: e.msek_base,
    period: e.period,
    basis: e.basis,
  }));
}
