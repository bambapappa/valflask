/**
 * import-vallen.ts — engångs-seed (med upsert-stöd) från det privata
 * granskningsarkivet `vallen-2026` (DATABAS-FINAL.json + källsnapshots).
 *
 * BÄRANDE PRINCIP: kringgå ALDRIG säkerhetslagren. Varje vallen-post mappas till
 * en `ExtractionCandidate` och körs genom EXAKT samma grindkedja (`runGates`) som
 * det skarpa RSS-flödet — G3-verbatim verifieras mot den sparade källsnapshotten,
 * inte mot vallen-postens egen text. Bara poster som passerar alla grindar blir
 * publicerbara; resten går till `needs_review.json` med skäl.
 *
 * Det privata repot är BEVISVALVET (full HTML/transkript). Det publika valflask
 * får bara ≤40-ords-citat + metadata (upphovsrätt §6.2) — ingen fulltext
 * committas härifrån.
 *
 * Fas 1 (denna modul): allowlist-domäner med källsnapshot. YouTube-/transkript-
 * källor (kalla_typ ∉ webb, ej i allowlist) faller på G2 → review, och plockas
 * upp i Fas 2 via en `transkript`-källtyp. Inget tappas — allt hamnar i review.
 *
 * Kostnadsmetod (DECISION_LOG 2026-06-29): LLM/parti-estimat AUTO-PUBLICERAS med
 * intervall [low,base,high] i stället för att gå till review. Bandbredden styrs
 * av `kostnad_typ` + `kostnad_osakerhet`; osäkerheten bärs till totalen via en
 * varianspropagerande summa på sajten (se aggregates.totalFlasketInterval).
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  runGates,
  normalizeForVerbatim,
  canonicalDomain,
  countWords,
  passesAmountCapR5,
  QUOTE_MIN_WORDS,
  QUOTE_MAX_WORDS,
  DATE_WINDOW_DAYS,
  type ExtractionCandidate,
  type NormalizedArticle,
  type GateFailure,
} from "./gates.ts";
import type { CostEstimate } from "./cost.ts";
import type { VerifyResult } from "./verify.ts";
import type { NeedsReviewEntry, PipelinePromise } from "./publish.ts";
import { findPossibleDuplicate, type ExistingPromiseLite } from "./similarity.ts";

/* ─────────────────────────────────────────────────── Vallen-2026 datamodell ── */

export interface VallenRecord {
  parti: string;
  politiker?: string;
  lovtext: string;
  kategori: string;
  kalla: string;
  datum: string;
  plats?: string;
  anteckningar?: string;
  kostnad_typ?: string; // "princip" | "estimerat" | "exakt"
  kostnad_kr_ar?: number;
  kostnad_utrakning?: string;
  kostnad_osakerhet?: string;
  riktning?: string; // "utgift" | "intakt" | "neutral" | "princip"
  fas?: number;
  kalla_typ?: string;
  niva?: string;
}

/** {kategori: {enum, …}} — pipeline/import/category-map.json (ägar-granskad). */
export type CategoryMap = Record<string, { enum: string }>;

/* ─────────────────────────────────────────────────────────── Partikoder ── */

const VALID_CODES = ["s", "m", "sd", "c", "v", "kd", "l", "mp"] as const;
const VALID_CODE_SET = new Set<string>(VALID_CODES);

/** "Socialdemokraterna (S)" → "s". Plockar koden ur parentesen, validerar. */
export function partyCodeFromName(name: string): string | null {
  const m = name.match(/\(([^)]+)\)\s*$/);
  const code = (m?.[1] ?? name).trim().toLowerCase();
  return VALID_CODE_SET.has(code) ? code : null;
}

/* ───────────────────────────────────────────────────────── Person-parsning ── */

const PARTY_FULLNAME =
  /^(socialdemokraterna|moderaterna|sverigedemokraterna|centerpartiet|vänsterpartiet|kristdemokraterna|liberalerna|miljöpartiet)/i;

/**
 * Tolkar `politiker`-fältet. Är det partinamnet (eller tomt) → null (partilöfte).
 * Är det en namngiven företrädare → {name, role}. Tar FÖRSTA personen vid
 * "X / Y" och plockar roll ur parentes ("(statsminister)") annars `fallbackRole`.
 */
export function parsePerson(
  politiker: string | undefined,
  niva: string | undefined,
): { name: string; role: string } | null {
  const raw = (politiker ?? "").trim();
  if (raw === "") return null;
  if (PARTY_FULLNAME.test(raw)) return null; // "Socialdemokraterna (S)"
  if (/^\([smsdcvkdlmp ]+\)$/i.test(raw)) return null;

  const firstSeg = raw.split("/")[0]!.trim(); // "Ulf Kristersson (statsminister)"
  const roleMatch = firstSeg.match(/\(([^)]+)\)/);
  // En parentes som börjar med "och" är en MED-företrädare ("(och Martin Ådahl)"),
  // inte en roll — ignorera den och använd nivå-defaulten.
  const parenRole = roleMatch && !/^och\b/i.test(roleMatch[1]!.trim()) ? roleMatch[1]!.trim() : null;
  const role = parenRole ?? (niva === "partiledare" ? "partiledare" : "företrädare");
  const name = firstSeg.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();

  // Konservativt: kräver ett rimligt personnamn (minst två ord, 2–80 tecken).
  if (name.length < 2 || name.length > 80 || !name.includes(" ")) return null;
  const safeRole = role.length >= 2 && role.length <= 80 ? role : "företrädare";
  return { name, role: safeRole };
}

/* ──────────────────────────────────────────────────────────── Titel/slug ── */

const TITLE_MAX = 140;

/**
 * vallen-poster saknar titel (bara `lovtext`). Härleds deterministiskt: första
 * meningen ur citatet, kapad vid ordgräns till ≤140 tecken, utan avslutande
 * skiljetecken. (En valfri LLM-copy-pass kan polera titlar + quips senare.)
 */
export function deriveTitle(lovtext: string): string {
  const clean = lovtext.replace(/\s+/g, " ").trim();
  const firstSentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
  let t = firstSentence.length <= TITLE_MAX ? firstSentence : clean;
  if (t.length > TITLE_MAX) {
    const cut = t.slice(0, TITLE_MAX);
    const lastSpace = cut.lastIndexOf(" ");
    t = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim();
  }
  t = t.replace(/[.,;:!?\s]+$/u, "").trim();
  if (t.length < 5) t = clean.slice(0, TITLE_MAX).trim(); // sista utväg
  return t.slice(0, 160);
}

/* ─────────────────────────────────────────────────────────── Kategori ── */

const VALID_CATEGORIES = new Set([
  "välfärd", "skatter", "försvar", "klimat-miljö",
  "rättsväsende", "utbildning", "infrastruktur", "migration", "övrigt",
]);

export function mapCategory(raw: string, map: CategoryMap): string {
  const enum_ = map[raw]?.enum;
  return enum_ && VALID_CATEGORIES.has(enum_) ? enum_ : "övrigt";
}

/* ───────────────────────────────────────────────────────────── Kostnad ── */

/** Bandbredd (±andel runt base) ur kostnad_typ + osäkerhet. */
function spreadFor(rec: VallenRecord): { s: number; basis: CostEstimate["basis"]; confidence: number } {
  const typ = (rec.kostnad_typ ?? "").toLowerCase();
  const osak = (rec.kostnad_osakerhet ?? "").toLowerCase();
  if (typ === "exakt") return { s: 0.15, basis: "parti", confidence: 0.85 };
  if (typ === "princip") return { s: 0, basis: "parti", confidence: 0.2 };
  // estimerat (default)
  if (osak.startsWith("låg")) return { s: 0.3, basis: "llm_estimat", confidence: 0.55 };
  if (osak.startsWith("hög")) return { s: 0.8, basis: "llm_estimat", confidence: 0.3 };
  return { s: 0.5, basis: "llm_estimat", confidence: 0.4 }; // medel/okänt
}

/**
 * Deterministisk kostnad ur vallen-fälten (ingen LLM). `kostnad_kr_ar` (kr/år) →
 * msek; spann ur osäkerhet; R2 (high ≥ 1,5×low) vid llm_estimat; method_note =
 * vallens egen uträkning (det material du betonade). neutral/princip → 0 kr
 * (inriktningslöfte, bidrar 0 till Fläsket men publiceras).
 */
export function costFromVallen(rec: VallenRecord): CostEstimate {
  const riktning = (rec.riktning ?? "").toLowerCase();
  const type: CostEstimate["type"] = riktning === "intakt" ? "intäktsminskning" : "utgift";
  const isQuantifiedDirection = riktning === "utgift" || riktning === "intakt";
  const krAr = typeof rec.kostnad_kr_ar === "number" && Number.isFinite(rec.kostnad_kr_ar) ? rec.kostnad_kr_ar : 0;
  const { s, basis, confidence } = spreadFor(rec);

  const note = (rec.kostnad_utrakning && rec.kostnad_utrakning.trim().length > 0)
    ? rec.kostnad_utrakning.trim().slice(0, 200)
    : "Inriktningslöfte utan kvantifierbar kostnad.";

  if (!isQuantifiedDirection || krAr <= 0) {
    return {
      type, period: "per_ar",
      msek_low: 0, msek_base: 0, msek_high: 0,
      basis, basis_url: null,
      method_note: note, confidence: Math.min(confidence, 0.3),
    };
  }

  const base = krAr / 1e6; // kr/år → msek/år
  let low = base * (1 - s);
  let high = base * (1 + s);
  if (basis === "llm_estimat") high = Math.max(high, low * 1.5); // R2
  return {
    type, period: "per_ar",
    msek_low: Math.round(low),
    msek_base: Math.round(base),
    msek_high: Math.round(high),
    basis, basis_url: null,
    method_note: note, confidence,
  };
}

/* ──────────────────────────────────────────── Vallen-post → kandidat+artikel ── */

export interface CandidateBuild {
  candidate: ExtractionCandidate;
  article: NormalizedArticle;
  cost: CostEstimate;
}

/**
 * Bygger en `ExtractionCandidate` + en `NormalizedArticle` vars `text` är den
 * sparade källsnapshotten (så G3-verbatim verifieras mot riktig hämtad text).
 * Returnerar null endast om partikoden inte kan tolkas (då kan kandidaten inte
 * ens schemavalideras meningsfullt).
 */
export function vallenToCandidate(
  rec: VallenRecord,
  map: CategoryMap,
  snapshotText: string,
): CandidateBuild | null {
  const code = partyCodeFromName(rec.parti);
  if (!code) return null;

  const candidate: ExtractionCandidate = {
    title: deriveTitle(rec.lovtext),
    parties: [code],
    person: parsePerson(rec.politiker, rec.niva),
    quote: rec.lovtext,
    category: mapCategory(rec.kategori, map),
    amount_in_text_msek:
      rec.kostnad_typ === "exakt" && typeof rec.kostnad_kr_ar === "number" && rec.kostnad_kr_ar > 0
        ? rec.kostnad_kr_ar / 1e6
        : null,
    financing_mentioned: false,
  };

  const dom = canonicalDomain(rec.kalla);
  const domain = "domain" in dom ? dom.domain : "";
  const article: NormalizedArticle = {
    url: rec.kalla,
    domain,
    title: rec.plats || rec.anteckningar || candidate.title,
    text: snapshotText,
    published: /^\d{4}-\d{2}-\d{2}/.test(rec.datum) ? rec.datum : "",
  };

  return { candidate, article, cost: costFromVallen(rec) };
}

/* ───────────────────────────────────────────────────── Snapshot-index ── */

const baseDomain = (d: string): string => d.split(".").slice(-2).join(".");

/**
 * Läser snapshots/MANIFEST.json + *.txt och bygger basdomän → sammanslagen
 * normaliserad text. G3 verifierar citatet mot detta. Returnerar tom Map om
 * snapshots saknas (då faller alla på G3 → review, vilket är säkert).
 */
export function buildSnapshotIndex(vallenDir: string): Map<string, string> {
  const snapDir = join(vallenDir, "snapshots");
  const index = new Map<string, string[]>();
  if (!existsSync(snapDir)) return new Map();

  let manifest: { url?: string; final_url?: string; text_file?: string }[] = [];
  try {
    const raw = JSON.parse(readFileSync(join(snapDir, "MANIFEST.json"), "utf8")) as unknown;
    manifest = (Array.isArray(raw) ? raw : Object.values(raw as object).find(Array.isArray)) as typeof manifest ?? [];
  } catch {
    manifest = [];
  }

  for (const s of manifest) {
    if (!s?.text_file) continue;
    const p = join(snapDir, s.text_file);
    if (!existsSync(p)) continue;
    let host: string;
    try {
      host = new URL(s.final_url || s.url || "").hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    const d = baseDomain(host);
    const arr = index.get(d) ?? [];
    arr.push(normalizeForVerbatim(readFileSync(p, "utf8")));
    index.set(d, arr);
  }

  const merged = new Map<string, string>();
  for (const [d, texts] of index) merged.set(d, texts.join("\n"));
  return merged;
}

/* ──────────────────────────────────────────────────── Transkript-källtyp ── */

/** YouTube-video-id ur en URL (watch?v=, youtu.be/), annars null. */
export function youtubeVideoId(rawUrl: string): string | null {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return u.pathname.slice(1) || null;
  if (host === "youtube.com" || host === "m.youtube.com") {
    return u.searchParams.get("v");
  }
  return null;
}

/**
 * Uppmjukad normalisering ENBART för transkript-verbatim: ASR-undertexter har
 * opålitligt skiftläge och interpunktion, så vi jämför skiftläges- och
 * skiljeteckens-okänsligt. Försvagar anti-hallucinationsgarantin för just denna
 * källklass (DECISION_LOG 2026-06-29) — webbkällor behåller strikt G3.
 */
export function looseNormalize(input: string): string {
  return input.toLowerCase().normalize("NFC").replace(/[^a-z0-9åäöéèü ]/gi, " ").replace(/\s+/g, " ").trim();
}

/**
 * Läser vallen-2026/transcripts/*.txt → video-id → rå text (bevisvalvet).
 */
export function buildTranscriptIndex(vallenDir: string): Map<string, string> {
  const dir = join(vallenDir, "transcripts");
  const map = new Map<string, string>();
  if (!existsSync(dir)) return map;
  for (const f of readdirSync(dir)) {
    const m = f.match(/^(.+)\.txt$/);
    if (!m) continue;
    map.set(m[1]!, readFileSync(join(dir, f), "utf8"));
  }
  return map;
}

/**
 * Grind för transkript-källade kandidater. Hoppar över G2 (allowlist) — youtube
 * är en medvetet tillåten transkript-källa — men behåller citatlängd (G3), R5 +
 * datumfönster (G4) och kräver uppmjukad verbatim-träff mot det sparade
 * transkriptet (kan inte fabricera ett citat som inte sägs i talet).
 */
export function gateTranscript(
  candidate: ExtractionCandidate,
  transcriptText: string,
  now: Date,
  published: string,
): GateFailure[] {
  const failures: GateFailure[] = [];
  const words = countWords(normalizeForVerbatim(candidate.quote));
  if (words < QUOTE_MIN_WORDS) failures.push({ gate: "G3", reason: `Citatet har ${words} ord — minst ${QUOTE_MIN_WORDS} krävs` });
  if (words > QUOTE_MAX_WORDS) failures.push({ gate: "G3", reason: `Citatet har ${words} ord — max ${QUOTE_MAX_WORDS} tillåts (§5.1)` });

  if (transcriptText === "") {
    failures.push({ gate: "G3", reason: "Inget sparat transkript för videon — kan ej verifiera (transkript-källa)" });
  } else if (!looseNormalize(transcriptText).includes(looseNormalize(candidate.quote))) {
    failures.push({ gate: "G3", reason: "Citatet återfinns inte i det sparade transkriptet (uppmjukad jämförelse)" });
  }

  if (!passesAmountCapR5(candidate.amount_in_text_msek)) {
    failures.push({ gate: "G4", reason: `Beloppsspärr R5 överskriden: ${candidate.amount_in_text_msek} msek` });
  }
  const pub = Date.parse(published);
  if (Number.isNaN(pub)) {
    failures.push({ gate: "G4", reason: `Ogiltigt publiceringsdatum: "${published}"` });
  } else if (Math.abs(now.getTime() - pub) / 86_400_000 > DATE_WINDOW_DAYS) {
    failures.push({ gate: "G4", reason: `Publiceringsdatum utanför ±${DATE_WINDOW_DAYS} dygn` });
  }
  return failures;
}

/* ─────────────────────────────────────────────────────────── Import-körning ── */

/** Form som publish() konsumerar (processedCandidates-element). */
export interface ProcessedImport {
  candidate: ExtractionCandidate;
  article: NormalizedArticle;
  verifyResult: VerifyResult;
  cost: CostEstimate;
  quip: string;
  archiveUrl: string | null;
  extractModel: string;
  verifyModel: string;
  groupId: string | null;
}

export interface ImportStats {
  total: number;
  unparseableParty: number;
  publishable: number;
  toReview: number;
  groupsLinked: number;
  byGateFailure: Record<string, number>;
}

export interface ImportResult {
  processedCandidates: ProcessedImport[];
  reviewItems: NeedsReviewEntry[];
  stats: ImportStats;
}

const IMPORT_MODEL = "import:vallen-2026";

function groupSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[åä]/g, "a").replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 48).replace(/-$/g, "");
  return `g-${base || "lofte"}`;
}

/**
 * Kör hela importen. Per post: bygg kandidat → runGates (G3 mot snapshot) →
 * publicerbar eller review. Därefter dedup:
 *  - exakt samma normaliserade citat över FLERA partier → delad group_id (R3,
 *    säkert eftersom texten är identisk).
 *  - exakt samma citat inom SAMMA parti → behåll en, övriga till review (dubbel).
 *  - luddig träff mot redan publicerade (findPossibleDuplicate) → review med
 *    duplicateOf (människan länkar). Vid seed (existing=[]) inträffar detta ej.
 */
export function importVallen(opts: {
  records: VallenRecord[];
  categoryMap: CategoryMap;
  snapshotIndex: Map<string, string>;
  /** video-id → sparat transkript (vallen-2026/transcripts). Tom = transkriptkällor faller på G3. */
  transcriptIndex?: Map<string, string>;
  existingPromises: PipelinePromise[];
  allowlist: readonly string[];
  now: Date;
}): ImportResult {
  const { records, categoryMap, snapshotIndex, existingPromises, allowlist, now } = opts;
  const transcriptIndex = opts.transcriptIndex ?? new Map<string, string>();
  const processed: ProcessedImport[] = [];
  const review: NeedsReviewEntry[] = [];
  const stats: ImportStats = {
    total: records.length, unparseableParty: 0, publishable: 0,
    toReview: 0, groupsLinked: 0, byGateFailure: {},
  };

  const existingLite: ExistingPromiseLite[] = existingPromises.map((p) => ({
    id: p.id, title: p.title, parties: p.parties, category: p.category, group_id: p.group_id,
  }));

  // accepterade kandidater (för dedup inom batchen), med normaliserat citat.
  const accepted: { build: CandidateBuild; normQuote: string; idx: number; isTranscript: boolean }[] = [];

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    const dom = canonicalDomain(rec.kalla);
    const domain = "domain" in dom ? dom.domain : "";
    const videoId = youtubeVideoId(rec.kalla);
    const isTranscript = videoId !== null;
    const sourceText = isTranscript
      ? (transcriptIndex.get(videoId) ?? "")
      : (snapshotIndex.get(baseDomain(domain)) ?? "");

    const build = vallenToCandidate(rec, categoryMap, sourceText);
    if (!build) {
      stats.unparseableParty++;
      review.push({
        candidate: { parti: rec.parti, lovtext: rec.lovtext },
        failures: [{ gate: "G1", reason: `Ogiltig/otolkbar partikod: "${rec.parti}"` }],
        articleUrl: rec.kalla, articleTitle: rec.plats ?? "",
      });
      continue;
    }

    // Transkript-källor (youtube) går förbi G2-allowlist men kräver uppmjukad
    // verbatim-träff mot sparat transkript; webbkällor kör strikt grindkedja.
    const failures = isTranscript
      ? gateTranscript(build.candidate, sourceText, now, build.article.published)
      : (() => {
          const report = runGates(build.article, [build.candidate], { allowlist, now });
          return report.accepted.length > 0 ? [] : (report.review[0]?.failures ?? [{ gate: "G3" as const, reason: "okänt grindfel" }]);
        })();

    if (failures.length > 0) {
      for (const f of failures) stats.byGateFailure[f.gate] = (stats.byGateFailure[f.gate] ?? 0) + 1;
      review.push({
        candidate: build.candidate,
        failures,
        articleUrl: rec.kalla,
        articleTitle: build.article.title,
        cost: build.cost,
      });
      continue;
    }

    accepted.push({ build, normQuote: normalizeForVerbatim(build.candidate.quote), idx: i, isTranscript });
  }

  // ── dedup på exakt normaliserat citat ──
  const byQuote = new Map<string, typeof accepted>();
  for (const a of accepted) {
    const arr = byQuote.get(a.normQuote) ?? [];
    arr.push(a);
    byQuote.set(a.normQuote, arr);
  }

  for (const cluster of byQuote.values()) {
    const partiesInCluster = new Set(cluster.flatMap((c) => c.build.candidate.parties));
    const crossParty = partiesInCluster.size > 1;
    const gid = crossParty ? groupSlug(cluster[0]!.build.candidate.title) : null;
    if (crossParty) stats.groupsLinked++;

    const seenParty = new Set<string>();
    for (const a of cluster) {
      const party = a.build.candidate.parties[0]!;
      // exakt dubbel inom samma parti → en publiceras, övriga till review.
      if (!crossParty && seenParty.has(party)) {
        review.push({
          candidate: a.build.candidate,
          failures: [{ gate: "G1", reason: "Exakt dubblett av redan importerat löfte (samma parti, samma citat)" }],
          articleUrl: a.build.article.url, articleTitle: a.build.article.title,
          cost: a.build.cost,
        });
        continue;
      }
      seenParty.add(party);

      // luddig dubbel mot redan PUBLICERADE (inkrementell körning).
      const dup = findPossibleDuplicate(
        { title: a.build.candidate.title, parties: a.build.candidate.parties, category: a.build.candidate.category },
        existingLite,
      );
      if (dup) {
        review.push({
          candidate: a.build.candidate,
          failures: [],
          articleUrl: a.build.article.url, articleTitle: a.build.article.title,
          cost: a.build.cost,
          duplicateOf: dup.id,
        });
        continue;
      }

      const srcLabel = a.isTranscript
        ? "transkript (uppmjukad verbatim mot sparat ASR-transkript)"
        : "källsnapshot (G3)";
      processed.push({
        candidate: a.build.candidate,
        article: a.build.article,
        verifyResult: {
          is_promise: true, party_correct: true,
          amount_in_text: a.build.candidate.amount_in_text_msek !== null,
          verdict: "publish",
          reason: `Importerad från vallen-2026; citat verifierat mot ${srcLabel}.`,
        },
        cost: a.build.cost,
        quip: "",
        archiveUrl: null, // Wayback-arkivering sker i nästa skarpa körning (null → retry).
        extractModel: IMPORT_MODEL,
        verifyModel: `${IMPORT_MODEL} (${a.isTranscript ? "transkript" : "G3 mot snapshot"})`,
        groupId: gid,
      });
    }
  }

  stats.publishable = processed.length;
  stats.toReview = review.length;
  return { processedCandidates: processed, reviewItems: review, stats };
}

/* ────────────────────────────────────────────────────────────── Filläsning ── */

export function loadVallenRecords(vallenDir: string): VallenRecord[] {
  const raw = JSON.parse(readFileSync(join(vallenDir, "DATABAS-FINAL.json"), "utf8")) as {
    valloften?: VallenRecord[];
  };
  return raw.valloften ?? [];
}

export function loadCategoryMap(repoRoot: string): CategoryMap {
  return JSON.parse(
    readFileSync(join(repoRoot, "pipeline/import/category-map.json"), "utf8"),
  ) as CategoryMap;
}
