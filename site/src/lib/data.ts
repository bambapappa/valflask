import { readFileSync } from "node:fs";
import type { Kallandring, Kallstatus } from "./source-link.ts";
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
    kind?: "webb" | "tal";
    /** Satt av `pnpm promises:rot-check`. Saknas på källor som aldrig öppnats igen. */
    source_status?: Kallstatus;
    source_checked_at?: string;
    /** Vad som ändrats — se `andrade-kallor.ts`. Bara på källor som inte är `ok`. */
    source_change?: Kallandring;
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
    calculation?: string;
    confidence: number;
  };
  financing_claimed: {
    described: boolean;
    summary: string | null;
    msek: number | null;
    /** Avser beloppet ett år eller hela perioden? Krävs när msek är satt. */
    period?: "per_ar" | "engang";
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
  /** Faktarad om valmanifestet 2026 — samma rad för alla partier (§17). */
  manifest_2026: string;
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
  /** Synlig rättelsenot — tyst rättelse är förbjuden. */
  correction_note?: string;
  /** Arkiverad: finns kvar i datat och i git, men renderas inte på sajten. */
  archived?: boolean;
}

export interface Rattelse {
  date: string;
  affects: string;
  what: string;
  why: string;
}

/** Rättelselogg. Saknas filen (inga rättelser ännu) → tom lista. */
export function getRattelser(): Rattelse[] {
  try {
    return loadData<Rattelse[]>("rattelser.json");
  } catch {
    return [];
  }
}

/**
 * Veckokrönikor som VISAS. Saknas filen (innan första körningen) → tom lista.
 *
 * Arkiverade krönikor filtreras bort. Krönikor är ögonblicksbilder och skrivs
 * aldrig om — men de fyra första vilade på summor som senare visade sig vara
 * tre till fem gånger för höga, och att låta dem ligga kvar synliga hade varit
 * att publicera siffror vi vet är fel. De finns kvar i sin helhet i
 * data/chronicles.json och därmed i git; de renderas bara inte.
 * (Mänskligt beslut 2026-07-28, se data/rattelser.json.)
 */
export function getChronicles(): Chronicle[] {
  try {
    return loadData<Chronicle[]>("chronicles.json").filter((c) => c.archived !== true);
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
