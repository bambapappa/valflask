/**
 * Kartan över vad motionerna bakom kopplingarna faktiskt yrkar.
 *
 * Två frågor per koppling, och båda går att svara på mekaniskt:
 *
 * 1. **Står det publicerade citatet i handlingens egen del?** En motions
 *    handling är dess yrkande. Ett citat ur brödtexten står ordagrant i
 *    dokumentet och passerar citatgrinden — men det visar argumentationen för
 *    handlingen, inte handlingen. 186 av 796 citat är av det slaget.
 * 2. **Vad är motionens yrkanden för slag?** Det avgör vilken behandling
 *    b-0039 föreskriver: en tabellkontroll, en indragning eller en läsning.
 *
 * Kartan skrevs en gång för hand och fanns sedan bara i en rapport. Då måste
 * nästa pass räkna om den ur en textutskrift, och den räkningen blev fel med
 * åtta poster. Därför ligger den här, som ett skript som går att köra om:
 *
 *   npm run motionsklass                 # utskrift, summering per slag
 *   npm run motionsklass -- --skriv      # uppdaterar data/motionsklass.json
 *   npm run motionsklass -- --slag bara_anslag --idn
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
import { fetchYrkanden, fetchDokumentText } from "../src/riksdagen.ts";
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
const slagFilter = argv[argv.indexOf("--slag") + 1];
const bara = argv.includes("--slag") ? slagFilter : undefined;

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
   * Står citatet i något av motionens yrkanden — alltså i handlingen själv?
   *
   * Sätts bara för motioner. En interpellation eller en skriftlig fråga har
   * inga yrkanden, och ett `false` där skulle läsas som att citatet inte bär
   * handlingen fast frågans lydelse är just det citatet ofta är.
   */
  i_yrkande?: boolean;
  /** Motionens slag, eller undefined för handlingar som inte är motioner. */
  motionsslag?: Motionsslag;
  /** Binder ett inkomstberäkningsyrkande regeringen att lagstifta? */
  bindande_inkomstberakning?: boolean;
  /** Antal yrkanden i riksdagens lista. */
  yrkanden?: number;
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
  };

  if (h.kind === "motion") {
    const yrkanden = (await cachat(`yrkanden-${dokId}`, () => fetchYrkanden(politeFetch, dokId))) ?? [];
    const lydelser = yrkanden.map((y) => y.lydelse);
    post.yrkanden = lydelser.length;
    post.motionsslag = motionensSlag(lydelser);
    post.bindande_inkomstberakning = bindandeInkomstberakning(lydelser);
    post.i_yrkande =
      citat !== "" && lydelser.some((l) => normalizeForVerbatim(l).includes(citat));
  }
  kartan.push(post);
}

// ─────────────────────────────────────────────────────────────── utskrift ──

const motioner = kartan.filter((p) => p.kind === "motion");
const brodtext = motioner.filter((p) => p.i_yrkande !== true);

console.log(`\n${kartan.length} aktiva kopplingar lästa mot sina källdokument.`);
const inteOrdagrant = kartan.filter((p) => !p.ordagrant);
console.log(
  inteOrdagrant.length === 0
    ? "Varje citat står ordagrant i sitt källdokument. Citatgrindarna håller."
    : `⚠ ${inteOrdagrant.length} citat står INTE ordagrant i sitt källdokument: ${inteOrdagrant
        .map((p) => p.koppling)
        .join(" ")}`,
);
console.log(
  `\n${motioner.length} av dem vilar på en motion. ${brodtext.length} av de motionerna citerar` +
    " brödtexten i stället för yrkandet.\n",
);

const perSlag = new Map<Motionsslag, Kartpost[]>();
for (const p of brodtext) {
  const s = p.motionsslag ?? "inga_yrkanden";
  perSlag.set(s, [...(perSlag.get(s) ?? []), p]);
}
for (const [slag, poster] of [...perSlag].sort((a, b) => b[1].length - a[1].length)) {
  if (bara !== undefined && bara !== slag) continue;
  console.log(`${String(poster.length).padStart(4)}  ${slag} — ${SLAGETS_INNEBORD[slag]}`);
  const bindande = poster.filter((p) => p.bindande_inkomstberakning === true);
  if (slag === "bara_ramverk") {
    console.log(`      varav ${bindande.length} har ett inkomstberäkningsyrkande som binder regeringen`);
  }
  if (visaIdn) {
    for (const p of poster) console.log(`        ${p.koppling}  ${p.promise_id ?? "—"}  ${p.dok_id}`);
  }
}

const annat = kartan.filter((p) => p.kind !== "motion");
console.log(
  `\n${annat.length} kopplingar vilar på något annat än en motion (${[
    ...new Set(annat.map((p) => p.kind)),
  ].join(", ")}) — de prövas mot frågans eller beslutspunktens lydelse, inte mot yrkanden.`,
);

if (skriv) {
  const fil = resolve(rot, "data/motionsklass.json");
  writeFileSync(fil, JSON.stringify(kartan, null, 2) + "\n");
  console.log(`\nSkrivet: data/motionsklass.json (${kartan.length} poster)`);
} else {
  console.log("\nIngenting skrivet. Kör med --skriv för att uppdatera data/motionsklass.json.");
}
