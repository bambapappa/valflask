/**
 * Kartan över vad handlingarna bakom kopplingarna faktiskt gör.
 *
 * Två frågor per koppling, och båda går att svara på mekaniskt:
 *
 * 1. **Står det publicerade citatet i handlingens egen del?** En motions
 *    handling är dess yrkande, en frågas handling är frågan själv, och en
 *    voterings handling är beslutspunktens text. Ett citat ur brödtexten,
 *    frågans bakgrund eller betänkandets ärendebeskrivning står ordagrant i
 *    dokumentet och passerar citatgrinden — men det visar argumentationen för
 *    handlingen, inte handlingen.
 * 2. **Vad är motionens yrkanden för slag?** Det avgör vilken behandling
 *    b-0039 föreskriver: en tabellkontroll, en indragning eller en läsning.
 *
 * Kartan skrevs en gång för hand och fanns sedan bara i en rapport. Då måste
 * nästa pass räkna om den ur en textutskrift, och den räkningen blev fel med
 * åtta poster. Därför ligger den här, som ett skript som går att köra om:
 *
 *   npm run handlingsklass                 # utskrift, summering per slag
 *   npm run handlingsklass -- --skriv      # uppdaterar data/handlingsklass.json
 *   npm run handlingsklass -- --slag bara_anslag --idn
 *
 * **Verktyget avgör inget.** Att ett citat står i brödtexten betyder att
 * kopplingen ska vägas om, inte att den ska bort — handlingen finns, den är
 * bara inte citerad.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Handling } from "../src/handlingar.ts";
import type { KopplingPost } from "../src/granskning.ts";
import { normalizeForVerbatim } from "../src/citatgrind.ts";
import { fetchYrkanden, fetchDokumentText, fetchUtskottspunkter } from "../src/riksdagen.ts";
import { fragansLydelser } from "../src/fragans-lydelse.ts";
import { punktensEgnaOrd, punktenAntarNagot } from "../src/beslutspunkten.ts";
import {
  motionensSlag,
  bindandeInkomstberakning,
  SLAGETS_INNEBORD,
  type Motionsslag,
} from "../src/yrkandeslag.ts";
import { cachat, politeFetch } from "./kallcache.mts";

const rot = resolve(import.meta.dirname, "../..");
const kopplingar: KopplingPost[] = JSON.parse(readFileSync(resolve(rot, "data/kopplingar.json"), "utf8"));
const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));
const handlingPerId = new Map(handlingar.map((h) => [h.id, h]));

const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
const visaIdn = argv.includes("--idn");
const bara = argv.includes("--slag") ? argv[argv.indexOf("--slag") + 1] : undefined;

/** En kopplings plats i kartan. */
interface Kartpost {
  koppling: string;
  promise_id?: string;
  handling: string;
  dok_id: string;
  /** Handlingsslaget: motion, votering, interpellation, skriftlig_fraga. */
  kind: string;
  /** Står citatet ordagrant någonstans i källdokumentet? */
  ordagrant: boolean;
  /**
   * Står citatet i handlingens egen del — motionens yrkande, frågans lydelse,
   * beslutspunktens text? `null` betyder att handlingens egna lydelser inte gick
   * att hämta, och då är frågan obesvarad snarare än besvarad med nej.
   */
  i_handlingen: boolean | null;
  /** Vad handlingens egna lydelser är: yrkanden, frågans lydelse, beslutspunkt. */
  lydelsernas_sort: "yrkanden" | "frågans lydelse" | "beslutspunkt" | null;
  /** Antal egna lydelser handlingen har hos riksdagen. */
  lydelser: number;
  /** Motionens slag, bara för motioner. */
  motionsslag?: Motionsslag;
  /** Binder ett inkomstberäkningsyrkande regeringen att lagstifta? */
  bindande_inkomstberakning?: boolean;
  /**
   * Antar voteringspunkten något, eller avslår den bara motioner? Avgör om
   * utskottets sammanfattning får räknas som handlingens egna ord.
   */
  punkten_antar?: boolean;
}

const kartan: Kartpost[] = [];
const aktiva = kopplingar.filter((k) => k.status === "aktiv");

let n = 0;
for (const k of aktiva) {
  const h = handlingPerId.get(k.handling_id);
  const dokId = k.bevis.kalla_dok_id ?? h?.dok_id ?? "";
  if (++n % 100 === 0) console.error(`  ${n}/${aktiva.length}`);
  if (h === undefined || dokId === "") {
    console.error(`  ${k.id}: handlingen saknar dokument-id — hoppas över`);
    continue;
  }

  const text = await cachat(`text-${dokId}`, () => fetchDokumentText(politeFetch, dokId));
  if (text === null) {
    console.error(`  ${k.id}: ${dokId} gick inte att hämta — ingenting prövat`);
    continue;
  }
  const citat = normalizeForVerbatim(k.bevis.citat);
  const ordagrant = citat !== "" && normalizeForVerbatim(text).includes(citat);

  const post: Kartpost = {
    koppling: k.id,
    ...(k.promise_id === undefined ? {} : { promise_id: k.promise_id }),
    handling: k.handling_id,
    dok_id: dokId,
    kind: h.kind,
    ordagrant,
    i_handlingen: null,
    lydelsernas_sort: null,
    lydelser: 0,
  };

  /** Citatet mot handlingens egna lydelser, i citatgrindens egen kanon. */
  const iNagon = (lydelser: string[]): boolean =>
    citat !== "" && lydelser.some((l) => normalizeForVerbatim(l).includes(citat));

  if (h.kind === "motion") {
    const yrkanden = (await cachat(`yrkanden-${dokId}`, () => fetchYrkanden(politeFetch, dokId))) ?? [];
    const lydelser = yrkanden.map((y) => y.lydelse);
    post.lydelsernas_sort = "yrkanden";
    post.lydelser = lydelser.length;
    post.motionsslag = motionensSlag(lydelser);
    post.bindande_inkomstberakning = bindandeInkomstberakning(lydelser);
    if (lydelser.length > 0) post.i_handlingen = iNagon(lydelser);
  } else if (h.kind === "interpellation" || h.kind === "skriftlig_fraga") {
    const lydelser = fragansLydelser(text).map((f) => f.lydelse);
    post.lydelsernas_sort = "frågans lydelse";
    post.lydelser = lydelser.length;
    if (lydelser.length > 0) post.i_handlingen = iNagon(lydelser);
  } else if (h.kind === "votering") {
    // Voteringens handling är den punkt kammaren röstade om — inte betänkandets
    // ärendebeskrivning, och inte någon annan punkt i samma betänkande.
    // Egen cachenyckel: `utskottsforslag-…` är upptaget av den råa nyttolasten
    // från riksdagen, och en cache som blandar två former ger ett typfel först
    // vid andra körningen — alltså på en annan maskin än den som skrev den.
    const punkter =
      (await cachat(`punkter-${dokId}`, () => fetchUtskottspunkter(politeFetch, dokId))) ?? [];
    const punkt = (h as unknown as { punkt?: number }).punkt;
    const traff = punkter.filter((p) => p.punkt === punkt);
    post.lydelsernas_sort = "beslutspunkt";
    post.lydelser = traff.length;
    if (traff.length > 0) {
      // Sammanfattningen räknas med när punkten antar något — punktens egen
      // beslutstext säger vilka lagar som ändrades, inte åt vilket håll.
      const lydelser = traff.flatMap((p) => punktensEgnaOrd(p, text));
      post.i_handlingen = iNagon(lydelser);
      post.punkten_antar = traff.some((p) => punktenAntarNagot(p.forslag));
    }
  }
  kartan.push(post);
}

// ─────────────────────────────────────────────────────────────── utskrift ──

console.log(`\n${kartan.length} aktiva kopplingar lästa mot sina källdokument.`);
const inteOrdagrant = kartan.filter((p) => !p.ordagrant);
console.log(
  inteOrdagrant.length === 0
    ? "Varje citat står ordagrant i sitt källdokument. Citatgrindarna håller."
    : `⚠ ${inteOrdagrant.length} citat står INTE ordagrant i sitt källdokument: ${inteOrdagrant
        .map((p) => p.koppling)
        .join(" ")}`,
);

console.log("\nCitatet mot handlingens egen del, per handlingsslag:");
for (const kind of [...new Set(kartan.map((p) => p.kind))]) {
  const grupp = kartan.filter((p) => p.kind === kind);
  const i = grupp.filter((p) => p.i_handlingen === true).length;
  const ute = grupp.filter((p) => p.i_handlingen === false).length;
  const okant = grupp.filter((p) => p.i_handlingen === null).length;
  console.log(
    `  ${kind.padEnd(17)} ${String(grupp.length).padStart(4)} kopplingar · ${i} i handlingen · ` +
      `${ute} bara i den omgivande texten · ${okant} gick inte att avgöra`,
  );
}

const brodtext = kartan.filter((p) => p.kind === "motion" && p.i_handlingen !== true);
console.log(`\nMotionerna vars citat inte står i yrkandet — ${brodtext.length} stycken:\n`);
const perSlag = new Map<Motionsslag, Kartpost[]>();
for (const p of brodtext) {
  const s = p.motionsslag ?? "inga_yrkanden";
  perSlag.set(s, [...(perSlag.get(s) ?? []), p]);
}
for (const [slag, poster] of [...perSlag].sort((a, b) => b[1].length - a[1].length)) {
  if (bara !== undefined && bara !== slag) continue;
  console.log(`${String(poster.length).padStart(4)}  ${slag} — ${SLAGETS_INNEBORD[slag]}`);
  if (slag === "bara_ramverk") {
    const b = poster.filter((p) => p.bindande_inkomstberakning === true).length;
    console.log(`      varav ${b} har ett inkomstberäkningsyrkande som binder regeringen`);
  }
  if (visaIdn) {
    for (const p of poster) console.log(`        ${p.koppling}  ${p.promise_id ?? "—"}  ${p.dok_id}`);
  }
}

if (skriv) {
  const fil = resolve(rot, "data/handlingsklass.json");
  writeFileSync(fil, JSON.stringify(kartan, null, 2) + "\n");
  console.log(`\nSkrivet: data/handlingsklass.json (${kartan.length} poster)`);
} else {
  console.log("\nIngenting skrivet. Kör med --skriv för att uppdatera data/handlingsklass.json.");
}
