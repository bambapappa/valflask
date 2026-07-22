/**
 * Läser Handlingsvågens incheckade data vid byggtid. Sajten SKIVAR datat
 * (api/hv/*) och skeppar aldrig råfilerna — handlingar.json är 17 MB.
 * Modulnivå-cache så varje fil läses en gång per bygge.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function dataDir(): string {
  return resolve(process.cwd(), "../data");
}

function las<T>(fil: string): T {
  return JSON.parse(readFileSync(resolve(dataDir(), fil), "utf8")) as T;
}

export type DomStatus = "agerat_i_linje" | "agerat_emot" | "bade_och" | "ingen_handling_annu";

export interface PartiDom {
  target_id: string;
  party: string;
  status: DomStatus;
  i_linje: string[];
  emot: string[];
  avstod: string[];
}

export interface LedamotMerit {
  target_id: string;
  intressent_id: string;
  namn: string;
  party: string;
  i_linje: string[];
  emot: string[];
  avstod: string[];
  franvarande: string[];
}

export interface Domar {
  genererad: string;
  partidomar: PartiDom[];
  ledamotsmeriter: LedamotMerit[];
}

export interface LofteIndex {
  id: string;
  titel: string;
  kategori: string;
  parties: string[];
  citat: string;
  datum: string;
  kalla_url: string;
  arkiv_url: string | null;
}

export interface Party {
  code: string;
  namn: string;
  block: string;
}

export interface Koppling {
  id: string;
  promise_id?: string;
  stance_id?: string;
  handling_id: string;
  riktning: "stodjer" | "motverkar";
  motionstyp?: "parti" | "kommitte" | "enskild";
  bevis: { citat: string };
  method_note?: string;
  confidence?: number;
  extraction?: { model?: string; verified_by?: string | null; run_id?: string };
  status: "aktiv" | "indragen";
}

export interface Handling {
  id: string;
  kind: "votering" | "motion" | "proposition" | "interpellation" | "skriftlig_fraga";
  dok_id: string;
  votering_id?: string | null;
  datum: string;
  organ?: string;
  motionstyp?: "parti" | "kommitte" | "enskild";
  parties: string[];
  persons: Array<{ name: string; party: string; riksdagen_id?: string | null }>;
  titel: string;
  url: string;
  archive_url: string | null;
  utfall?: string | null;
}

export interface Person {
  intressent_id: string;
  namn: string;
  parti: string;
  valkrets: string;
}

let _domar: Domar | undefined;
let _loften: LofteIndex[] | undefined;
let _parties: Party[] | undefined;
let _kopplingar: Koppling[] | undefined;
let _handlingar: Map<string, Handling> | undefined;
let _personer: Person[] | undefined;

export function getDomar(): Domar {
  return (_domar ??= las<Domar>("domar.json"));
}
export function getLoften(): LofteIndex[] {
  return (_loften ??= las<LofteIndex[]>("loften-index.json"));
}
export function getParties(): Party[] {
  return (_parties ??= las<Party[]>("parties.json"));
}
export function getKopplingar(): Koppling[] {
  return (_kopplingar ??= las<Koppling[]>("kopplingar.json"));
}
export function getHandlingMap(): Map<string, Handling> {
  if (!_handlingar) {
    const arr = las<Handling[]>("handlingar.json");
    _handlingar = new Map(arr.map((h) => [h.id, h]));
  }
  return _handlingar;
}
export function getPersoner(): Person[] {
  return (_personer ??= las<Person[]>("personer.json"));
}

/** Måltid för en koppling — löfte eller ståndpunkt (b-0018 F4). */
export function malId(k: Koppling): string {
  return k.promise_id ?? k.stance_id ?? "";
}
