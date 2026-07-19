/**
 * Grindarna H1–H5 — deterministiska spärrar för kopplingsförslag.
 *
 * En koppling (löfte/ståndpunkt ↔ riksdagshandling) publiceras aldrig om
 * inte samtliga grindar passeras. Språkmodellen får bara FÖRESLÅ; grindarna
 * här är kod, och H6 (ägarbeslut) fattas alltid av en människa i
 * granskningsflödet — den kan per definition inte passeras programmatiskt.
 *
 * Citatkontrollen (H2) återanvänder mönstret från valflask
 * pipeline/src/gates.ts: identisk normalisering av källtext och citat, så
 * att bara typografiska olikheter neutraliseras — påhittad text kan aldrig
 * slinka igenom. Skiftläge bevaras: ordagrant är ordagrant.
 */

import type { Handling } from "./handlingar.ts";
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

/** H2 — Ordagrant bevis: citatet ska stå tecken för tecken i källtexten. */
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
  return fel;
}

/** H3 — Rätt aktör: handlingens parti(er) ska stämma med löftets. */
function grindH3(f: KopplingsForslag, ctx: GrindKontext): GrindFel[] {
  if (!ctx.handling) return []; // H1 har redan fällt förslaget
  if (ctx.malPartier.length === 0) {
    return [{ grind: "H3", reason: "Löftet/ståndpunkten saknar parti — ingen aktör att pröva mot" }];
  }
  // En votering omfattar alla partier i kammaren; aktörskravet är då att
  // partiet alls förekommer i röstfördelningen.
  const partier =
    ctx.handling.kind === "votering" && ctx.handling.rostfordelning
      ? Object.keys(ctx.handling.rostfordelning)
      : ctx.handling.parties;
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
