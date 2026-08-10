/**
 * Normalisering av riksdagsdata till handlingar.json-poster.
 * Rena funktioner — ingen nätverksåtkomst här.
 */

import type { RdDokument, RdVoteringRad } from "./riksdagen.ts";
import { dokumentUrl } from "./riksdagen.ts";

export type HandlingKind = "votering" | "motion" | "proposition" | "interpellation" | "skriftlig_fraga";

export interface HandlingPerson {
  name: string;
  party: string;
  riksdagen_id?: string | null;
}

export interface RostFordelning {
  [party: string]: { ja: number; nej: number; avstar: number; franvarande: number };
}

export interface Handling {
  id: string;
  kind: HandlingKind;
  dok_id: string;
  votering_id?: string | null;
  punkt?: number | null;
  datum: string;
  /** Utskott (riksdagens organ-fält) — ämnestaxonomin, b-0014. */
  organ?: string;
  /** Motionstyp ur riksdagens egen klassning (b-0015), när handlingen är en motion. */
  motionstyp?: MotionsTyp;
  parties: string[];
  persons: HandlingPerson[];
  titel: string;
  url: string;
  archive_url: string | null;
  utfall?: string | null;
  rostfordelning?: RostFordelning | null;
}

const DOKTYP_TILL_KIND: Record<string, HandlingKind> = {
  mot: "motion",
  prop: "proposition",
  ip: "interpellation",
  fr: "skriftlig_fraga",
};

/**
 * En fråga eller interpellation listar både frågeställaren OCH den
 * tillfrågade ministern bland sina intressenter, så handlingens
 * partilista rymmer ministerns parti. Ministern är inte aktör:
 * en oppositionsledamot som frågar ett statsråd har inte gjort
 * statsrådets parti till avsändare. Ministrar bär alltid sin titel i
 * namnet ("Statsrådet …", "Justitieminister …", "Statsminister …",
 * "talman"); ledamöter har rena namn.
 */
const MINISTER_I_NAMN = /minister|statsråd|statsrad|\btalman\b/iu;

/**
 * Personerna som faktiskt står bakom handlingen. Riksdagens fråga- och
 * interpellationsdata listar även den tillfrågade ministern, ibland två
 * gånger (ställd till och besvarad av). Den personen är mottagare, inte
 * frågeställare, och får därför varken aktörsparti eller ledamotsmerit.
 */
export function aktorsPersoner(
  h: Pick<Handling, "kind" | "persons">,
): HandlingPerson[] {
  const personer =
    h.kind === "skriftlig_fraga" || h.kind === "interpellation"
      ? h.persons.filter((p) => !MINISTER_I_NAMN.test(p.name))
      : h.persons;
  return [...new Map(personer.map((p) => [p.riksdagen_id ?? p.name, p])).values()];
}

/**
 * Aktörspartierna bakom en handling — de partier som faktiskt STÅR för
 * handlingen, till skillnad från `handling.parties` som för en fråga/
 * interpellation även rymmer den tillfrågade ministern. För frågor och
 * interpellationer räknas bara frågeställarna (icke-statsråd); för
 * voteringar de partier som deltog i omröstningen; för motioner och
 * propositioner samtliga undertecknare (partilistan som den är).
 */
export function aktorsPartier(
  h: Pick<Handling, "kind" | "parties" | "persons" | "rostfordelning">,
): string[] {
  if (h.kind === "votering") {
    return h.rostfordelning ? Object.keys(h.rostfordelning) : h.parties;
  }
  if (h.kind === "skriftlig_fraga" || h.kind === "interpellation") {
    const fragestallare = aktorsPersoner(h);
    return [...new Set(fragestallare.map((p) => p.party).filter(Boolean))].sort();
  }
  return h.parties;
}

/** Motionstyp enligt beslut b-0007: parti/kommitté uttrycker partilinje, enskild gör det inte. */
export type MotionsTyp = "parti" | "kommitte" | "enskild";

/**
 * Riksdagens egen motionsklassning (fältet subtyp) → vår motionstyp (b-0015).
 * Riksdagen är facit; koden gissar inte. Okänt/tomt (t.ex. utgången motion)
 * ger undefined — då lämnas motionstypen osatt och avgörs i granskningen.
 */
export function motionstypAvSubtyp(subtyp: string | undefined): MotionsTyp | undefined {
  switch ((subtyp ?? "").trim().toLowerCase()) {
    case "enskild motion":
      return "enskild";
    case "kommittémotion":
    case "kommittemotion":
      return "kommitte";
    case "partimotion":
      return "parti";
    default:
      return undefined;
  }
}

/**
 * Dokumentlistan anger ofta partibet "-" — partiet berikas då via
 * ledamotsregistret (intressent_id → parti). Utan träff lämnas det tomt;
 * tomt är ärligt och stoppas senare av grind H3.
 */
export function berikaPartier(dok: RdDokument, partiAvId: Map<string, string>): RdDokument {
  return {
    ...dok,
    intressenter: dok.intressenter.map((i) => {
      const known = i.partibet && i.partibet !== "-";
      const lookedUp = i.intressent_id ? partiAvId.get(i.intressent_id) : undefined;
      return { ...i, partibet: known ? i.partibet : (lookedUp ?? "") };
    }),
  };
}

/** Normaliserar ett dokument (motion/prop/ip/fr) till en handling utan id. */
export function normaliseraDokument(dok: RdDokument): Omit<Handling, "id"> | null {
  const kind = DOKTYP_TILL_KIND[dok.doktyp];
  if (!kind) return null;
  if (!dok.dok_id || !dok.datum) return null;
  const persons: HandlingPerson[] = dok.intressenter
    .filter((i) => i.namn)
    .map((i) => ({ name: i.namn, party: i.partibet, riksdagen_id: i.intressent_id ?? null }));
  const parties = [...new Set(persons.map((p) => p.party).filter(Boolean))].sort();
  const motionstyp = kind === "motion" ? motionstypAvSubtyp(dok.subtyp) : undefined;
  return {
    kind,
    dok_id: dok.dok_id,
    datum: dok.datum,
    ...(dok.organ ? { organ: dok.organ } : {}),
    ...(motionstyp ? { motionstyp } : {}),
    parties,
    persons,
    titel: dok.titel,
    url: dokumentUrl(dok.dok_id),
    archive_url: null,
  };
}

/** Aggregerar per-ledamotsrader för EN votering (id+punkt) till en handling utan id. */
export function normaliseraVotering(rader: RdVoteringRad[]): Omit<Handling, "id"> | null {
  const first = rader[0];
  if (!first) return null;
  const sak = rader.filter((r) => r.votering_id === first.votering_id && r.avser === "sakfrågan");
  const rows = sak.length > 0 ? sak : rader.filter((r) => r.votering_id === first.votering_id);
  if (rows.length === 0) return null;
  const ford: RostFordelning = {};
  for (const r of rows) {
    const p = (ford[r.parti] ??= { ja: 0, nej: 0, avstar: 0, franvarande: 0 });
    if (r.rost === "Ja") p.ja += 1;
    else if (r.rost === "Nej") p.nej += 1;
    else if (r.rost === "Avstår") p.avstar += 1;
    else if (r.rost === "Frånvarande") p.franvarande += 1;
  }
  const ja = Object.values(ford).reduce((s, p) => s + p.ja, 0);
  const nej = Object.values(ford).reduce((s, p) => s + p.nej, 0);
  const ref = rows[0]!;
  return {
    kind: "votering",
    dok_id: `${ref.rm.replace("/", "")}:${ref.beteckning}`,
    ...(ref.beteckning.replace(/\d+$/u, "") ? { organ: ref.beteckning.replace(/\d+$/u, "") } : {}),
    votering_id: ref.votering_id,
    punkt: ref.punkt,
    datum: ref.datum ?? "",
    parties: [...new Set(rows.map((r) => r.parti).filter(Boolean))].sort(),
    persons: [],
    titel: `Votering ${ref.beteckning} punkt ${ref.punkt} (${ref.rm})`,
    url: `https://data.riksdagen.se/votering/${ref.votering_id}`,
    archive_url: null,
    utfall: ja > nej ? "bifall" : nej > ja ? "avslag" : null, // lika röstetal avgörs i kammaren, inte av oss
    rostfordelning: ford,
  };
}

/**
 * Delar upp voteringlista-rader per (votering_id) och normaliserar varje.
 * Sorterad deterministiskt på datum + dok_id + punkt.
 */
export function normaliseraVoteringar(rader: RdVoteringRad[]): Array<Omit<Handling, "id">> {
  const perVotering = new Map<string, RdVoteringRad[]>();
  for (const r of rader) {
    const list = perVotering.get(r.votering_id) ?? [];
    list.push(r);
    perVotering.set(r.votering_id, list);
  }
  const out: Array<Omit<Handling, "id">> = [];
  for (const rows of perVotering.values()) {
    const h = normaliseraVotering(rows);
    if (h) out.push(h);
  }
  return sorteraHandlingar(out);
}

export function sorteraHandlingar<T extends Omit<Handling, "id">>(hs: T[]): T[] {
  return [...hs].sort(
    (a, b) =>
      a.datum.localeCompare(b.datum) ||
      a.dok_id.localeCompare(b.dok_id) ||
      (a.punkt ?? 0) - (b.punkt ?? 0),
  );
}

/**
 * Idempotent sammanslagning: nya handlingar får löpande id h-<år>-<nnnn>
 * i deterministisk ordning; redan kända (samma dok_id+votering_id+punkt)
 * behåller sitt id och uppdateras inte i tysthet.
 */
export function mergeHandlingar(existing: Handling[], incoming: Array<Omit<Handling, "id">>, year: number): Handling[] {
  const key = (h: Omit<Handling, "id">) => `${h.dok_id}::${h.votering_id ?? ""}::${h.punkt ?? ""}`;
  const known = new Set(existing.map(key));
  let next =
    existing
      .map((h) => Number(h.id.match(/^h-\d{4}-(\d{4,})$/)?.[1] ?? 0))
      .reduce((a, b) => Math.max(a, b), 0) + 1;
  const out = [...existing];
  for (const h of sorteraHandlingar(incoming)) {
    if (known.has(key(h))) continue;
    known.add(key(h));
    out.push({ ...h, id: `h-${year}-${String(next).padStart(4, "0")}` });
    next += 1;
  }
  return out;
}
