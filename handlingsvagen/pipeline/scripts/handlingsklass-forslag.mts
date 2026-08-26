/**
 * handlingsklass.mts, samma mekaniska kontroll, men mot KÖN i stället för
 * de redan godkända kopplingarna — data/kopplingsforslag.json.
 *
 * Kartan behövs innan kön kan prövas alls: kvalitetsfiltrets grind
 * (provningsGrind) kräver en prövning nyckel-ad på "ko:<kopplingId>", och
 * ingen sådan går att skriva förrän journalist- och sakkunnig-rollerna är
 * mätta mot källdokumentet. Se svep-till-provning.py --kopplingar för hur
 * kartan blir en prövning.
 *
 * Engångsbruk för att beta av kön 2026-08-26 — inte ett incheckat verktyg.
 *
 *   node --import tsx/esm scripts/handlingsklass-forslag.mts --ut <fil>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Handling } from "../src/handlingar.ts";
import type { KoPost } from "../src/granskning.ts";
import { kopplingId } from "../src/granskning.ts";
import { normalizeForVerbatim } from "../src/citatgrind.ts";
import { fetchYrkanden, fetchDokumentText, fetchUtskottspunkter } from "../src/riksdagen.ts";
import { fragansLydelser } from "../src/fragans-lydelse.ts";
import { punktensEgnaOrd, punktenAntarNagot } from "../src/beslutspunkten.ts";
import { motionensSlag, bindandeInkomstberakning, type Motionsslag } from "../src/yrkandeslag.ts";
import { cachat, politeFetch } from "./kallcache.mts";

const rot = resolve(import.meta.dirname, "../..");
const ko: KoPost[] = JSON.parse(readFileSync(resolve(rot, "data/kopplingsforslag.json"), "utf8"));
const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));
const handlingPerId = new Map(handlingar.map((h) => [h.id, h]));

const argv = process.argv.slice(2);
const utFil = argv.includes("--ut") ? argv[argv.indexOf("--ut") + 1] : undefined;
if (!utFil) {
  console.error("Ange --ut <fil>");
  process.exit(1);
}

interface Kartpost {
  koppling: string; // "ko:<hash>" — kö-nyckeln, inte ett publicerat id
  promise_id?: string;
  handling: string;
  dok_id: string;
  kind: string;
  ordagrant: boolean;
  i_handlingen: boolean | null;
  lydelsernas_sort: "yrkanden" | "frågans lydelse" | "beslutspunkt" | null;
  lydelser: number;
  motionsslag?: Motionsslag;
  bindande_inkomstberakning?: boolean;
  punkten_antar?: boolean;
  riktning: string;
  citat: string;
  method_note: string;
  confidence: number;
}

const kartan: Kartpost[] = [];
let n = 0;
for (const post of ko) {
  const h = handlingPerId.get(post.handling_id);
  const dokId = post.bevis.kalla_dok_id ?? h?.dok_id ?? "";
  if (++n % 25 === 0) console.error(`  ${n}/${ko.length}`);
  const idNyckel = `ko:${kopplingId(post)}`;
  if (h === undefined || dokId === "") {
    console.error(`  ${idNyckel}: handlingen saknar dokument-id — hoppas över`);
    continue;
  }

  const text = await cachat(`text-${dokId}`, () => fetchDokumentText(politeFetch, dokId));
  if (text === null) {
    console.error(`  ${idNyckel}: ${dokId} gick inte att hämta — ingenting prövat`);
    continue;
  }
  const citat = normalizeForVerbatim(post.bevis.citat);
  const ordagrant = citat !== "" && normalizeForVerbatim(text).includes(citat);

  const kp: Kartpost = {
    koppling: idNyckel,
    ...(post.promise_id === undefined ? {} : { promise_id: post.promise_id }),
    handling: post.handling_id,
    dok_id: dokId,
    kind: h.kind,
    ordagrant,
    i_handlingen: null,
    lydelsernas_sort: null,
    lydelser: 0,
    riktning: post.riktning,
    citat: post.bevis.citat,
    method_note: post.method_note,
    confidence: post.confidence,
  };

  const iNagon = (lydelser: string[]): boolean =>
    citat !== "" && lydelser.some((l) => normalizeForVerbatim(l).includes(citat));

  if (h.kind === "motion") {
    const yrkanden = (await cachat(`yrkanden-${dokId}`, () => fetchYrkanden(politeFetch, dokId))) ?? [];
    const lydelser = yrkanden.map((y) => y.lydelse);
    kp.lydelsernas_sort = "yrkanden";
    kp.lydelser = lydelser.length;
    kp.motionsslag = motionensSlag(lydelser);
    kp.bindande_inkomstberakning = bindandeInkomstberakning(lydelser);
    if (lydelser.length > 0) kp.i_handlingen = iNagon(lydelser);
  } else if (h.kind === "interpellation" || h.kind === "skriftlig_fraga") {
    const lydelser = fragansLydelser(text).map((f) => f.lydelse);
    kp.lydelsernas_sort = "frågans lydelse";
    kp.lydelser = lydelser.length;
    if (lydelser.length > 0) kp.i_handlingen = iNagon(lydelser);
  } else if (h.kind === "votering") {
    const punkter = (await cachat(`punkter-${dokId}`, () => fetchUtskottspunkter(politeFetch, dokId))) ?? [];
    const punkt = (h as unknown as { punkt?: number }).punkt;
    const traff = punkter.filter((p) => p.punkt === punkt);
    kp.lydelsernas_sort = "beslutspunkt";
    kp.lydelser = traff.length;
    if (traff.length > 0) {
      const lydelser = traff.flatMap((p) => punktensEgnaOrd(p, text));
      kp.i_handlingen = iNagon(lydelser);
      kp.punkten_antar = traff.some((p) => punktenAntarNagot(p.forslag));
    }
  }
  kartan.push(kp);
}

console.log(`\n${kartan.length}/${ko.length} förslag lästa mot sina källdokument.`);
const inteOrdagrant = kartan.filter((p) => !p.ordagrant);
console.log(`⚠ ${inteOrdagrant.length} citat står INTE ordagrant i sitt källdokument`);
const inteIHandlingen = kartan.filter((p) => p.i_handlingen === false);
console.log(`⚠ ${inteIHandlingen.length} citat är brödtext, inte handlingens egen del`);
const okant = kartan.filter((p) => p.i_handlingen === null);
console.log(`? ${okant.length} gick inte att avgöra (inga hämtade lydelser)`);

writeFileSync(utFil, JSON.stringify(kartan, null, 2) + "\n");
console.log(`\nSkrivet: ${utFil} (${kartan.length} poster, ${ko.length - kartan.length} överhoppade)`);
