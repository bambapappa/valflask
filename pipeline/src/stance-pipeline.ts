/**
 * Frågevågen — pipelinepasset (SPEC-FRAGEVAGEN.md §5): A6-extraktion,
 * grindar (G1/G2/G3 ur samma kanon som löftena + G6/G7/G8), A7-verifiering
 * och publicering med mekanisk ändringsdetektering.
 *
 * Hårda publiceringsgrindar (ägarbeslut 2026-07-11 — "inget live innan
 * dubbel- och trippelverifierat"):
 *   1. Passet körs ENDAST när STANCES_ENABLED=true (default av).
 *   2. En delfråga med formulation_status "utkast" kan aldrig autopubliceras
 *      — kandidaten går till stances_review.json (grind UTKAST).
 *   3. Riktningsbyten (ja↔nej) går ALLTID till review, även i auto-läge.
 *   4. PIPELINE_MODE=review skickar allt till review.
 */
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import type { LlmClient, LlmOptions } from "./llm.ts";
import { extractJsonPayload, trimQuoteToWords } from "./extract.ts";
import {
  canonicalDomain,
  countWords,
  normalizeForVerbatim,
  DATE_WINDOW_DAYS,
  QUOTE_MAX_WORDS,
  QUOTE_MIN_WORDS,
  type NormalizedArticle,
} from "./gates.ts";
import {
  classifyChange,
  type IssuesFile,
  type PartyCode,
  type StanceCell,
  type Statement,
  PARTY_CODES,
} from "./stances.ts";

/* ──────────────────────────────────────────────────────────── promptar ── */

function loadPrompt(name: string): string {
  const raw = readFileSync(new URL(`../prompts/${name}`, import.meta.url), "utf8");
  return raw.replace(/^#\s+.*\n/, "").trim();
}

const A6_SYSTEM = loadPrompt("A6-stance-extract.md");
const A7_SYSTEM = loadPrompt("A7-stance-verify.md");

/* ─────────────────────────────────────────────────────────────── typer ── */

export interface StanceCandidate {
  subquestion_id: string;
  party: PartyCode;
  position: "ja" | "nej" | "villkorat";
  condition_note: string | null;
  quote: string;
  person: { name: string; role: string } | null;
}

export interface StanceVerifyResult {
  quote_on_topic: boolean;
  position_follows_from_quote_alone: boolean;
  party_correct: boolean;
  verdict: "publish" | "review" | "reject";
  reason: string;
}

export interface StanceGateFailure {
  gate: "G1" | "G2" | "G3" | "G6" | "G7" | "G8" | "VERIFY" | "RIKTNINGSBYTE" | "UTKAST" | "MODE";
  reason: string;
}

export interface StanceReviewEntry {
  candidate: unknown;
  failures: StanceGateFailure[];
  articleUrl: string;
  articleTitle: string;
  verifyReason?: string;
  archiveUrl?: string | null;
  dateStated?: string;
  extractModel?: string;
  verifyModel?: string;
  runId?: string;
}

/** G8 (§5.2): max ståndpunktskandidater per parti och artikel. */
export const MAX_STANCES_PER_PARTY_PER_ARTICLE = 3;

/* ─────────────────────────────────────────────────── A6: extraktion ── */

/** Delfråge-taxonomin som skickas in i A6 — id + text, aldrig mer. */
export function taxonomyForPrompt(issuesFile: IssuesFile): string {
  const items = issuesFile.issues
    .filter((i) => i.status === "aktiv")
    .flatMap((i) => i.subquestions.map((sq) => ({ id: sq.id, text: sq.text })));
  return JSON.stringify(items);
}

export function normalizeStanceCandidate(c: StanceCandidate): StanceCandidate {
  const out = c as unknown as Record<string, unknown>;
  if (typeof out.party === "string") out.party = out.party.toLowerCase().trim();
  if (typeof out.position === "string") out.position = out.position.toLowerCase().trim();
  if (typeof out.quote === "string") out.quote = trimQuoteToWords(out.quote, QUOTE_MAX_WORDS);
  if (out.condition_note === undefined) out.condition_note = null;
  if (out.person === undefined) out.person = null;
  return c;
}

export async function extractStancesFromArticle(
  article: NormalizedArticle,
  issuesFile: IssuesFile,
  llm: LlmClient,
  model: string,
): Promise<StanceCandidate[]> {
  const userPrompt =
    `<DELFRAGOR>${taxonomyForPrompt(issuesFile)}</DELFRAGOR>\n` +
    `<KALLTEXT url="${article.url}" domain="${article.domain}" published="${article.published}">\n` +
    `${article.text}\n</KALLTEXT>`;

  const opts: LlmOptions = { systemPrompt: A6_SYSTEM, temperature: 0, model };
  const raw = await llm.complete(userPrompt, opts);

  let parsed: { stances?: unknown };
  try {
    parsed = JSON.parse(extractJsonPayload(raw));
  } catch {
    throw new Error(`Stance-extract JSON-parse misslyckades för ${article.url}`);
  }
  const candidates = Array.isArray(parsed.stances) ? (parsed.stances as StanceCandidate[]) : [];
  return candidates.map(normalizeStanceCandidate);
}

/* ─────────────────────────────────────────────────────────── grindar ── */

const stanceSchema = JSON.parse(
  readFileSync(new URL("../schemas/stance-extraction.schema.json", import.meta.url), "utf8"),
) as object;
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateStanceCandidate: ValidateFunction = ajv.compile(stanceSchema);

export interface StanceGateContext {
  allowlist: readonly string[];
  issuesFile: IssuesFile;
  now: Date;
}

export interface StanceGateReport {
  accepted: StanceCandidate[];
  review: Array<{ candidate: unknown; failures: StanceGateFailure[] }>;
}

/**
 * Grindkedjan för ståndpunkter. Samma arkitektur som gates.ts: artikelnivå
 * först (G2, G8), sedan per kandidat (G1 → G3/G6/G7) med samlade fel.
 * Underkänt går ALLTID till review — grindarna fäller aldrig permanent.
 */
export function runStanceGates(
  article: NormalizedArticle,
  candidates: unknown[],
  ctx: StanceGateContext,
): StanceGateReport {
  const review: StanceGateReport["review"] = [];
  const accepted: StanceCandidate[] = [];

  // G2 — källdomän (artikelnivå), samma kanon som löftena.
  const domainResult = canonicalDomain(article.url);
  const domainFailure: StanceGateFailure | null =
    "error" in domainResult
      ? { gate: "G2", reason: domainResult.error }
      : !ctx.allowlist.includes(domainResult.domain)
        ? { gate: "G2", reason: `Domänen ${domainResult.domain} finns inte i allowlist` }
        : domainResult.domain !== article.domain.replace(/^www\./, "")
          ? { gate: "G2", reason: `Fetch-domän (${article.domain}) matchar inte URL-härledd (${domainResult.domain})` }
          : null;
  if (domainFailure) {
    for (const c of candidates) review.push({ candidate: c, failures: [domainFailure] });
    return { accepted, review };
  }

  // G8 — bombskydd per parti (artikelnivå): fler än taket ⇒ HELA artikeln till review.
  const perParty = new Map<string, number>();
  for (const c of candidates) {
    const party = (c as { party?: string }).party ?? "?";
    perParty.set(party, (perParty.get(party) ?? 0) + 1);
  }
  const bombed = [...perParty.entries()].filter(([, n]) => n > MAX_STANCES_PER_PARTY_PER_ARTICLE);
  if (bombed.length > 0) {
    const reason = `Fler än ${MAX_STANCES_PER_PARTY_PER_ARTICLE} ståndpunktskandidater för ${bombed.map(([p, n]) => `${p} (${n})`).join(", ")} i en artikel`;
    for (const c of candidates) review.push({ candidate: c, failures: [{ gate: "G8", reason }] });
    return { accepted, review };
  }

  const normalizedText = normalizeForVerbatim(article.text);
  const knownSubquestions = new Map(
    ctx.issuesFile.issues.flatMap((i) => i.subquestions.map((sq) => [sq.id, i.status] as const)),
  );

  for (const raw of candidates) {
    const failures: StanceGateFailure[] = [];

    // G1 — schema. Utan giltigt schema kan övriga grindar inte läsa fälten säkert.
    if (!validateStanceCandidate(raw)) {
      const detail = (validateStanceCandidate.errors ?? [])
        .map((e) => `${e.instancePath || "/"} ${e.message ?? "ogiltig"}`)
        .join("; ");
      review.push({ candidate: raw, failures: [{ gate: "G1", reason: `Schemafel: ${detail}` }] });
      continue;
    }
    const c = raw as StanceCandidate;

    // G6 — sluten taxonomi: delfrågan måste finnas och vara aktiv.
    const sqStatus = knownSubquestions.get(c.subquestion_id);
    if (!sqStatus) {
      failures.push({ gate: "G6", reason: `Okänd delfråga: ${c.subquestion_id}` });
    } else if (sqStatus !== "aktiv") {
      failures.push({ gate: "G6", reason: `Delfrågan ${c.subquestion_id} är ${sqStatus}` });
    }
    if (!PARTY_CODES.includes(c.party)) {
      failures.push({ gate: "G6", reason: `Okänd partikod: ${c.party}` });
    }
    if (c.position === "villkorat" && !c.condition_note) {
      failures.push({ gate: "G6", reason: "villkorat kräver condition_note (RS4)" });
    }

    // G3 — verbatimgrinden, exakt samma kanon som löftena.
    const normalizedQuote = normalizeForVerbatim(c.quote);
    const wordCount = countWords(normalizedQuote);
    if (wordCount < QUOTE_MIN_WORDS) {
      failures.push({ gate: "G3", reason: `Citatet är ${wordCount} ord — golvet är ${QUOTE_MIN_WORDS}` });
    } else if (wordCount > QUOTE_MAX_WORDS) {
      failures.push({ gate: "G3", reason: `Citatet är ${wordCount} ord — taket är ${QUOTE_MAX_WORDS}` });
    } else if (!normalizedText.includes(normalizedQuote)) {
      failures.push({ gate: "G3", reason: "Citatet återfinns inte ordagrant i källtexten" });
    }

    // G7 — datumfönster mot artikelns publiceringsdatum (samma fönster som G4).
    const published = Date.parse(article.published);
    if (!Number.isFinite(published)) {
      failures.push({ gate: "G7", reason: `Ogiltigt publiceringsdatum: ${article.published}` });
    } else {
      const diffDays = Math.abs(ctx.now.getTime() - published) / 86_400_000;
      if (diffDays > DATE_WINDOW_DAYS) {
        failures.push({
          gate: "G7",
          reason: `Publiceringsdatum ${article.published} ligger ${Math.round(diffDays)} dygn från körningen — fönstret är ±${DATE_WINDOW_DAYS} dygn`,
        });
      }
    }

    if (failures.length > 0) review.push({ candidate: c, failures });
    else accepted.push(c);
  }

  return { accepted, review };
}

/* ─────────────────────────────────────────────────── A7: verifiering ── */

export async function verifyStance(
  candidate: StanceCandidate,
  subquestionText: string,
  article: NormalizedArticle,
  llm: LlmClient,
  model: string,
): Promise<StanceVerifyResult> {
  const userPrompt =
    `<DELFRAGA id="${candidate.subquestion_id}">${subquestionText}</DELFRAGA>\n` +
    `<KANDIDAT>\n${JSON.stringify(candidate)}\n</KANDIDAT>\n` +
    `<KALLTEXT url="${article.url}" domain="${article.domain}" published="${article.published}">\n${article.text}\n</KALLTEXT>`;

  const raw = await llm.complete(userPrompt, { systemPrompt: A7_SYSTEM, temperature: 0, model });
  try {
    return JSON.parse(extractJsonPayload(raw)) as StanceVerifyResult;
  } catch {
    return {
      quote_on_topic: false,
      position_follows_from_quote_alone: false,
      party_correct: false,
      verdict: "reject",
      reason: "Verifieringsanalys misslyckades (ogiltig JSON).",
    };
  }
}

/* ───────────────────────────────────────── publicering + ändringar ── */

export interface ProcessedStance {
  candidate: StanceCandidate;
  article: NormalizedArticle;
  verify: StanceVerifyResult;
  archiveUrl: string | null;
  extractModel: string;
  verifyModel: string;
}

export interface StancePublishInput {
  processed: ProcessedStance[];
  gateReview: Array<{ candidate: unknown; failures: StanceGateFailure[]; article: NormalizedArticle }>;
  issuesFile: IssuesFile;
  cells: StanceCell[];
  existingReview: StanceReviewEntry[];
  runId: string;
  now: Date;
  mode: "auto" | "review";
  /**
   * Sätts ENDAST av review-CLI:t: människan HAR granskat, så beslutsgrindarna
   * VERIFY/RIKTNINGSBYTE/MODE hoppas över. Hårda grindar (G1–G8 via gateReview,
   * UTKAST, dublettskydd) gäller fortfarande — mänskligt godkännande kan aldrig
   * kringgå verbatimkedjan eller en olåst delfråga.
   */
  humanApproved?: boolean | undefined;
}

export interface StancePublishResult {
  cells: StanceCell[];
  review: StanceReviewEntry[];
  /** Statement-id:n publicerade denna körning. */
  stancesAdded: string[];
  /** Celler (subquestion_id × party) vars position ändrades denna körning. */
  stancesChanged: string[];
}

function nextStatementId(cells: StanceCell[], year: number): () => string {
  let max = 0;
  for (const cell of cells) {
    for (const st of cell.statements) {
      const m = st.id.match(/^st-\d{4}-(\d{4})$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return () => `st-${year}-${String(++max).padStart(4, "0")}`;
}

/** Kö-dedup: samma kandidat (delfråga+parti+citat) läggs aldrig två gånger. */
function reviewKey(e: { candidate: unknown; articleUrl: string }): string {
  const c = e.candidate as Partial<StanceCandidate> | null | undefined;
  return `${e.articleUrl}::${c?.subquestion_id ?? ""}::${c?.party ?? ""}::${c?.quote ?? ""}`;
}

/**
 * Publicerar verifierade ståndpunkter i cellerna med mekanisk
 * ändringsdetektering (RS5), och ruttar allt osäkert till review.
 * Ren funktion — muterar inte indata; skrivning sker i anroparen.
 */
export function publishStances(input: StancePublishInput): StancePublishResult {
  const today = input.now.toISOString().slice(0, 10);
  const cells: StanceCell[] = input.cells.map((c) => ({
    ...c,
    statements: [...c.statements],
    changes: [...c.changes],
    last_searched: today,
  }));
  const cellByKey = new Map(cells.map((c) => [`${c.subquestion_id} ${c.party}`, c]));
  const subquestionById = new Map(
    input.issuesFile.issues.flatMap((i) => i.subquestions.map((sq) => [sq.id, sq] as const)),
  );

  const review: StanceReviewEntry[] = [...input.existingReview];
  const seenReview = new Set(review.map(reviewKey));
  const pushReview = (entry: StanceReviewEntry) => {
    if (seenReview.has(reviewKey({ candidate: entry.candidate, articleUrl: entry.articleUrl }))) return;
    seenReview.add(reviewKey({ candidate: entry.candidate, articleUrl: entry.articleUrl }));
    review.push(entry);
  };

  for (const g of input.gateReview) {
    pushReview({
      candidate: g.candidate,
      failures: g.failures,
      articleUrl: g.article.url,
      articleTitle: g.article.title,
      runId: input.runId,
    });
  }

  const nextId = nextStatementId(cells, input.now.getFullYear());
  const stancesAdded: string[] = [];
  const stancesChanged: string[] = [];

  for (const p of input.processed) {
    const { candidate, article, verify } = p;
    const base = {
      candidate,
      articleUrl: article.url,
      articleTitle: article.title,
      archiveUrl: p.archiveUrl,
      dateStated: article.published.slice(0, 10),
      extractModel: p.extractModel,
      verifyModel: p.verifyModel,
      runId: input.runId,
    };

    // VERIFY — LLM B måste bekräfta att beskedet följer ur citatet ensamt.
    if (
      !input.humanApproved &&
      (verify.verdict !== "publish" ||
      !verify.quote_on_topic ||
      !verify.position_follows_from_quote_alone ||
      !verify.party_correct)
    ) {
      pushReview({ ...base, failures: [{ gate: "VERIFY", reason: verify.reason }], verifyReason: verify.reason });
      continue;
    }

    const cell = cellByKey.get(`${candidate.subquestion_id} ${candidate.party}`);
    if (!cell) {
      pushReview({ ...base, failures: [{ gate: "G6", reason: "Cell saknas (kör pnpm stances:skeleton)" }] });
      continue;
    }

    // Dublettskydd: exakt samma citat i cellen är redan registrerat.
    const normalizedQuote = normalizeForVerbatim(candidate.quote);
    if (cell.statements.some((st) => normalizeForVerbatim(st.quote) === normalizedQuote)) {
      continue;
    }

    // UTKAST — hård grind (ägarbeslut 2026-07-11): en delfråga vars formulering
    // inte är verifierad och låst kan aldrig autopubliceras.
    const sq = subquestionById.get(candidate.subquestion_id);
    if (!sq || sq.formulation_status !== "verifierad") {
      pushReview({
        ...base,
        failures: [{ gate: "UTKAST", reason: `Delfrågan ${candidate.subquestion_id} är inte verifierad (formulation_status: ${sq?.formulation_status ?? "saknas"})` }],
      });
      continue;
    }

    // RIKTNINGSBYTE — ja↔nej publiceras ALDRIG utan mänsklig granskning.
    const last = cell.statements.at(-1);
    const kind = last && last.position !== candidate.position
      ? classifyChange(last.position, candidate.position)
      : null;
    if (kind === "riktningsbyte" && !input.humanApproved) {
      pushReview({
        ...base,
        failures: [{ gate: "RIKTNINGSBYTE", reason: `${last!.position} → ${candidate.position}: riktningsbyten kräver alltid mänsklig granskning (§5.5)` }],
      });
      continue;
    }

    // MODE — review-läget skickar allt till kön.
    if (input.mode === "review" && !input.humanApproved) {
      pushReview({ ...base, failures: [{ gate: "MODE", reason: "PIPELINE_MODE=review: allt till granskning" }] });
      continue;
    }

    const statement: Statement = {
      id: nextId(),
      position: candidate.position,
      condition_note: candidate.position === "villkorat" ? candidate.condition_note : null,
      quote: candidate.quote,
      person: candidate.person,
      date_stated: article.published.slice(0, 10),
      source: {
        url: article.url,
        domain: article.domain,
        archive_url: p.archiveUrl,
        fetched_at: input.now.toISOString(),
      },
      source_status: "ok",
      source_checked_at: null,
      related_promise_ids: [],
      extraction: { model: p.extractModel, verified_by: p.verifyModel, run_id: input.runId },
    };

    cell.statements.push(statement);
    if (last && kind) {
      cell.changes.push({
        date: today,
        from_statement: last.id,
        to_statement: statement.id,
        kind,
        commit: null,
      });
      stancesChanged.push(`${cell.subquestion_id} × ${cell.party}`);
    }
    cell.current = { position: statement.position, statement_id: statement.id };
    stancesAdded.push(statement.id);
  }

  return { cells, review, stancesAdded, stancesChanged };
}
