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
  /** Vad punkten avslog, när beviset bara är en lista på avslagna motioner. */
  avslaget?: Array<{ motion: string; parti: string; yrkande?: string; dok_id: string; lydelse: string }>;
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
  /** voteringens punkt i betänkandet */
  punkt?: number | null;
  datum: string;
  organ?: string;
  motionstyp?: "parti" | "kommitte" | "enskild";
  parties: string[];
  persons: Array<{ name: string; party: string; riksdagen_id?: string | null }>;
  titel: string;
  url: string;
  archive_url: string | null;
  utfall?: string | null;
  /** parti → antal ja, nej, avstående och frånvarande i voteringen */
  rostfordelning?: Record<
    string,
    { ja: number; nej: number; avstar: number; franvarande: number }
  > | null;
}

export interface Person {
  intressent_id: string;
  namn: string;
  parti: string;
  valkrets: string;
}

export interface ArkivPost {
  handling_id: string;
  koppling_id: string;
  kalla_url: string;
  arkiv_url: string | null;
  verifierad: boolean;
  skal?: string;
  datum: string;
}

let _domar: Domar | undefined;
let _loften: LofteIndex[] | undefined;
let _parties: Party[] | undefined;
let _kopplingar: Koppling[] | undefined;
let _handlingar: Map<string, Handling> | undefined;
let _personer: Person[] | undefined;
let _sokta: Set<string> | undefined;

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

/**
 * Löftes-id:n som sökningen faktiskt har letat efter handlingar till.
 *
 * Behövs för att skilja de två helt olika saker som annars gömmer sig i
 * samma tal på partisidan: ett löfte vi sökt igenom utan att hitta något,
 * och ett löfte vi ännu inte sökt på. Skillnaden följer parti — för
 * Socialdemokraterna är nästan varje tomt löfte genomsökt, för Liberalerna
 * bara ungefär hälften — och utan uppdelningen läser samma ord på sidan
 * som två olika påståenden beroende på vilket parti man tittar på.
 */
export function getSoktaLoften(): Set<string> {
  if (!_sokta) {
    const rader = las<string[]>("provade-par.json");
    _sokta = new Set(rader.map((r) => r.slice(0, r.indexOf("::"))));
  }
  return _sokta;
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

/** Ett utskottsbetänkande — den text kammaren röstar om. */
export interface Betankande {
  dok_id: string;
  rm: string;
  beteckning: string;
  datum: string;
  titel: string;
  organ: string;
}

let _betankanden: Betankande[] | undefined;
export function getBetankanden(): Betankande[] {
  if (!_betankanden) {
    try {
      _betankanden = las<Betankande[]>("betankanden.json");
    } catch {
      _betankanden = []; // inte skördade än — tomt är ärligt
    }
  }
  return _betankanden;
}

export interface Rattelse {
  date: string;
  affects: string;
  what: string;
  why: string;
  commit?: string;
}

let _rattelser: Rattelse[] | undefined;
export function getRattelser(): Rattelse[] {
  if (!_rattelser) {
    try {
      _rattelser = las<Rattelse[]>("rattelser.json");
    } catch {
      _rattelser = [];
    }
  }
  return _rattelser;
}
/** Rättelser som rör en viss sida (dess sökväg nämns i affects). */
export function rattelserForPath(path: string): Rattelse[] {
  return getRattelser().filter((r) => r.affects.includes(path));
}
/** Rättelser som rör ett visst löfte (dess id nämns i affects). */
export function rattelserForLofte(id: string): Rattelse[] {
  return getRattelser().filter((r) => r.affects.includes(id));
}

let _arkiv: Map<string, string> | undefined;
/** handling_id → verifierad arkiv-URL (bara kopior som bär citatet ord för ord). */
export function getArkivMap(): Map<string, string> {
  if (!_arkiv) {
    let poster: ArkivPost[] = [];
    try {
      poster = las<ArkivPost[]>("arkiv.json");
    } catch {
      poster = [];
    }
    _arkiv = new Map(poster.filter((a) => a.verifierad && a.arkiv_url).map((a) => [a.handling_id, a.arkiv_url as string]));
  }
  return _arkiv;
}

/** Måltid för en koppling — löfte eller ståndpunkt (b-0018 F4). */
export function malId(k: Koppling): string {
  return k.promise_id ?? k.stance_id ?? "";
}
