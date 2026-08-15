/**
 * Grindarna H1–H5 — deterministiska spärrar för kopplingsförslag.
 *
 * En koppling (löfte/ståndpunkt ↔ riksdagshandling) publiceras aldrig om
 * inte samtliga grindar passeras. Språkmodellen får bara FÖRESLÅ; grindarna
 * här är kod, och H6 (mänskligt beslut) fattas alltid av en människa i
 * granskningsflödet — den kan per definition inte passeras programmatiskt.
 *
 * Citatkontrollen (H2) återanvänder mönstret från valflask
 * pipeline/src/gates.ts: identisk normalisering av källtext och citat, så
 * att bara typografiska olikheter neutraliseras — påhittad text kan aldrig
 * slinka igenom. Skiftläge bevaras: ordagrant är ordagrant.
 */

import { aktorsPartier, type Handling } from "./handlingar.ts";
import type { Riktning } from "./domar.ts";

export type GrindId = "H1" | "H2" | "H3" | "H4" | "H5";

export interface GrindFel {
  grind: GrindId;
  reason: string;
}

/** Ett kopplingsförslag — formen innan id/status/extraction sätts. */
export interface KopplingsForslag {
  promise_id?: string;
  stance_id?: string;
  handling_id: string;
  riktning: Riktning;
  /**
   * kalla_dok_id anger vilket dokument citatet står i när det inte är
   * handlingen själv — för voteringar betänkandet (t.ex. "HA01AU10").
   * Utan fältet är källan handlingens eget dokument.
   */
  bevis: { citat: string; sida?: number | null; kalla_dok_id?: string };
  motionstyp?: "parti" | "kommitte" | "enskild";
  method_note: string;
  confidence: number;
}

/** Kontext grindarna prövar mot — allt data, ingen nätverksåtkomst. */
export interface GrindKontext {
  /** Handlingen förslaget pekar på (uppslagen ur handlingar.json), eller undefined om okänd. */
  handling: Handling | undefined;
  /** Källtexten ur riksdagsdokumentet som citatet ska stå ordagrant i. */
  kalltext: string;
  /** Löftets/ståndpunktens partier (gemener, t.ex. ["s","mp"]). */
  malPartier: string[];
  /** Datumfönster för aktuellt läge. */
  fonster: { fran: string; till: string };
  /**
   * Handlingens EGEN text — det som är själva handlingen, skilt från
   * dokumentets brödtext: motionens yrkanden, voteringspunktens beslutstext,
   * eller frågans egen lydelse. Citatet ska stå i någon av dessa (H2).
   *
   * Utelämnad när texten inte gick att hämta. Grinden prövar då inte var i
   * dokumentet citatet står — den kan inte veta det — och anroparen ska
   * skriva ut att kontrollen uteblev.
   */
  handlingstext?: {
    sort: "yrkanden" | "beslutspunkt" | "frågans lydelse";
    delar: string[];
    /**
     * Sant när motionens brödtext är öppnad därför att yrkandena **bara**
     * anvisar medel enligt en tabell (mänskligt beslut 2026-08-09). Flaggan
     * finns för att undantaget ska synas där beviset motiveras — ett undantag
     * som inte behöver skrivas ut blir ett undantag man tar av vana.
     */
    brodtextOppen?: boolean;
  };
}

/**
 * Läge A — meritlistan: mandatperioden före valet 2026,
 * valdag till valdag (2022-09-11 – 2026-09-13). Spec §2/§5 H4.
 */
export const LAGE_A_FONSTER = { fran: "2022-09-11", till: "2026-09-13" };

/** Schemats golv för bevis-citat (kopplingar.schema.json). */
export const CITAT_MIN_TECKEN = 20;

/**
 * Normalisering för ordagrann jämförelse — samma mönster som valflask
 * (identifierarnamnet behålls därifrån). Tillämpas IDENTISKT på källtext
 * och citat: neutraliserar bara typografi (CMS-citattecken, NBSP, mjuka
 * bindestreck, radbryt, osynliga styrtecken), aldrig innehåll.
 */
export function normalizeForVerbatim(input: string): string {
  return (
    input
      .normalize("NFC")
      // Osynliga format-/styrtecken: soft hyphen, zero-width, BOM, word joiner,
      // bidi-styrning (kan användas för att gömma injektionstext).
      .replace(/[­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/gu, "")
      // Citattecken → raka.
      .replace(/[‘’‚‛′]/gu, "'")
      .replace(/[“”„‟″«»]/gu, '"')
      // Streckvarianter → bindestreck-minus.
      .replace(/[‐-―−]/gu, "-")
      // Ellipsis → tre punkter.
      .replace(/…/gu, "...")
      // Allt whitespace (inkl. NBSP, smala mellanrum, radbrytningar) → ett blanksteg.
      .replace(/\s+/gu, " ")
      .trim()
  );
}

/**
 * Är beviset en punkt som BARA avslår motioner?
 *
 * En sådan beslutstext är handlingens egen — den passerar citatgrinden — men
 * den säger bara att några yrkanden föll, inte vad de begärde. Läsaren ser en
 * lista på nummer. Därför krävs fältet `avslaget` bredvid beviset: yrkandenas
 * egna lydelser, hämtade ur motionerna punkten pekar ut.
 *
 * Punkter som antar något och därtill avslår motioner ("Riksdagen antar …
 * samt avslår motionerna …") visar vad som beslutades och omfattas inte.
 */
export function avslagsbeslut(citat: string): boolean {
  return /^Riksdagen avslår motion(?:erna)?\b/iu.test(normalizeForVerbatim(citat));
}

/** H1 — Källan finns: känd handling med id hos riksdagen och öppningsbar länk. */
function grindH1(f: KopplingsForslag, ctx: GrindKontext): GrindFel[] {
  const fel: GrindFel[] = [];
  if (!ctx.handling) {
    fel.push({ grind: "H1", reason: `Handlingen ${f.handling_id} finns inte i handlingar.json` });
    return fel;
  }
  if (!ctx.handling.dok_id) fel.push({ grind: "H1", reason: "Handlingen saknar dokument-id" });
  if (ctx.handling.kind === "votering" && !ctx.handling.votering_id) {
    fel.push({ grind: "H1", reason: "Voteringen saknar voterings-id" });
  }
  if (!/^https:\/\/data\.riksdagen\.se\//u.test(ctx.handling.url)) {
    fel.push({ grind: "H1", reason: `Länken pekar inte på riksdagens öppna data: ${ctx.handling.url}` });
  }
  return fel;
}

/**
 * Varför ett citat utanför handlingens egen del inte duger — en text per sort.
 *
 * Ligger här och inte hos varje anropare därför att bevisbytet ska säga samma
 * sak som grinden. Skiljer sig de två åt får granskaren två olika svar på
 * samma fråga, och det var så frågorna kunde falla mellan stolarna i ett halvt
 * år: yrkandegrinden talade bara om motioner.
 */
export function utanforHandlingen(
  sort: NonNullable<GrindKontext["handlingstext"]>["sort"],
  antalDelar: number,
): string {
  switch (sort) {
    case "yrkanden":
      return `Citatet står inte i något av motionens ${antalDelar} yrkanden — det är brödtext, och brödtexten argumenterar för handlingen i stället för att vara den`;
    case "frågans lydelse":
      return `Citatet står inte i någon av handlingens ${antalDelar} frågelydelser — det är bakgrunden, och bakgrunden argumenterar för frågan i stället för att vara den`;
    case "beslutspunkt":
      return "Citatet står varken i voteringspunktens beslutstext eller i utskottets sammanfattning av det punkten antar — det visar vad ärendet innehöll, inte vad punkten avgjorde";
  }
}

/**
 * H2 — Ordagrant bevis: citatet ska stå tecken för tecken i källtexten, och
 * i den del av dokumentet som ÄR handlingen.
 *
 * Den andra halvan tillkom 2026-08-06. Att citatet stod någonstans i
 * dokumentet räckte förut, och då belades kopplingarna gärna med brödtext:
 * en motions problembeskrivning i stället för dess yrkande, eller en
 * propositionssammanfattning i stället för det voteringspunkten avgjorde. Vid
 * genomgången av kopplingskön behövde vart tredje förslag vägas om av just
 * det skälet, och samtliga fyra voteringar.
 *
 * Frågorna kom med 2026-08-14. De har inga yrkanden, så grinden rörde dem
 * inte — och därmed hindrade ingenting att bakgrunden citerades i stället för
 * frågan. En interpellations handling är vad den **frågar**; texten före
 * upptakten argumenterar för frågan på samma sätt som en motions brödtext
 * argumenterar för yrkandet.
 */
function grindH2(f: KopplingsForslag, ctx: GrindKontext): GrindFel[] {
  const fel: GrindFel[] = [];
  const citat = normalizeForVerbatim(f.bevis.citat);
  if (citat.length < CITAT_MIN_TECKEN) {
    fel.push({ grind: "H2", reason: `Citatet har ${citat.length} tecken — minst ${CITAT_MIN_TECKEN} krävs` });
  }
  if (citat !== "" && !normalizeForVerbatim(ctx.kalltext).includes(citat)) {
    fel.push({
      grind: "H2",
      reason: "Citatet återfinns inte ordagrant i riksdagsdokumentet (normaliserad jämförelse)",
    });
  }
  const ht = ctx.handlingstext;
  if (citat !== "" && ht && ht.delar.length > 0) {
    const iHandlingen = ht.delar.some((del) => normalizeForVerbatim(del).includes(citat));
    if (!iHandlingen) {
      fel.push({ grind: "H2", reason: utanforHandlingen(ht.sort, ht.delar.length) });
    }
  }
  return fel;
}

/** H3 — Rätt aktör: handlingens parti(er) ska stämma med löftets. */
function grindH3(f: KopplingsForslag, ctx: GrindKontext): GrindFel[] {
  if (!ctx.handling) return []; // H1 har redan fällt förslaget
  if (ctx.malPartier.length === 0) {
    return [{ grind: "H3", reason: "Löftet/ståndpunkten saknar parti — ingen aktör att pröva mot" }];
  }
  // Aktörspartierna: en votering omfattar de partier som röstade; en
  // fråga/interpellation bara frågeställarna (den tillfrågade ministern
  // är inte aktör); motioner/propositioner samtliga undertecknare.
  const partier = aktorsPartier(ctx.handling);
  if (partier.length === 0) {
    return [{ grind: "H3", reason: "Handlingen saknar partiuppgift (tom är ärlig — berikning gav ingen träff)" }];
  }
  const traff = ctx.malPartier.some((p) => partier.includes(p));
  return traff
    ? []
    : [{ grind: "H3", reason: `Ingen av löftets partier (${ctx.malPartier.join(", ")}) står bakom handlingen (${partier.join(", ")})` }];
}

/** H4 — Rätt fönster: handlingens datum ska ligga i lägets datumfönster. */
function grindH4(_f: KopplingsForslag, ctx: GrindKontext): GrindFel[] {
  if (!ctx.handling) return [];
  const d = ctx.handling.datum;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(d)) {
    return [{ grind: "H4", reason: `Handlingen saknar giltigt datum: "${d}"` }];
  }
  if (d < ctx.fonster.fran || d > ctx.fonster.till) {
    return [{ grind: "H4", reason: `Datum ${d} ligger utanför fönstret ${ctx.fonster.fran} – ${ctx.fonster.till}` }];
  }
  return [];
}

/**
 * H5 — Riktningen står i texten: det deterministiska skelettet — riktning
 * angiven, metodnot ifylld, rimlig confidence, motionstyp satt för motioner.
 * Själva bedömningen att riktningen FÖLJER av dokumentets text görs av
 * människan i H6; vid tvekan ingen koppling — tomma celler är ärliga.
 */
function grindH5(f: KopplingsForslag, ctx: GrindKontext): GrindFel[] {
  const fel: GrindFel[] = [];
  if (f.riktning !== "stodjer" && f.riktning !== "motverkar") {
    fel.push({ grind: "H5", reason: `Okänd riktning: "${String(f.riktning)}"` });
  }
  if (f.method_note.trim() === "") {
    fel.push({ grind: "H5", reason: "method_note saknas — varje koppling ska bära sin motivering" });
  }
  if (!Number.isFinite(f.confidence) || f.confidence < 0 || f.confidence > 1) {
    fel.push({ grind: "H5", reason: `confidence ${f.confidence} ligger utanför [0,1]` });
  }
  if (ctx.handling?.kind === "motion" && !f.motionstyp) {
    fel.push({ grind: "H5", reason: "Motion utan motionstyp — parti/kommitté/enskild krävs (b-0007)" });
  }
  if (!f.promise_id && !f.stance_id) {
    fel.push({ grind: "H5", reason: "Förslaget pekar varken på löfte eller ståndpunkt" });
  }
  return fel;
}

/**
 * Prövar ett förslag mot H1–H5. Tom lista = redo för mänsklig granskning
 * (H6) — ALDRIG redo för publicering; det avgör ägaren.
 */
export function provaGrindarna(f: KopplingsForslag, ctx: GrindKontext): GrindFel[] {
  return [...grindH1(f, ctx), ...grindH2(f, ctx), ...grindH3(f, ctx), ...grindH4(f, ctx), ...grindH5(f, ctx)];
}
