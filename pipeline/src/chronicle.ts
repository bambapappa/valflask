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

export function totalFlasket(promises: PipelinePromise[]): number {
  return promises.filter(isCostType).reduce((s, p) => s + promiseTotal(p), 0);
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
 * Genererar veckans krönika om det finns nya löften denna ISO-vecka OCH ingen
 * krönika ännu finns för veckan (eller force). Returnerar uppdaterad lista, eller
 * den oförändrade om inget genererades. Kräver LLM C; transienta fel sväljs.
 */
export async function maybeGenerateWeekly(opts: {
  now: Date;
  allPromises: PipelinePromise[];
  changelog: ChangelogEntry[];
  existing: ChronicleEntry[];
  llm: LlmClient;
  copyModel: string;
  runId: string;
  force?: boolean;
}): Promise<{ chronicles: ChronicleEntry[]; generated: ChronicleEntry | null }> {
  const { now, allPromises, changelog, existing, llm, copyModel, runId, force } = opts;
  const { year, week } = isoWeek(now);
  const slug = weekSlug(year, week);

  if (!force && existing.some((c) => c.slug === slug)) {
    return { chronicles: existing, generated: null };
  }

  const weekIds = new Set(promiseIdsAddedInWeek(changelog, year, week));
  const weekPromises = allPromises.filter((p) => weekIds.has(p.id));
  if (weekPromises.length === 0) return { chronicles: existing, generated: null };

  const total = totalFlasket(allPromises);
  const gap = total; // besparingar/finansiering ~0 i praktiken; R4 ≈ Fläsket
  const gapText = `${(gap / 1000).toFixed(0)} mdkr (Fläsket ${(total / 1000).toFixed(0)} mdkr)`;

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
