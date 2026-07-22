/**
 * Bygger rutnätets (Vy 1) datamodell ur den incheckade, deterministiska
 * domsdatan. Ren funktion, körs vid byggtid av api/hv-endpointsen.
 *
 * Rader = löften som registret HITTILLS vägt mot handling (minst en aktiv,
 * granskad koppling). Löften utan koppling redovisas som ett ärligt tal, inte
 * som 416 tomma rader (samma mönster som partisidan: "andelen utan handling").
 * Kolumner = alla åtta riksdagspartier (b-0018 F1). En cell fylls bara där
 * partiet självt agerat; övriga står tomma ("ingen ren koppling ännu").
 */
import {
  getDomar,
  getLoften,
  getParties,
  getKopplingar,
  getHandlingMap,
  malId,
  type DomStatus,
  type PartiDom,
  type Koppling,
} from "./data.ts";

export interface Cell {
  status: DomStatus;
  n_i_linje: number;
  n_emot: number;
  n_avstod: number;
}

export interface RutnatRad {
  id: string;
  titel: string;
  kategori: string;
  parties: string[];
  n_kopplingar: number;
  celler: Record<string, Cell>;
}

export interface Summary {
  genererad: string;
  version: string;
  license: string;
  partier: Array<{ code: string; namn: string; block: string }>;
  statusord: Record<DomStatus | "avstod", string>;
  kategorier: string[];
  loften: RutnatRad[];
  summa: { total_lof: number; vagda: number; utan_handling: number };
}

const STATUSORD: Record<DomStatus | "avstod", string> = {
  agerat_i_linje: "i linje",
  agerat_emot: "emot",
  bade_och: "både och",
  ingen_handling_annu: "ingen ren koppling ännu",
  avstod: "avstod",
};

/** Aktiva kopplingar grupperade på mål (löfte/ståndpunkt). */
function aktivaPerMal(): Map<string, Koppling[]> {
  const m = new Map<string, Koppling[]>();
  for (const k of getKopplingar()) {
    if (k.status !== "aktiv") continue;
    const t = malId(k);
    m.set(t, [...(m.get(t) ?? []), k]);
  }
  return m;
}

function cellAvDom(d: PartiDom): Cell {
  return { status: d.status, n_i_linje: d.i_linje.length, n_emot: d.emot.length, n_avstod: d.avstod.length };
}

/** Tar en cell bara om partiet visat aktivitet (i linje / emot / avstod). */
function harAktivitet(c: Cell): boolean {
  return c.n_i_linje > 0 || c.n_emot > 0 || c.n_avstod > 0;
}

export function buildSummary(): Summary {
  const domar = getDomar();
  const loftenById = new Map(getLoften().map((l) => [l.id, l]));
  const perMal = aktivaPerMal();

  const domarPerMal = new Map<string, PartiDom[]>();
  for (const d of domar.partidomar) {
    domarPerMal.set(d.target_id, [...(domarPerMal.get(d.target_id) ?? []), d]);
  }

  const loften: RutnatRad[] = [];
  for (const [malid, kopplingar] of perMal) {
    const lof = loftenById.get(malid);
    if (!lof) continue; // ståndpunkter (stance_id) saknar löftesindex — Frågevågen kommer med F4-arbetet
    const celler: Record<string, Cell> = {};
    for (const d of domarPerMal.get(malid) ?? []) {
      const c = cellAvDom(d);
      if (harAktivitet(c)) celler[d.party] = c;
    }
    loften.push({
      id: lof.id,
      titel: lof.titel,
      kategori: lof.kategori,
      parties: lof.parties,
      n_kopplingar: kopplingar.length,
      celler,
    });
  }
  loften.sort((a, b) => a.kategori.localeCompare(b.kategori, "sv") || a.id.localeCompare(b.id));

  const kategorier = [...new Set(loften.map((l) => l.kategori))].sort((a, b) => a.localeCompare(b, "sv"));
  const totalLof = getLoften().length;

  return {
    genererad: domar.genererad,
    version: "hv-summary-1",
    license: "CC-BY-4.0",
    partier: getParties(),
    statusord: STATUSORD,
    kategorier,
    loften,
    summa: { total_lof: totalLof, vagda: loften.length, utan_handling: totalLof - loften.length },
  };
}

export interface KopplingVy {
  id: string;
  riktning: "stodjer" | "motverkar";
  motionstyp: string | null;
  confidence: number | null;
  citat: string;
  method_note: string | null;
  granskad_av_manniska: boolean;
  provad_datum: string | null;
  handling: {
    id: string;
    kind: string;
    titel: string;
    datum: string;
    organ: string | null;
    dok_id: string;
    parties: string[];
    url: string;
    arkiv_url: string | null;
  };
}

export interface LofteDetalj {
  id: string;
  titel: string;
  kategori: string;
  parties: string[];
  citat: string;
  datum: string;
  kalla_url: string;
  arkiv_url: string | null;
  domar: Record<string, { status: DomStatus; i_linje: string[]; emot: string[]; avstod: string[] }>;
  kopplingar: KopplingVy[];
}

/** Datum ur ett run_id som "foreslag-2026-07-20", annars null. */
function datumUrRunId(runId: string | undefined): string | null {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(runId ?? "");
  return m ? m[1] : null;
}

export function lofteIds(): string[] {
  const perMal = aktivaPerMal();
  const loftenById = new Map(getLoften().map((l) => [l.id, l]));
  return [...perMal.keys()].filter((id) => loftenById.has(id)).sort();
}

export function buildLofteDetalj(id: string): LofteDetalj | null {
  const lof = getLoften().find((l) => l.id === id);
  if (!lof) return null;
  const handlingar = getHandlingMap();
  const kopplingar = getKopplingar().filter((k) => k.status === "aktiv" && malId(k) === id);

  const kopplingVyer: KopplingVy[] = kopplingar.map((k) => {
    const h = handlingar.get(k.handling_id);
    return {
      id: k.id,
      riktning: k.riktning,
      motionstyp: k.motionstyp ?? h?.motionstyp ?? null,
      confidence: typeof k.confidence === "number" ? k.confidence : null,
      citat: k.bevis?.citat ?? "",
      method_note: k.method_note ?? null,
      granskad_av_manniska: k.extraction?.verified_by === "owner",
      provad_datum: datumUrRunId(k.extraction?.run_id),
      handling: {
        id: k.handling_id,
        kind: h?.kind ?? "okänd",
        titel: h?.titel ?? "",
        datum: h?.datum ?? "",
        organ: h?.organ ?? null,
        dok_id: h?.dok_id ?? "",
        parties: h?.parties ?? [],
        url: h?.url ?? "",
        arkiv_url: h?.archive_url ?? null,
      },
    };
  });

  const domar: LofteDetalj["domar"] = {};
  for (const d of getDomar().partidomar) {
    if (d.target_id !== id) continue;
    if (d.i_linje.length || d.emot.length || d.avstod.length) {
      domar[d.party] = { status: d.status, i_linje: d.i_linje, emot: d.emot, avstod: d.avstod };
    }
  }

  return {
    id: lof.id,
    titel: lof.titel,
    kategori: lof.kategori,
    parties: lof.parties,
    citat: lof.citat,
    datum: lof.datum,
    kalla_url: lof.kalla_url,
    arkiv_url: lof.arkiv_url,
    domar,
    kopplingar: kopplingVyer,
  };
}

export interface SokPost {
  typ: "lofte" | "kategori";
  id: string;
  text: string;
  kategori?: string;
}

/**
 * Eget litet sökindex (b-0018 F3): exakt matchning + prefix på löftestitlar och
 * kategorier — de rader rutnätet faktiskt kan visa. Inga beroenden, buntat i
 * bygget. Vidgas till ledamöter och betänkanden när Vy 2/3 finns.
 */
export function buildSokIndex(): SokPost[] {
  const summary = buildSummary();
  const poster: SokPost[] = [];
  for (const kat of summary.kategorier) poster.push({ typ: "kategori", id: kat, text: kat });
  for (const l of summary.loften) poster.push({ typ: "lofte", id: l.id, text: l.titel, kategori: l.kategori });
  return poster;
}
