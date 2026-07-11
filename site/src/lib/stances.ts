/**
 * Frågevågen — dataladdning och vymodeller (SPEC-FRAGEVAGEN.md §7).
 *
 * Rena funktioner: all presentationslogik (etiketter, tomcells-copy,
 * svängregister) ligger här så att den kan enhetstestas mot fixtures
 * och garanterat är identisk för alla åtta partier (§2.4).
 */
import { loadData } from "./data";

export type StatementPosition = "ja" | "nej" | "villkorat";
export type CurrentPosition = StatementPosition | "inget_tydligt_besked";
export type ChangeKind = "riktningsbyte" | "precisering" | "villkorsandring";

export interface Subquestion {
  id: string;
  text: string;
  formulation_status: "utkast" | "verifierad";
  fairness_note: string;
}

export interface Issue {
  id: string;
  title: string;
  slug: string;
  category: string;
  status: "aktiv" | "dormant";
  selection_sources: Array<{
    institute: string;
    survey: string;
    url: string;
    date: string;
    rank: number | null;
    share_percent: number | null;
    note?: string;
  }>;
  subquestions: Subquestion[];
}

export interface IssuesFile {
  criteria_note: string;
  formulation_note: string;
  issues: Issue[];
}

export interface StanceStatement {
  id: string;
  position: StatementPosition;
  condition_note: string | null;
  quote: string;
  person: { name: string; role: string; riksdagen_id?: string | null } | null;
  date_stated: string;
  source: {
    url: string;
    domain: string;
    archive_url: string | null;
    fetched_at: string;
  };
  source_status: "ok" | "andrad" | "borttagen";
  source_checked_at: string | null;
  related_promise_ids: string[];
  extraction: { model: string; verified_by: string; run_id: string };
}

export interface StanceChange {
  date: string;
  from_statement: string;
  to_statement: string;
  kind: ChangeKind;
  commit: string | null;
}

export interface StanceCell {
  subquestion_id: string;
  party: string;
  current: { position: CurrentPosition; statement_id: string | null };
  statements: StanceStatement[];
  changes: StanceChange[];
  last_searched: string | null;
}

export function getIssuesFile(): IssuesFile {
  return loadData<IssuesFile>("issues.json");
}

export function getStances(): StanceCell[] {
  return loadData<StanceCell[]>("stances.json");
}

/* ───────────────────────────────────────────── etiketter (mono versal) ── */

export const POSITION_LABEL: Record<CurrentPosition, string> = {
  ja: "JA",
  nej: "NEJ",
  villkorat: "VILLKORAT",
  inget_tydligt_besked: "BESKED SAKNAS",
};

export const KIND_LABEL: Record<ChangeKind, string> = {
  riktningsbyte: "RIKTNINGSBYTE",
  precisering: "PRECISERING",
  villkorsandring: "VILLKORSÄNDRING",
};

export const SOURCE_STATUS_LABEL: Record<StanceStatement["source_status"], string | null> = {
  ok: null,
  andrad: "KÄLLAN HAR ÄNDRATS — ARKIVKOPIAN GÄLLER",
  borttagen: "KÄLLAN HAR TAGITS BORT — ARKIVKOPIAN GÄLLER",
};

/**
 * Tomcells-copy — BYTE-IDENTISK för alla partier (§2.4, testas i T14).
 * Kommenteras aldrig med quip; tystnad är information, inte poäng.
 */
export function emptyCellText(lastSearched: string | null): string {
  return lastSearched
    ? `Inget tydligt besked funnet i våra källor · senast sökt ${lastSearched}`
    : "Inget tydligt besked funnet i våra källor · bevakning ännu ej startad";
}

/* ─────────────────────────────────────────────────────── uppslagning ── */

export function cellFor(
  stances: StanceCell[],
  subquestionId: string,
  party: string,
): StanceCell | undefined {
  return stances.find((c) => c.subquestion_id === subquestionId && c.party === party);
}

export function statementById(cell: StanceCell, id: string | null): StanceStatement | undefined {
  return id === null ? undefined : cell.statements.find((s) => s.id === id);
}

export function issueForSubquestion(issues: Issue[], subquestionId: string): Issue | undefined {
  return issues.find((i) => i.subquestions.some((sq) => sq.id === subquestionId));
}

/* ─────────────────────────────────────────────────────────── aggregat ── */

export interface IssueCounts {
  /** Antal (parti × delfråga)-celler med minst ett registrerat besked. */
  statedCells: number;
  totalCells: number;
  /** Antal partier med minst ett tydligt besked i frågan. */
  partiesWithStance: number;
  changes: number;
}

export function issueCounts(issue: Issue, stances: StanceCell[]): IssueCounts {
  const sqIds = new Set(issue.subquestions.map((sq) => sq.id));
  const cells = stances.filter((c) => sqIds.has(c.subquestion_id));
  const parties = new Set(cells.filter((c) => c.statements.length > 0).map((c) => c.party));
  return {
    statedCells: cells.filter((c) => c.statements.length > 0).length,
    totalCells: cells.length,
    partiesWithStance: parties.size,
    changes: cells.reduce((n, c) => n + c.changes.length, 0),
  };
}

/** Svängregistret: alla ändringsposter, nyast först (ren datasortering). */
export interface FlatChange {
  date: string;
  kind: ChangeKind;
  party: string;
  issue: Issue;
  subquestion: Subquestion;
  from: StanceStatement;
  to: StanceStatement;
}

export function allChanges(issues: Issue[], stances: StanceCell[]): FlatChange[] {
  const out: FlatChange[] = [];
  for (const cell of stances) {
    const issue = issueForSubquestion(issues, cell.subquestion_id);
    const subquestion = issue?.subquestions.find((sq) => sq.id === cell.subquestion_id);
    if (!issue || !subquestion) continue;
    for (const change of cell.changes) {
      const from = statementById(cell, change.from_statement);
      const to = statementById(cell, change.to_statement);
      if (!from || !to) continue;
      out.push({ date: change.date, kind: change.kind, party: cell.party, issue, subquestion, from, to });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Svarsförst-stycket på frågesidan — ren sammanräkning, inga adjektiv. */
export function issueSummarySentence(issue: Issue, stances: StanceCell[]): string {
  const counts = issueCounts(issue, stances);
  if (counts.statedCells === 0) {
    return `Inga tydliga besked om ${issue.title.toLowerCase()} är ännu registrerade i våra källor — bevakningen pågår och varje besked publiceras med ordagrant citat, källa och arkivkopia.`;
  }
  return `${counts.partiesWithStance} av 8 riksdagspartier har gett minst ett tydligt besked om ${issue.title.toLowerCase()}, fördelat på ${counts.statedCells} besked över ${issue.subquestions.length} delfrågor. Varje besked bygger på ett ordagrant citat med källa och arkivkopia.`;
}
