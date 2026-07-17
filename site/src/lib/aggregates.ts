import type { PromisePost, Party, Constants, ConstantItem } from "./data";

export type { PromisePost, Party, Constants, ConstantItem };

export function promiseTotalMsek(p: PromisePost): number {
  const multiplier = p.cost.period === "per_ar" ? 4 : 1;
  return p.cost.msek_base * multiplier;
}

export function promiseTotalLowMsek(p: PromisePost): number {
  const multiplier = p.cost.period === "per_ar" ? 4 : 1;
  return p.cost.msek_low * multiplier;
}

export function promiseTotalHighMsek(p: PromisePost): number {
  const multiplier = p.cost.period === "per_ar" ? 4 : 1;
  return p.cost.msek_high * multiplier;
}

export function isActive(p: PromisePost): boolean {
  return p.status !== "tillbakadragen";
}

export function isCostType(p: PromisePost): boolean {
  return p.cost.type === "utgift" || p.cost.type === "intäktsminskning";
}

export function isBesparing(p: PromisePost): boolean {
  return p.cost.type === "besparing";
}

/**
 * R3: en grupp (samma politik hos flera partier, eller dubblerad post inom ett
 * parti) räknas EN gång i summor — det går inte att höja försvaret till 5 % av
 * BNP mer än en gång, oavsett hur många partier som lovar det. Gruppens första
 * post i listordning (= lägst id) representerar den; spannet mellan partiernas
 * olika prislappar redovisas i koalitionsvyns gruppnoter. Partijämförelser
 * påverkas inte av TVÄRPARTI-grupper (varje parti har sin egen medlem), men
 * interna dubbletter inom ett parti kollapsar även där.
 */
export function dedupeByGroup(promises: PromisePost[]): PromisePost[] {
  const seen = new Set<string>();
  const out: PromisePost[] = [];
  for (const p of promises) {
    if (p.group_id) {
      if (seen.has(p.group_id)) continue;
      seen.add(p.group_id);
    }
    out.push(p);
  }
  return out;
}

export function totalFlasket(promises: PromisePost[]): number {
  // isActive-filtret speglas i pipelinens chronicle.totalFlasket — krönikan
  // och startsidan får aldrig räkna olika (extern granskning 2026-07-16).
  return dedupeByGroup(promises.filter(isActive)).filter((p) => isCostType(p)).reduce((s, p) => s + promiseTotalMsek(p), 0);
}

export function totalBesparingar(promises: PromisePost[]): number {
  return dedupeByGroup(promises.filter(isActive)).filter((p) => isBesparing(p)).reduce((s, p) => s + promiseTotalMsek(p), 0);
}

/**
 * Varians för en triangelfördelning (min=low, läge=base, max=high), i (msek)².
 * Källa: standardformeln Var = (a²+b²+c²−ab−ac−bc)/18.
 */
function triangularVariance(low: number, base: number, high: number): number {
  return (low * low + base * base + high * high - low * base - low * high - base * high) / 18;
}

export interface FlasketInterval {
  /** Punktsumma = Σ msek_base × periodmultiplikator (= totalFlasket). */
  base: number;
  /** Nedre/övre gräns för det valda sannolikhetsintervallet (msek), ≥ 0. */
  low: number;
  high: number;
  /** Standardavvikelse för totalsumman (msek). */
  sd: number;
  /** Andel av intervallet, t.ex. 0.8. */
  level: number;
}

/**
 * Fläsket som ett HEDERLIGT intervall i stället för en falsk exakt siffra
 * (DECISION_LOG 2026-06-29). Varje löfte är en triangelfördelning [low,base,high];
 * summan propageras analytiskt: väntevärden (≈ base) adderas, varianser adderas
 * med en korrelationsfaktor ρ. ρ interpolerar mellan ytterligheterna:
 *   ρ=0 → oberoende fel (centrala gränsvärdessatsen, smalt band)
 *   ρ=1 → perfekt korrelerade fel (= naiv Σlow–Σhigh, brett band)
 * Default ρ=0,3 fångar att estimaten delar systematisk metodbias utan att
 * blåsa upp osäkerheten orealistiskt. `level` via normalapproximationens z.
 *
 * Var_total = (1−ρ)·Σσ²ᵢ + ρ·(Σσᵢ)²
 */
export function totalFlasketInterval(
  promises: PromisePost[],
  rho = 0.3,
  level = 0.8,
): FlasketInterval {
  const cost = dedupeByGroup(promises).filter((p) => isCostType(p));
  let base = 0;
  let sumVar = 0;
  let sumSd = 0;
  for (const p of cost) {
    const mult = p.cost.period === "per_ar" ? 4 : 1;
    const lo = p.cost.msek_low * mult;
    const ba = p.cost.msek_base * mult;
    const hi = p.cost.msek_high * mult;
    base += ba;
    const v = Math.max(0, triangularVariance(lo, ba, hi));
    sumVar += v;
    sumSd += Math.sqrt(v);
  }
  const varTotal = (1 - rho) * sumVar + rho * sumSd * sumSd;
  const sd = Math.sqrt(Math.max(0, varTotal));
  const z = zForLevel(level);
  return { base, low: Math.max(0, base - z * sd), high: base + z * sd, sd, level };
}

/** Tvåsidig normal-z för en täckningsgrad (0.8 → 1.2816, 0.9 → 1.6449, 0.95 → 1.96). */
function zForLevel(level: number): number {
  const table: Record<string, number> = { "0.8": 1.2816, "0.9": 1.6449, "0.95": 1.96 };
  return table[level.toString()] ?? 1.2816;
}

export function totalFinancingClaimed(promises: PromisePost[]): number {
  return promises.reduce((s, p) => s + (p.financing_claimed.msek ?? 0), 0);
}

export function financingGap(promises: PromisePost[]): number {
  return totalFlasket(promises) - totalBesparingar(promises) - totalFinancingClaimed(promises);
}

export function partyTotalMsek(promises: PromisePost[], partyCode: string): number {
  // dedupeByGroup EFTER partifiltret: tvärparti-grupper behåller partiets egen
  // medlem (fullt belopp i partijämförelsen), interna dubbletter räknas en gång.
  return dedupeByGroup(promises.filter((p) => isActive(p) && p.parties.includes(partyCode)))
    .reduce((s, p) => s + promiseTotalMsek(p), 0);
}

export function getPromisesForParty(promises: PromisePost[], code: string): PromisePost[] {
  return promises.filter((p) => isActive(p) && p.parties.includes(code));
}

export function countPromises(promises: PromisePost[]): number {
  return promises.filter(isActive).length;
}

export function flasketPerRost(totalMsek: number, votes: number): number {
  return votes > 0 ? (totalMsek * 1000) / votes : 0;
}

export interface CategoryBreakdown {
  category: string;
  totalMsek: number;
  count: number;
}

export function categoryBreakdown(promises: PromisePost[]): CategoryBreakdown[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const p of dedupeByGroup(promises.filter(isActive))) {
    const entry = map.get(p.category) ?? { total: 0, count: 0 };
    entry.total += promiseTotalMsek(p);
    entry.count += 1;
    map.set(p.category, entry);
  }
  return Array.from(map.entries())
    .map(([category, { total, count }]) => ({ category, totalMsek: total, count }))
    .sort((a, b) => b.totalMsek - a.totalMsek);
}

export interface GroupNote {
  group_id: string;
  parties: string[];
  minMsek: number;
  maxMsek: number;
  hasSpread: boolean;
}

export interface CoalitionResult {
  totalFlasket: number;
  totalBesparingar: number;
  totalFinancingClaimed: number;
  financingGap: number;
  promisesCount: number;
  mandatesSum: number;
  groupNotes: GroupNote[];
}

export function coalitionAggregates(
  promises: PromisePost[],
  parties: Party[],
  partyCodes: string[]
): CoalitionResult {
  const partySet = new Set(partyCodes);
  const relevant = promises.filter(
    (p) => isActive(p) && p.parties.some((c) => partySet.has(c))
  );

  const seenGroups = new Map<string, { min: number; max: number; parties: Set<string> }>();
  let totalFlasketVal = 0;
  let totalBesparingVal = 0;
  let totalFinancingVal = 0;
  let promisesCount = 0;
  const countedIds = new Set<string>();

  for (const p of relevant) {
    const t = promiseTotalMsek(p);

    if (p.group_id) {
      const existing = seenGroups.get(p.group_id);
      if (existing) {
        existing.min = Math.min(existing.min, t);
        existing.max = Math.max(existing.max, t);
        for (const c of p.parties) existing.parties.add(c);
      } else {
        seenGroups.set(p.group_id, {
          min: t,
          max: t,
          parties: new Set(p.parties),
        });
      }
    }

    if (p.group_id && countedIds.has(p.group_id)) continue;

    if (isCostType(p)) totalFlasketVal += t;
    else if (isBesparing(p)) totalBesparingVal += t;

    totalFinancingVal += p.financing_claimed.msek ?? 0;
    promisesCount += 1;

    if (p.group_id) {
      countedIds.add(p.group_id);
    } else {
      countedIds.add(p.id);
    }
  }

  const groupNotes: GroupNote[] = Array.from(seenGroups.entries())
    .filter(([, v]) => v.min !== v.max)
    .map(([gid, v]) => ({
      group_id: gid,
      parties: Array.from(v.parties),
      minMsek: v.min,
      maxMsek: v.max,
      hasSpread: true,
    }));

  const mandatesSum = parties
    .filter((p) => partySet.has(p.code))
    .reduce((s, p) => s + p.mandate_2022, 0);

  return {
    totalFlasket: totalFlasketVal,
    totalBesparingar: totalBesparingVal,
    totalFinancingClaimed: totalFinancingVal,
    financingGap: totalFlasketVal - totalBesparingVal - totalFinancingVal,
    promisesCount,
    mandatesSum,
    groupNotes,
  };
}

export function isFixture(promises: PromisePost[]): boolean {
  return promises.some((p) => p.extraction.run_id.startsWith("fixture-"));
}

export interface ComparisonResult {
  constantId: string;
  label: string;
  computed: number;
  unit: string;
  kind: string;
  unverifiable: boolean;
}

export function computeComparisons(
  promise: PromisePost,
  constants: Constants
): ComparisonResult[] {
  const totalKronor = promiseTotalMsek(promise) * 1_000_000;
  // Endast KURERADE jämförelser (tom för nästan alla → sektionen döljs). De
  // gamla auto-jämförelserna (sjuksköterskelöner m.fl.) togs bort: en måttstock
  // som SJÄLV kan vara ett vallöfte är inte neutral (ägarbeslut 2026-07-10).
  // Glasyren är i stället den apolitiska vikt-liknelsen i dryLine().
  const ids = promise.comparisons ?? [];
  const results: ComparisonResult[] = [];

  const vardagliga: ComparisonResult[] = [];
  const kosmiska: ComparisonResult[] = [];
  const infra: ComparisonResult[] = [];

  // Enkronan är myntstapelns byggsten — intern referens, inte en egen jämförelse.
  const COIN_ID = "enkrona_tjocklek_m";
  const coin = constants.items.find((it) => it.id === COIN_ID);
  const coinThicknessM =
    coin && coin.value !== "VERIFIERA" ? (coin.value as number) : null;

  for (const id of ids) {
    const c = constants.items.find((it) => it.id === id);
    if (!c) continue;
    if (c.id === COIN_ID) continue; // intern, renderas aldrig fristående
    if (c.value === "VERIFIERA") {
      const r: ComparisonResult = {
        constantId: c.id,
        label: c.label,
        computed: 0,
        unit: c.unit,
        kind: c.kind,
        unverifiable: true,
      };
      pushByKind(r);
      continue;
    }
    let computed: number;
    let unitOut = c.unit;
    if (c.unit === "m") {
      // Kosmisk: hur långt når en stapel av enkronor för pengarna, mot avståndet?
      if (coinThicknessM === null) {
        const r: ComparisonResult = {
          constantId: c.id,
          label: c.label,
          computed: 0,
          unit: c.unit,
          kind: c.kind,
          unverifiable: true,
        };
        pushByKind(r);
        continue;
      }
      const stackHeightM = totalKronor * coinThicknessM;
      computed = stackHeightM / c.value;
      unitOut = "andel_avstand";
    } else {
      // unit "kr": antal enheter pengarna räcker till
      computed = totalKronor / c.value;
    }
    const r: ComparisonResult = {
      constantId: c.id,
      label: c.label,
      computed,
      unit: unitOut,
      kind: c.kind,
      unverifiable: false,
    };
    pushByKind(r);
  }

  function pushByKind(r: ComparisonResult) {
    if (r.kind === "vardaglig") vardagliga.push(r);
    else if (r.kind === "kosmisk") kosmiska.push(r);
    else infra.push(r);
  }

  const out: ComparisonResult[] = [];
  if (vardagliga.length > 0) out.push(vardagliga[0]);
  if (infra.length > 0) out.push(infra[0]);
  if (kosmiska.length > 0 && out.length < 3) out.push(kosmiska[0]);
  if (out.length < 2 && vardagliga.length > 1) out.push(vardagliga[1]);
  if (out.length < 3 && infra.length > 1) out.push(infra[1]);

  return out.slice(0, 3);
}

export function deterministComparisons(
  promiseId: string,
  comparisons: string[],
  constants: Constants
): ComparisonResult[] {
  const totalKronorPlaceholder = 0;

  function stableHash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h;
  }

  const vardagliga: ComparisonResult[] = [];
  const kosmiska: ComparisonResult[] = [];
  const infras: ComparisonResult[] = [];

  for (const id of comparisons) {
    const c = constants.items.find((it) => it.id === id);
    if (!c) continue;
    const unverifiable = c.value === "VERIFIERA";
    const r: ComparisonResult = {
      constantId: c.id,
      label: c.label,
      computed: 0,
      unit: c.unit,
      kind: c.kind,
      unverifiable,
    };
    if (c.kind === "vardaglig") vardagliga.push(r);
    else if (c.kind === "kosmisk") kosmiska.push(r);
    else infras.push(r);
  }

  const out: ComparisonResult[] = [];

  if (vardagliga.length > 0) {
    const idx = Math.abs(stableHash(promiseId)) % vardagliga.length;
    out.push(vardagliga[idx]);
  }
  if (infras.length > 0) {
    const idx = Math.abs(stableHash(promiseId + "infra")) % infras.length;
    out.push(infras[idx]);
  }
  if (kosmiska.length > 0 && out.length < 3) {
    const idx = Math.abs(stableHash(promiseId + "kosmisk")) % kosmiska.length;
    out.push(kosmiska[idx]);
  }

  return out.slice(0, 3);
}

export interface SummaryData {
  generated_at: string;
  data_hash: string;
  total_parties: number;
  total_promises: number;
  total_msek_flasket: number;
  total_msek_besparingar: number;
  total_financing_claimed_msek: number;
  financing_gap_msek: number;
  reformutrymme_msek_per_ar: number | "VERIFIERA";
  reformutrymme_total_msek: number | null;
  parties: Array<{
    code: string;
    name: string;
    total_msek: number;
    mandates: number;
    votes: number;
    per_vote: number;
    promises_count: number;
    financing_gap_msek: number;
  }>;
}

export function buildSummary(
  promises: PromisePost[],
  parties: Party[],
  constants: Constants,
  changelog: Array<{ data_hash: string }>
): SummaryData {
  const hash =
    changelog.length > 0
      ? changelog[changelog.length - 1].data_hash
      : "0000000000000000000000000000000000000000000000000000000000000000";

  const reformutrymme = constants.reformutrymme_msek_per_ar.value;
  const refTotal =
    reformutrymme !== "VERIFIERA" ? (reformutrymme as number) * 4 : null;

  return {
    generated_at: new Date().toISOString(),
    data_hash: hash,
    total_parties: parties.length,
    total_promises: countPromises(promises),
    total_msek_flasket: totalFlasket(promises),
    total_msek_besparingar: totalBesparingar(promises),
    total_financing_claimed_msek: totalFinancingClaimed(promises),
    financing_gap_msek: financingGap(promises),
    reformutrymme_msek_per_ar: reformutrymme,
    reformutrymme_total_msek: refTotal,
    parties: parties.map((p) => {
      const pp = getPromisesForParty(promises, p.code);
      const t = partyTotalMsek(promises, p.code);
      const pf = pp.filter(isCostType).reduce((s, x) => s + promiseTotalMsek(x), 0);
      const pb = pp.filter(isBesparing).reduce((s, x) => s + promiseTotalMsek(x), 0);
      const pfc = pp.reduce((s, x) => s + (x.financing_claimed.msek ?? 0), 0);
      return {
        code: p.code,
        name: p.name,
        total_msek: t,
        mandates: p.mandate_2022,
        votes: p.votes_2022,
        per_vote: flasketPerRost(t, p.votes_2022),
        promises_count: pp.length,
        financing_gap_msek: pf - pb - pfc,
      };
    }),
  };
}

/**
 * Neutralt djur per ämnesområde för vikt-liknelsen. Djuret varierar ENBART för
 * omväxling (så inte allt blir blåvalar) och beror på kategorin — aldrig på
 * partiet, så samma belopp ger identisk rad oavsett parti (§17). Ett djur är
 * apolitiskt: till skillnad från sjuksköterskelöner/vårdplatser/skolluncher kan
 * det aldrig självt vara ett vallöfte. Vikter är ungefärliga snittvikter för en
 * vuxen individ (encyklopediska, i kg).
 */
interface Djur {
  singular: string;
  plural: string;
  kg: number;
}
// Golv ~1 ton så inga absurda miljontal (en 300-kg brunbjörn gav "1 066 667").
const DJUR_PER_KATEGORI: Record<string, Djur> = {
  "välfärd": { singular: "blåval", plural: "blåvalar", kg: 150_000 },
  "klimat-miljö": { singular: "kaskelot", plural: "kaskeloter", kg: 40_000 },
  "skatter": { singular: "knölval", plural: "knölvalar", kg: 30_000 },
  "försvar": { singular: "afrikansk elefant", plural: "afrikanska elefanter", kg: 6_000 },
  "utbildning": { singular: "späckhuggare", plural: "späckhuggare", kg: 5_000 },
  "rättsväsende": { singular: "noshörning", plural: "noshörningar", kg: 2_300 },
  "infrastruktur": { singular: "flodhäst", plural: "flodhästar", kg: 1_500 },
  "migration": { singular: "giraff", plural: "giraffer", kg: 1_200 },
  "övrigt": { singular: "valross", plural: "valrossar", kg: 1_000 },
};
const DJUR_DEFAULT = DJUR_PER_KATEGORI["övrigt"];

function formatDjurCount(n: number): string {
  return n < 10
    ? n.toFixed(1).replace(".", ",")
    : Math.round(n).toLocaleString("sv-SE");
}

/**
 * Den "torra raden": en deadpan, deterministisk och NEUTRAL glasyr som fyller
 * quip-slotten när ingen granskad LLM-quip finns. Konceit: "om varje krona
 * vägde ett gram" → löftets vikt uttryckt i ett apolitiskt djur. Skämtar aldrig
 * om sakfrågan, personen eller partiet — bara om storleken, via en fysisk
 * liknelse som inte kan vara del av något löfte. Identisk rad för samma belopp
 * oavsett parti; djuret varierar bara med ämnesområdet för omväxlings skull.
 */
export function dryLine(promise: PromisePost): string {
  const fin = promise.financing_claimed.described ? "angiven" : "ej angiven";
  const gram = promiseTotalMsek(promise) * 1_000_000; // msek → kr, 1 kr = 1 g
  // Symboliska/regulatoriska löften utan mätbar kassaeffekt (< 1 ton):
  if (gram < 1_000_000) return `Ingen mätbar kostnad i kassan. Finansiering: ${fin}.`;
  const djur = DJUR_PER_KATEGORI[promise.category] ?? DJUR_DEFAULT;
  const antal = gram / (djur.kg * 1000);
  const namn = Math.abs(antal - 1) < 1e-9 ? djur.singular : djur.plural;
  return `Om varje krona vägde ett gram skulle löftet väga ungefär ${formatDjurCount(antal)} ${namn}. Finansiering: ${fin}.`;
}

export function formatComparison(r: ComparisonResult): string {
  if (r.unverifiable) return "Värde ej verifierat";
  const val = r.computed;
  if (r.unit === "ggr_gripen") {
    // Andel/multipel av hela Gripen-programmet (2013–2026).
    if (val >= 1) return `${val.toFixed(1).replace(".", ",")} gånger ${r.label}`;
    if (val >= 0.01) return `${(val * 100).toFixed(0)} % av ${r.label}`;
    return `${(val * 100).toFixed(1).replace(".", ",")} % av ${r.label}`;
  }
  if (r.unit === "andel_avstand") {
    // Myntstapeln (enkronor) jämförd med ett avstånd.
    if (val >= 1) return `${val.toFixed(1).replace(".", ",")} gånger till ${r.label}`;
    if (val >= 0.01) return `${(val * 100).toFixed(1).replace(".", ",")} % av vägen till ${r.label}`;
    return `${(val * 100).toFixed(2).replace(".", ",")} % av vägen till ${r.label}`;
  }
  if (r.unit === "kr") {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1).replace(".", ",")} miljoner ${r.label.toLowerCase()}`;
    if (val >= 1000) return `${Math.round(val).toLocaleString("sv-SE")} ${r.label.toLowerCase()}`;
    return `${val.toFixed(1).replace(".", ",")} ${r.label.toLowerCase()}`;
  }
  if (r.unit === "m") {
    if (val > 1_000_000_000) return `${(val / 1_000_000_000).toFixed(0)} Gm (${r.label.toLowerCase()})`;
    if (val > 1_000_000) return `${(val / 1_000_000).toFixed(0)} miljoner km (${r.label.toLowerCase()})`;
    if (val > 1000) return `${(val / 1000).toFixed(0)} km (${r.label.toLowerCase()})`;
    return `${val.toFixed(1).replace(".", ",")} m (${r.label.toLowerCase()})`;
  }
  return `${val.toFixed(1).replace(".", ",")} ${r.unit}`;
}
