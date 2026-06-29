import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function getDataDir(): string {
  return resolve(process.cwd(), "../data");
}

export function loadData<T>(filename: string): T {
  return JSON.parse(readFileSync(resolve(getDataDir(), filename), "utf8"));
}

export interface PromisePost {
  id: string;
  group_id: string | null;
  title: string;
  slug: string;
  parties: string[];
  person: {
    name: string;
    role: string;
    riksdagen_id?: string | null;
  } | null;
  quote: string;
  date_stated: string;
  source: {
    url: string;
    domain: string;
    archive_url: string | null;
    fetched_at: string;
  };
  category: string;
  cost: {
    type: string;
    period: string;
    msek_low: number;
    msek_base: number;
    msek_high: number;
    basis: string;
    basis_url: string | null;
    method_note: string;
    confidence: number;
  };
  financing_claimed: {
    described: boolean;
    summary: string | null;
    msek: number | null;
  };
  comparisons: string[];
  quip: string | null;
  status: string;
  history: Array<{ date: string; change: string; commit: string }>;
  extraction: {
    model: string;
    verified_by: string | null;
    run_id: string;
  };
}

export interface Party {
  code: string;
  name: string;
  color: string;
  color_text: string;
  mandate_2022: number;
  votes_2022: number;
  block: string;
  source_mandate?: string;
}

export interface Person {
  name: string;
  slug: string;
  party: string;
  role: string;
  riksdagen_id: string | null;
  image_url: string | null;
}

export interface ConstantItem {
  id: string;
  label: string;
  value: number | "VERIFIERA";
  unit: string;
  kind: string;
  source_url: string;
  source_date?: string;
}

export interface Constants {
  generated_note: string;
  reformutrymme_msek_per_ar: {
    value: number | "VERIFIERA";
    source_url: string;
    source_date: string;
  };
  items: ConstantItem[];
}

export interface ChangelogEntry {
  run_id: string;
  added: string[];
  updated: string[];
  retracted: string[];
  data_hash: string;
  timestamp?: string;
}

export function getPromises(): PromisePost[] {
  return loadData<PromisePost[]>("promises.json");
}

export function getParties(): Party[] {
  return loadData<Party[]>("parties.json");
}

export function getPeople(): Person[] {
  return loadData<Person[]>("people.json");
}

export function getConstants(): Constants {
  return loadData<Constants>("constants.json");
}

export function getChangelog(): ChangelogEntry[] {
  return loadData<ChangelogEntry[]>("changelog.json");
}

export interface Chronicle {
  year: number;
  week: number;
  slug: string;
  headline: string;
  body_md: string;
  promise_ids: string[];
  total_msek: number;
  gap_msek: number;
  generated_at: string;
  run_id: string;
}

/** Veckokrönikor. Saknas filen (innan första körningen) → tom lista. */
export function getChronicles(): Chronicle[] {
  try {
    return loadData<Chronicle[]>("chronicles.json");
  } catch {
    return [];
  }
}

export function getPartyByCode(parties: Party[], code: string): Party | undefined {
  return parties.find((p) => p.code === code);
}

export function getPersonBySlug(people: Person[], slug: string): Person | undefined {
  return people.find((p) => p.slug === slug);
}
