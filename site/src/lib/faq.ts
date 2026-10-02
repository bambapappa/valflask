/**
 * FAQ för agenter — frågeformaterade, citerbara svar byggda ur publicerat data.
 *
 * Varje svar är en ren funktion av datat: fråga, kort svar, källor med citat
 * och arkivlänk, och ett data_hash som binder svaret till underlaget. Inga
 * tal skrivs in för hand och inga partipositioner formuleras om — delfrågorn
 * lydelse är den låsta formuleringen ur issues.json, citaten är partietas egna
 * ord ur stances.json och promises.json, och summorna räknas med samma
 * funktioner som partisidorna (aggregates.ts). Saknas besked är det också
 * svaret: «inget tydligt besked publicerat».
 *
 * Frågeurvalet är en regel, inte en handplockad lista:
 *   - DELFRÅGOR: en FAQ-sida per delfråga där minst ett parti har ett givet,
 *     publikt belagt besked och minst ett av de aktuella beskeden bär
 *     arkivkopia (citerbarheten är poängen med hela ytan).
 *   - PARTIKOSTNAD: en sida per riksdagsparti — «Vad kostar X:s vallöften?».
 *   - TOTALKOSTNAD: en sida för hela fältet.
 *
 * Källorna till kostnadssvaren är partiets dyraste löften som bär arkivkopia
 * — ett deterministiskt urval som garanterar att varje svar kan citeras med
 * belägg, medan hela beståndet ligger kvar i promises.json.
 *
 * updated_at är underlagets datum — senaste sökningen/ändringen för delfrågor,
 * senaste löftesändringen för kostnader — aldrig byggdagen: ett svar ska inte
 * «friskna till» av att sajten byggs om.
 *
 * Grinden: scripts/test-faq.mts vänder citatgrindarna mot den här modulen.
 */
import { getPromises, getParties, getChangelog, type PromisePost, type Party } from "./data.ts";
import {
  getIssuesFile,
  getStances,
  cellFor,
  statementById,
  type Issue,
  type Subquestion,
  type StanceCell,
  type StanceStatement,
  type CurrentPosition,
} from "./stances.ts";
import {
  promiseNetMsek,
  partyTotalMsek,
  partyFinancingClaimedMsek,
  partyFinancingGapMsek,
  totalFlasket,
  totalFinancingClaimed,
  financingGap,
  isActive,
} from "./aggregates.ts";
import { computeDataHash } from "./canonical.ts";
import { formatMsek } from "./calc.ts";

export type FaqTyp = "delfraga" | "partikostnad" | "totalkostnad";

/** En källa i ett FAQ-svar. Citatet är partietas egna ord, aldrig vår prosa. */
export interface FaqKalla {
  /** Partinamn som läsaren känner det, eller null för sajtbekräftelse. */
  parti: string | null;
  quote: string | null;
  url: string;
  archive_url: string | null;
  date: string;
}

export interface FaqPartiBesked {
  parti_kod: string;
  parti_namn: string;
  position: CurrentPosition;
}

export interface FaqSvar {
  question: string;
  slug: string;
  typ: FaqTyp;
  /** Var frågan hör hemma — «Valets stora frågor — Energipolitiken». */
  kontext: string;
  answer_short: string;
  updated_at: string;
  license: "CC-BY-4.0";
  data_hash: string;
  sources: FaqKalla[];
  data: {
    delfraga_id?: string;
    fraga_url?: string;
    subquestion_id?: string;
    parti_besked?: FaqPartiBesked[];
    parti_kod?: string;
    antal_loften?: number;
    total_msek?: number;
    finansiering_msek?: number;
    gap_msek?: number;
    dyraste_loftena?: Array<{ id: string; titel: string; slug: string; net_msek: number; url: string; arkiv_url: string | null; datum: string }>;
  };
}

/* ───────────────────────── blänkt underlag (tillhör grinden) ───────────── */

let blankat = false;

/**
 * Blänk underlaget — till `test-faq.mts`, som kräver att hela urvalet faller
 * mot tomma filer. En generator som svarar något ändå skulle hitta på, och
 * det är precis vad ytan inte får göra.
 */
export function blankaFaq(pa: boolean): void {
  blankat = pa;
}

function lasData<T>(ekta: () => T, blank: () => T): T {
  return blankat ? blank() : ekta();
}

function losningar(): PromisePost[] {
  return lasData(getPromises, () => []);
}

function partier(): Party[] {
  return lasData(getParties, () => []);
}

/* ────────────────────────────── delfrågor ─────────────────────────────── */

function aktuelltBesked(cell: StanceCell): StanceStatement | undefined {
  return statementById(cell, cell.current.statement_id);
}

function positionOrd(p: CurrentPosition): string {
  return p === "ja" ? "ja" : p === "nej" ? "nej" : p === "villkorat" ? "villkorat" : "inget tydligt besked";
}

function delfrageSvar(
  issue: Issue,
  sq: Subquestion,
  stances: StanceCell[],
  parties: Party[],
): FaqSvar | null {
  const celler = parties
    .map((p) => ({ parti: p, cell: cellFor(stances, sq.id, p.code) }))
    .map(({ parti, cell }) => ({ parti, cell, st: cell ? aktuelltBesked(cell) : undefined }));

  const medBesked = celler.filter((c) => c.st !== undefined);
  // Citerbarhetskravet är del av urvalsregeln: minst ett aktuellt besked
  // måste bära arkivkopia, annars blir svaret en påståendesida.
  if (medBesked.length === 0) return null;
  if (!medBesked.some((c) => (c.st!.source.archive_url ?? "").startsWith("http"))) return null;

  const namn = new Map(parties.map((p) => [p.code, p.name] as const));
  const partiPositioner: FaqPartiBesked[] = celler.map((c) => ({
    parti_kod: c.parti.code,
    parti_namn: c.parti.name,
    position: c.st?.position ?? c.cell?.current.position ?? "inget_tydligt_besked",
  }));

  const grupper: string[] = [];
  for (const pos of ["ja", "nej", "villkorat"] as const) {
    const namnen = partiPositioner.filter((pb) => pb.position === pos).map((pb) => pb.parti_namn);
    if (namnen.length > 0) grupper.push(`${positionOrd(pos)} — ${namnen.join(", ")}`);
  }
  const utanBesked = partiPositioner.filter((pb) => pb.position === "inget_tydligt_besked");
  const antalBesked = partiPositioner.length - utanBesked.length;

  const answer_short =
    `${antalBesked} av ${partiPositioner.length} riksdagspartier har gett tydligt besked: ` +
    `${grupper.join("; ")}. ` +
    (utanBesked.length > 0
      ? `Övriga ${utanBesked.length} har inget tydligt besked publicerat. `
      : "") +
    `Varje besked bygger på ett ordagrant citat med källa och arkivkopia.`;

  const sources: FaqKalla[] = medBesked.map((c) => ({
    parti: c.parti.name,
    quote: c.st!.quote,
    url: c.st!.source.url,
    archive_url: c.st!.source.archive_url,
    date: c.st!.date_stated,
  }));

  const datum: string[] = [];
  for (const c of celler) {
    if (c.cell?.last_searched) datum.push(c.cell.last_searched);
    for (const st of c.cell?.statements ?? []) datum.push(st.date_stated);
    for (const a of c.cell?.changes ?? []) datum.push(a.date);
  }
  const updated_at = datum.sort().at(-1) ?? "";

  const slug = sq.id.replace(/^sq-/, "");
  const data: FaqSvar["data"] = {
    delfraga_id: sq.id,
    subquestion_id: sq.id,
    fraga_url: `https://utlovat.se/fraga/${issue.slug}`,
    parti_besked: partiPositioner,
  };

  return {
    question: sq.text,
    slug,
    typ: "delfraga",
    kontext: `Valets stora frågor — ${issue.title}`,
    answer_short,
    updated_at,
    license: "CC-BY-4.0",
    data_hash: hashUtan("data_hash", { question: sq.text, slug, sources, data, updated_at }),
    sources,
    data,
  };
}

/* ────────────────────────── kostnadsfrågor ────────────────────────────── */

function dyrasteMedArkiv(promises: PromisePost[], antal: number): PromisePost[] {
  return [...promises]
    .filter((p) => isActive(p) && (p.source.archive_url ?? "").startsWith("http"))
    .sort((a, b) => promiseNetMsek(b) - promiseNetMsek(a) || a.id.localeCompare(b.id))
    .slice(0, antal);
}

function loftesKalla(p: PromisePost, parties: Party[]): FaqKalla {
  const namn = p.parties.map((kod) => parties.find((x) => x.code === kod)?.name ?? kod.toUpperCase()).join(", ");
  return {
    parti: namn,
    quote: p.quote,
    url: p.source.url,
    archive_url: p.source.archive_url,
    date: p.date_stated,
  };
}

function senasteUnderlagsdag(changelog: ReturnType<typeof getChangelog>, promises: PromisePost[]): string {
  const dagar = changelog
    .map((c) => (typeof c.timestamp === "string" ? c.timestamp.slice(0, 10) : ""))
    .filter(Boolean);
  for (const p of promises) if (isActive(p)) dagar.push(p.date_stated);
  return dagar.sort().at(-1) ?? "";
}

function kostnadsSvar(
  question: string,
  slug: string,
  kontext: string,
  partinamn: string | null,
  partiKod: string | null,
  loften: PromisePost[],
  parties: Party[],
  changelog: ReturnType<typeof getChangelog>,
): FaqSvar | null {
  const total = partiKod === null
    ? totalFlasket(loften)
    : partyTotalMsek(loften, partiKod);
  const fin = partiKod === null
    ? totalFinancingClaimed(loften)
    : partyFinancingClaimedMsek(loften, partiKod);
  const gap = partiKod === null ? financingGap(loften) : partyFinancingGapMsek(loften, partiKod);
  const antal = loften.filter(isActive).length;
  const urval = dyrasteMedArkiv(
    partiKod === null ? loften : loften.filter((p) => isActive(p) && p.parties.includes(partiKod)),
    3,
  );
  // Utan citert belägg finns inget citerbart svar — detsamma gäller ett blänkt
  // underlag. Då är ärliga svaret ingen sida alls.
  if (urval.length === 0) return null;

  const answer_short =
    `${partinamn ?? "Riksdagspartierna"} har ${antal} prissatta vallöften som sammanlagt kostar ` +
    `≈ ${formatMsek(total)} för mandatperioden, enligt utlovat.se:s prissättning. ` +
    `Angiven finansiering: ${formatMsek(fin)}. Finansieringsgap: ${formatMsek(gap)}. ` +
    `Beloppen är uppskattningar med osäkerhetsspann; hela underlaget finns i promises.json.`;

  const data: FaqSvar["data"] = {
    parti_kod: partiKod ?? undefined,
    antal_loften: antal,
    total_msek: total,
    finansiering_msek: fin,
    gap_msek: gap,
    dyraste_loftena: urval.map((p) => ({
      id: p.id,
      titel: p.title,
      slug: p.slug,
      net_msek: promiseNetMsek(p),
      url: p.source.url,
      arkiv_url: p.source.archive_url,
      datum: p.date_stated,
    })),
  };

  return {
    question,
    slug,
    typ: partiKod === null ? "totalkostnad" : "partikostnad",
    kontext,
    answer_short,
    updated_at: senasteUnderlagsdag(changelog, loften),
    license: "CC-BY-4.0",
    data_hash: hashUtan("data_hash", { question, slug, sources: urval.map((p) => loftesKalla(p, parties)), data }),
    sources: urval.map((p) => loftesKalla(p, parties)),
    data,
  };
}

/* ────────────────────────── hash och urval ────────────────────────────── */

function hashUtan(uteslut: string, obj: Record<string, unknown>): string {
  const kopia: Record<string, unknown> = { ...obj };
  delete kopia[uteslut];
  return computeDataHash([kopia]);
}

/** Alla FAQ-svar, deterministiskt ordnade: delfrågor, partikostnader, total. */
export function faqFragor(): FaqSvar[] {
  const parties = partier();
  const stances = lasData(getStances, () => [] as StanceCell[]);
  const issues = lasData(getIssuesFile, () => ({ criteria_note: "", formulation_note: "", issues: [] as Issue[] })).issues;
  const loften = losningar();
  const changelog = lasData(getChangelog, () => [] as ReturnType<typeof getChangelog>);

  const delfragor = issues
    .flatMap((issue) => issue.subquestions.map((sq) => ({ issue, sq })))
    .map(({ issue, sq }) => delfrageSvar(issue, sq, stances, parties))
    .filter((s): s is FaqSvar => s !== null);

  const partiKostnader = parties
    .map((p) =>
      kostnadsSvar(
        `Vad kostar ${p.name}s vallöften?`,
        `kostnad-${p.code}`,
        `Fläskvågen — ${p.name}`,
        p.name,
        p.code,
        loften,
        parties,
        changelog,
      ),
    )
    .filter((s): s is FaqSvar => s !== null);

  const total = kostnadsSvar(
    "Vad kostar riksdagspartiernas vallöften totalt?",
    "kostnad-totalt",
    "Fläskvågen — hela fältet",
    null,
    null,
    loften,
    parties,
    changelog,
  );

  return [...delfragor, ...partiKostnader, ...(total ? [total] : [])];
}

export function faqEfterSlug(slug: string): FaqSvar | undefined {
  return faqFragor().find((s) => s.slug === slug);
}
