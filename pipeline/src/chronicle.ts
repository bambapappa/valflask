/**
 * chronicle.ts — "Veckans fläsk" (§7 steg 7, bilaga A4). Genererar en
 * veckokrönika ur veckans NYA löften och lagrar den i data/chronicles.json.
 *
 * Ren logik (ISO-vecka, urval, upsert) är deterministisk och testbar; själva
 * textgenereringen sker via LLM C (copy-modellen) genom A4-prompten i copy.ts.
 */

import type { PipelinePromise, ChangelogEntry } from "./publish.ts";
import type { LlmClient } from "./llm.ts";
import { generateWeekly } from "./copy.ts";

export interface ChronicleEntry {
  year: number;
  week: number;
  slug: string; // "2026-27"
  headline: string;
  body_md: string;
  promise_ids: string[];
  total_msek: number; // Fläsket (utgift + intäktsminskning), hela mandatperioden
  gap_msek: number;
  generated_at: string;
  run_id: string;
  /** Synlig rättelsenot (tyst rättelse är förbjuden); sätts manuellt vid rättelse. */
  correction_note?: string;
}

/** ISO-8601 vecka (måndag–söndag, vecka 1 = veckan med årets första torsdag). */
export function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; // sön=7
  t.setUTCDate(t.getUTCDate() + 4 - day); // till torsdagen i veckan
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

export function weekSlug(year: number, week: number): string {
  return `${year}-${String(week).padStart(2, "0")}`;
}

const mult = (p: PipelinePromise): number => (p.cost.period === "per_ar" ? 4 : 1);
const promiseTotal = (p: PipelinePromise): number => p.cost.msek_base * mult(p);
const isCostType = (p: PipelinePromise): boolean =>
  p.cost.type === "utgift" || p.cost.type === "intäktsminskning";
const isActive = (p: PipelinePromise): boolean =>
  (p as { status?: string }).status !== "tillbakadragen";

/**
 * R3 — samma regel som sajtens aggregates.ts: en grupp räknas EN gång, och
 * representeras av den medlem som bär det högsta beloppet för mandatperioden.
 * Krönikan och startsidan får aldrig räkna olika, så den här funktionen måste
 * följa aggregates.dedupeByGroup exakt.
 */
function dedupeByGroup(promises: PipelinePromise[]): PipelinePromise[] {
  const rep = new Map<string, PipelinePromise>();
  for (const p of promises) {
    if (!p.group_id) continue;
    const cur = rep.get(p.group_id);
    if (
      cur === undefined ||
      promiseTotal(p) > promiseTotal(cur) ||
      (promiseTotal(p) === promiseTotal(cur) && p.id < cur.id)
    ) {
      rep.set(p.group_id, p);
    }
  }
  const used = new Set<string>();
  const out: PipelinePromise[] = [];
  for (const p of promises) {
    if (p.group_id) {
      if (used.has(p.group_id)) continue;
      used.add(p.group_id);
      out.push(rep.get(p.group_id)!);
      continue;
    }
    out.push(p);
  }
  return out;
}

/** Löftes-id:n som LADES TILL under en given ISO-vecka (ur changelog-tidsstämplar). */
export function promiseIdsAddedInWeek(
  changelog: ChangelogEntry[],
  year: number,
  week: number,
): string[] {
  const ids = new Set<string>();
  for (const entry of changelog) {
    if (!entry.timestamp) continue;
    const w = isoWeek(new Date(entry.timestamp));
    if (w.year === year && w.week === week) {
      for (const id of entry.added) ids.add(id);
    }
  }
  return [...ids];
}

/** Komprimerat underlag till LLM C: bara fält A4 får referera (id, parti, belopp). */
export function chronicleUnderlag(weekPromises: PipelinePromise[]): string {
  const rows = weekPromises.map((p) => ({
    id: p.id,
    title: p.title,
    parties: p.parties,
    category: p.category,
    msek_base: p.cost.msek_base,
    period: p.cost.period,
    total_msek_mandatperiod: promiseTotal(p),
    basis: p.cost.basis,
  }));
  return JSON.stringify(rows);
}

/**
 * Fläsket totalt — SAMMA definition som sajtens startsida (aggregates.ts):
 * grupp-dedup (R3), endast aktiva löften, endast utgift/intäktsminskning.
 * Krönikan och startsidan får aldrig visa olika totalsummor (extern
 * granskning 2026-07-16: krönikan sade 12 978 mdkr, startsidan 8 184).
 */
export function totalFlasket(promises: PipelinePromise[]): number {
  return dedupeByGroup(promises.filter(isActive)).filter(isCostType).reduce((s, p) => s + promiseTotal(p), 0);
}

/** Lägg till eller ersätt krönikan för dess vecka (idempotent per slug). */
export function upsertChronicle(
  list: ChronicleEntry[],
  entry: ChronicleEntry,
): ChronicleEntry[] {
  const rest = list.filter((c) => c.slug !== entry.slug);
  rest.push(entry);
  rest.sort((a, b) => b.slug.localeCompare(a.slug)); // nyast först
  return rest;
}

/**
 * Genereringen av veckokrönikor är PAUSAD — mänskligt beslut 2026-08-06.
 *
 * En krönika är en ögonblicksbild: rättas den ska beloppen räknas om ur datat
 * som gällde när den skrevs, inte ur dagens. **Ingen kod gör den omräkningen**,
 * och ingen skill äger frågan. Samtidigt flyttade två rättelser samma dag
 * rikssumman med 60 respektive 52 miljarder kronor. Nya krönikor skulle alltså
 * skrivas mot siffror som ändras under fötterna, utan något sätt att rätta dem
 * efteråt — och en krönika som säger fel belopp går inte att tyst justera.
 *
 * Redan publicerade krönikor rörs inte av pausen; de ligger kvar som de står.
 * Att kontrollera om någon av dem bär de gamla talen är en egen uppgift.
 *
 * **Vägen ur pausen är beslutad 2026-08-09:** texten och redogörelsen är
 * statiska, talen dynamiska. Mekanismen finns i `kronikans-tal.ts` — summor,
 * gap, antal och enskilda belopp skrivs som platshållare och slås upp när
 * sidan byggs, så att en rättad siffra följer med i varje krönika utan en
 * rättelsepost per krönika.
 *
 * **Två steg återstår innan flaggan får fällas**, och de måste tas i den här
 * ordningen — annars publiceras en krönika med sina platshållare synliga:
 *
 *   1. Krönikesidan i `site/` ska köra `losUpp()` på `body_md` innan den
 *      renderar, och «Då och nu»-rutan ska läsa de sparade talen som *då*.
 *   2. Prompten som skriver krönikan ska instrueras att skriva `{total}`,
 *      `{gap}`, `{antal}` och `{belopp:<id>}` i stället för siffror.
 *      `skrivnaBelopp()` finns för att granska att den gör det.
 *
 * De sex redan publicerade krönikorna bär sina tal i löptexten och skrivs inte
 * om — deras «Då och nu»-ruta gör redan skillnaden synlig för läsaren.
 */
export const KRONIKOR_PAUSADE = true;

/**
 * Genererar veckans krönika om det finns nya löften denna ISO-vecka OCH ingen
 * krönika ännu finns för veckan (eller force). Returnerar uppdaterad lista, eller
 * den oförändrade om inget genererades. Kräver LLM C; transienta fel sväljs.
 *
 * Är `KRONIKOR_PAUSADE` satt returnerar den alltid oförändrat, även med `force`
 * — pausen ska inte gå att råka runda.
 */
export async function maybeGenerateWeekly(opts: {
  now: Date;
  allPromises: PipelinePromise[];
  changelog: ChangelogEntry[];
  existing: ChronicleEntry[];
  llm: LlmClient;
  copyModel: string;
  runId: string;
  /** Regeringens reformbudget för hela mandatperioden (msek) — ur constants.json. */
  reformBudgetMsek: number;
  force?: boolean;
}): Promise<{ chronicles: ChronicleEntry[]; generated: ChronicleEntry | null }> {
  if (KRONIKOR_PAUSADE) {
    console.log("Veckans fläsk: genereringen är pausad — ingen ny krönika skrivs.");
    return { chronicles: opts.existing, generated: null };
  }
  const { now, allPromises, changelog, existing, llm, copyModel, runId, reformBudgetMsek, force } = opts;
  const { year, week } = isoWeek(now);
  const slug = weekSlug(year, week);

  if (!force && existing.some((c) => c.slug === slug)) {
    return { chronicles: existing, generated: null };
  }

  const weekIds = new Set(promiseIdsAddedInWeek(changelog, year, week));
  const weekPromises = allPromises.filter((p) => weekIds.has(p.id));
  if (weekPromises.length === 0) return { chronicles: existing, generated: null };

  // Gap = Fläsket minus reformbudgeten — SAMMA definition som startsidans
  // hjältegrafik, så att sajten aldrig visar två olika gap-siffror.
  const total = totalFlasket(allPromises);
  const gap = Math.max(0, total - reformBudgetMsek);
  const gapText =
    `Fläsket totalt ${(total / 1000).toFixed(0)} mdkr; regeringens reformbudget ` +
    `${(reformBudgetMsek / 1000).toFixed(0)} mdkr för mandatperioden; finansieringsgap ≈ ${(gap / 1000).toFixed(0)} mdkr`;

  let chron;
  try {
    chron = await generateWeekly(chronicleUnderlag(weekPromises), gapText, llm, copyModel);
  } catch {
    return { chronicles: existing, generated: null };
  }

  const entry: ChronicleEntry = {
    year, week, slug,
    headline: chron.headline.slice(0, 160),
    body_md: chron.body_md,
    promise_ids: weekPromises.map((p) => p.id),
    total_msek: total,
    gap_msek: gap,
    generated_at: now.toISOString(),
    run_id: runId,
  };
  return { chronicles: upsertChronicle(existing, entry), generated: entry };
}
