/**
 * Partisidan (Vy 2) och ledamotssidan (Vy 3). Rena byggtidsfunktioner ur den
 * incheckade, deterministiska domsdatan.
 *
 * Vy 2: partiets egna löften med status, plus listan över handlingar som gett
 * utslag för partiet (nyast först). Andelen utan handling redovisas som tal.
 * Vy 3: den enskilda ledamotens meriter ur domar.json — röster i kopplade
 * voteringar och egna dokument, per löfte. Frånvaro visas men fäller aldrig
 * något (b-0004). Avvikelser från partilinjen markeras (spec §6.4). Bara de
 * 425 sittande får sida (b-0018 F5); avhoppade får en notis där de nämns.
 */
import {
  getDomar,
  getLoften,
  getParties,
  getKopplingar,
  getHandlingMap,
  getPersoner,
  getSoktaLoften,
  malId,
  type DomStatus,
  type PartiDom,
  type Koppling,
  type Handling,
} from "./data.ts";

type Utslag = "i_linje" | "emot" | "avstod" | "franvarande";

/** (mål, parti) → partidom, för snabb uppslagning. */
function domarIndex(): Map<string, PartiDom> {
  const m = new Map<string, PartiDom>();
  for (const d of getDomar().partidomar) m.set(`${d.target_id}::${d.party}`, d);
  return m;
}

function handlingVy(h: Handling | undefined, id: string) {
  return {
    id,
    kind: h?.kind ?? "okänd",
    titel: h?.titel ?? "",
    datum: h?.datum ?? "",
    organ: h?.organ ?? null,
    url: h?.url ?? "",
    arkiv_url: h?.archive_url ?? null,
  };
}

// ---- Vy 2: partisidan --------------------------------------------------

export interface PartiLofteRad {
  id: string;
  titel: string;
  kategori: string;
  status: DomStatus;
  n_i_linje: number;
  n_emot: number;
  n_avstod: number;
}

export interface PartiHandling {
  koppling_id: string;
  lofte_id: string;
  lofte_titel: string;
  /** Partierna bakom löftet som handlingen vägdes mot. */
  lofte_partier: string[];
  /** Deras namn, utskrivna — raden ska säga vems löfte det var. */
  lofte_partinamn: string[];
  /** Sant när löftet är partiets eget. */
  eget_lofte: boolean;
  utslag: Utslag;
  handling: ReturnType<typeof handlingVy>;
}

export interface PartiSida {
  code: string;
  namn: string;
  block: string;
  summa: {
    total_loften: number;
    vagda: number;
    i_linje: number;
    emot: number;
    bade_och: number;
    avstod: number;
    ingen_handling: number;
    /** Utan utslag DÄRFÖR ATT vi sökt igenom löftet utan att hitta något. */
    sokt_utan_traff: number;
    /** Utan utslag DÄRFÖR ATT vi ännu inte sökt på löftet. */
    ej_sokt: number;
    /** Utslag partiets handlingar gett MOT ANDRA PARTIERS löften. */
    emot_andras: number;
  };
  loften: PartiLofteRad[];
  /** Handlingar vägda mot partiets EGNA löften. */
  handlingar: PartiHandling[];
  /** Handlingar vägda mot ANDRA partiers löften. */
  handlingar_andras: PartiHandling[];
}

export function partiKoder(): string[] {
  return getParties().map((p) => p.code);
}

export function buildPartiSida(code: string): PartiSida | null {
  const parti = getParties().find((p) => p.code === code);
  if (!parti) return null;
  const dIdx = domarIndex();
  const handlingar = getHandlingMap();
  const kById = new Map(getKopplingar().map((k) => [k.id, k]));

  const egnaLoften = getLoften().filter((l) => l.parties.includes(code));
  const loften: PartiLofteRad[] = egnaLoften.map((l) => {
    const d = dIdx.get(`${l.id}::${code}`);
    return {
      id: l.id,
      titel: l.titel,
      kategori: l.kategori,
      status: d?.status ?? "ingen_handling_annu",
      n_i_linje: d?.i_linje.length ?? 0,
      n_emot: d?.emot.length ?? 0,
      n_avstod: d?.avstod.length ?? 0,
    };
  });
  loften.sort((a, b) => {
    const av = a.n_i_linje + a.n_emot + a.n_avstod > 0 ? 0 : 1;
    const bv = b.n_i_linje + b.n_emot + b.n_avstod > 0 ? 0 : 1;
    return av - bv || a.kategori.localeCompare(b.kategori, "sv") || a.id.localeCompare(b.id);
  });

  const loftenById = new Map(getLoften().map((l) => [l.id, l]));
  const partiNamn = new Map(getParties().map((p) => [p.code, p.namn]));
  const handlingar_ut: PartiHandling[] = [];
  for (const d of getDomar().partidomar) {
    if (d.party !== code) continue;
    const rader: Array<[string, Utslag]> = [
      ...d.i_linje.map((k) => [k, "i_linje"] as [string, Utslag]),
      ...d.emot.map((k) => [k, "emot"] as [string, Utslag]),
      ...d.avstod.map((k) => [k, "avstod"] as [string, Utslag]),
    ];
    for (const [kid, utslag] of rader) {
      const k = kById.get(kid);
      if (!k) continue;
      const l = loftenById.get(d.target_id);
      const partier = l?.parties ?? [];
      handlingar_ut.push({
        koppling_id: kid,
        lofte_id: d.target_id,
        lofte_titel: l?.titel ?? d.target_id,
        lofte_partier: partier,
        lofte_partinamn: partier.map((c) => partiNamn.get(c) ?? c),
        eget_lofte: partier.includes(code),
        utslag,
        handling: handlingVy(handlingar.get(k.handling_id), k.handling_id),
      });
    }
  }
  handlingar_ut.sort((a, b) => b.handling.datum.localeCompare(a.handling.datum));

  // Summan handlar om partiets EGNA löften. Handlingslistan gjorde det inte:
  // den tog med varje utslag partiets handlingar gett, också mot andra
  // partiers löften — och just de utgör i dag samtliga emot-utslag i
  // registret. Sida vid sida läste det som att nollan var fel. De två
  // populationerna hålls nu isär och räknas var för sig.
  const egna = handlingar_ut.filter((h) => h.eget_lofte);
  const andras = handlingar_ut.filter((h) => !h.eget_lofte);

  const vagda = loften.filter((l) => l.n_i_linje + l.n_emot + l.n_avstod > 0);
  const utanUtslag = loften.filter((l) => l.n_i_linje + l.n_emot + l.n_avstod === 0);
  const sokta = getSoktaLoften();
  const summa = {
    total_loften: loften.length,
    vagda: vagda.length,
    i_linje: loften.filter((l) => l.status === "agerat_i_linje").length,
    emot: loften.filter((l) => l.status === "agerat_emot").length,
    bade_och: loften.filter((l) => l.status === "bade_och").length,
    // Avstod-bara: vägt, men varken i linje, emot eller både och. Utan det
    // talet summerar de fyra utfallen inte till antalet vägda löften.
    avstod: vagda.filter(
      (l) => l.status !== "agerat_i_linje" && l.status !== "agerat_emot" && l.status !== "bade_och",
    ).length,
    ingen_handling: loften.length - vagda.length,
    // "Utan handling ännu" var ETT tal som dolde två helt olika påståenden:
    // att vi letat och inte funnit något, och att vi inte letat. Skillnaden
    // följer parti — för S är nästan varje tomt löfte genomsökt, för L bara
    // ungefär hälften — så samma ord sa olika saker om olika partier.
    sokt_utan_traff: utanUtslag.filter((l) => sokta.has(l.id)).length,
    ej_sokt: utanUtslag.filter((l) => !sokta.has(l.id)).length,
    emot_andras: andras.filter((h) => h.utslag === "emot").length,
  };

  return {
    code, namn: parti.namn, block: parti.block, summa, loften,
    handlingar: egna, handlingar_andras: andras,
  };
}

// ---- Vy 3: ledamotssidan -----------------------------------------------

export interface LedamotPost {
  koppling_id: string;
  utslag: Utslag;
  avvikelse: boolean;
  egen_handling: boolean;
  handling: ReturnType<typeof handlingVy>;
}

export interface LedamotMeritVy {
  lofte_id: string;
  lofte_titel: string;
  poster: LedamotPost[];
}

export interface LedamotSida {
  intressent_id: string;
  namn: string;
  parti: string;
  valkrets: string;
  summa: { loften: number; i_linje: number; emot: number; avstod: number; franvarande: number; avvikelser: number };
  meriter: LedamotMeritVy[];
}

export function ledamotIds(): string[] {
  return getPersoner().map((p) => p.intressent_id).sort();
}

const UTSLAG_FALT: Record<Utslag, "i_linje" | "emot" | "avstod" | "franvarande"> = {
  i_linje: "i_linje",
  emot: "emot",
  avstod: "avstod",
  franvarande: "franvarande",
};

export function buildLedamotSida(id: string): LedamotSida | null {
  const person = getPersoner().find((p) => p.intressent_id === id);
  if (!person) return null;
  const dIdx = domarIndex();
  const handlingar = getHandlingMap();
  const kById = new Map(getKopplingar().map((k) => [k.id, k]));
  const loftenTitel = new Map(getLoften().map((l) => [l.id, l.titel]));

  const meriter = getDomar().ledamotsmeriter.filter((m) => m.intressent_id === id);
  const summa = { loften: 0, i_linje: 0, emot: 0, avstod: 0, franvarande: 0, avvikelser: 0 };
  const ut: LedamotMeritVy[] = [];

  for (const m of meriter) {
    const partiDom = dIdx.get(`${m.target_id}::${m.party}`);
    const poster: LedamotPost[] = [];
    const rader: Array<[string, Utslag]> = [
      ...m.i_linje.map((k) => [k, "i_linje"] as [string, Utslag]),
      ...m.emot.map((k) => [k, "emot"] as [string, Utslag]),
      ...m.avstod.map((k) => [k, "avstod"] as [string, Utslag]),
      ...m.franvarande.map((k) => [k, "franvarande"] as [string, Utslag]),
    ];
    for (const [kid, utslag] of rader) {
      const k = kById.get(kid);
      const h = k ? handlingar.get(k.handling_id) : undefined;
      const arVotering = h?.kind === "votering";
      // Avvikelse: bara för voteringar och bara när ledamotens klassning skiljer
      // sig från partiets på samma koppling (frånvaro är aldrig en avvikelse).
      let avvikelse = false;
      if (arVotering && partiDom && utslag !== "franvarande") {
        const partiFalt = partiDom.i_linje.includes(kid)
          ? "i_linje"
          : partiDom.emot.includes(kid)
            ? "emot"
            : partiDom.avstod.includes(kid)
              ? "avstod"
              : null;
        if (partiFalt && partiFalt !== UTSLAG_FALT[utslag]) avvikelse = true;
      }
      if (avvikelse) summa.avvikelser += 1;
      summa[utslag] += 1;
      poster.push({
        koppling_id: kid,
        utslag,
        avvikelse,
        egen_handling: !arVotering,
        handling: handlingVy(h, k?.handling_id ?? ""),
      });
    }
    poster.sort((a, b) => b.handling.datum.localeCompare(a.handling.datum));
    ut.push({ lofte_id: m.target_id, lofte_titel: loftenTitel.get(m.target_id) ?? m.target_id, poster });
  }
  ut.sort((a, b) => a.lofte_id.localeCompare(b.lofte_id));
  summa.loften = ut.length;

  return { intressent_id: id, namn: person.namn, parti: person.parti, valkrets: person.valkrets, summa, meriter: ut };
}
