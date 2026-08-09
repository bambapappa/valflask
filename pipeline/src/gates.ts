/**
 * gates.ts — G1–G5 (§7 steg 3): det viktigaste säkerhetslagret.
 *
 * REN KOD, INGEN LLM. Modulen är deterministisk: klocka (`now`) och allowlist
 * injiceras av anroparen — inga miljöberoenden, ingen I/O efter modulinit.
 * Detta gör T4 (snapshot), T5 (fabricerat citat) och T6 (injektionssviten)
 * triviala att hålla gröna.
 *
 * Designbeslut loggade i DECISION_LOG.md 2026-06-12. Sammanfattning:
 *  - G2: https-krav, defaultport, exakt domänmatch efter strip av ETT ledande
 *    "www."; IDN-homografer faller automatiskt (punycode matchar ej allowlist).
 *  - G3: verbatim = NFC + borttagna osynliga/bidi-tecken + unifierade
 *    citattecken/streck/ellipsis + whitespace-kollaps. SKIFTLÄGESKÄNSLIG.
 *    Citatgolv 5 ord (utöver specens tak 40).
 *  - G4: datumfönster ±548 dagar (≈18 mån) mot artikelns published;
 *    beloppsspärr R5 på amount_in_text_msek. R5 ska dessutom återtillämpas på
 *    cost-stegets msek_base i publish — använd `passesAmountCapR5`.
 *  - Underkänd kandidat går ALLTID till review (publiceras ej, §7) — grindarna
 *    avgör aldrig "avslag för alltid"; det gör människan eller verify-steget.
 */

import { readFileSync } from "node:fs";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";

/* ────────────────────────── Typer (delas med extract/verify/publish) ── */

/** Normaliserad artikel från fetch-steget (§7 steg 1). */
export interface NormalizedArticle {
  url: string;
  /** Domän som fetch-steget härledde — korsvalideras mot url i G2. */
  domain: string;
  title: string;
  /** Fulltext i runner-minne. Committas aldrig (§6.2). */
  text: string;
  /** Källans publiceringstidpunkt, ISO 8601. */
  published: string;
  /**
   * SHA-256 av texten — sätts av page-källan (B). Går in i seen-nyckeln så att
   * en OMSKRIVEN manifestsida/PDF processas om (löpande bevakning), medan
   * oförändrat innehåll förblir sett. RSS/API-artiklar (stabil URL = stabil
   * artikel) utelämnar fältet och dedupas som förut på enbart URL.
   */
  contentHash?: string;
  /** Feed-typ ur sources.yaml — styr processprioritet i runPipeline. */
  feedType?: "rss" | "riksdagen_api" | "page" | "index";
  /**
   * PDF-chunkar: texten sida för sida, så att ett verbatimgranskat citat kan
   * slås upp till sin EXAKTA sida vid publicering (resolveQuotePage). Utan
   * detta pekar käll-länken bara på chunkens första sida (#page=1/11/21…).
   */
  pdfPages?: { firstPage: number; texts: string[] };
}

/** En kandidat ur LLM A:s svar (prompt A1). Speglar extraction.schema.json. */
export interface ExtractionCandidate {
  title: string;
  parties: string[];
  person: { name: string; role: string; riksdagen_id?: string | null } | null;
  quote: string;
  category: string;
  amount_in_text_msek: number | null;
  financing_mentioned: boolean;
}

export type GateId = "G1" | "G2" | "G3" | "G4" | "G5";

export interface GateFailure {
  gate: GateId;
  reason: string;
}

export interface ReviewedCandidate {
  /** Kandidaten som LLM A levererade den (oklippt — människan ska se allt). */
  candidate: unknown;
  failures: GateFailure[];
}

export interface GateReport {
  /** Kandidater som passerade samtliga grindar → vidare till verify (LLM B). */
  accepted: ExtractionCandidate[];
  /** Underkända kandidater → needs_review.json + GitHub-issue. Publiceras EJ. */
  review: ReviewedCandidate[];
  /**
   * true ⇒ hela artikeln fälldes på artikelnivå (G2 eller G5) och samtliga
   * kandidater ligger i review.
   */
  articleRejected: boolean;
}

export interface GateContext {
  /** Exakta domäner ur data/sources.yaml (§6.1). Anroparen läser filen. */
  allowlist: readonly string[];
  /**
   * Partiernas egna domäner ur data/sources.yaml. Enda effekten: ett kort
   * citat som utgör en HEL, unik rad på partiets egen sida får passera
   * citatgolvet (se QUOTE_MIN_WORDS_PARTY_LINE). Utelämnad ⇒ inget undantag.
   */
  partiDomaner?: readonly string[];
  /** Injicerad klocka för determinism i test (T4). */
  now: Date;
}

/* ─────────────────────────────────────────────── Konstanter (R5, G4, G3) ── */

/** R5 (§5.3): enskilt löfte > 1 500 mdkr publiceras aldrig automatiskt. */
export const R5_CAP_MSEK = 1_500_000;

/** G4: rimlighetsfönster för källans publiceringsdatum, ±18 mån ≈ 548 dygn. */
export const DATE_WINDOW_DAYS = 548;

/** G3: citatgolv/-tak i ord (tak per §5.1; golv per DECISION_LOG 2026-06-12). */
export const QUOTE_MIN_WORDS = 5;
export const QUOTE_MAX_WORDS = 40;

/**
 * Lägre golv för ett citat som utgör en HEL, unik rad på partiets egen sida
 * (DECISION_LOG 2026-08-04).
 *
 * Golvet på fem ord finns för att kontrollen "står citatet ordagrant i
 * källan?" inte bevisar något på ett tvåordscitat — två ord i rad står i
 * nästan vilken text som helst. Men på partiernas egna sidor står löften i
 * punktlistor där hela punkten ÄR två–fyra ord: "Skrota enprocentsregeln",
 * "Införa prostatacancerscreening". Där tappade vi kompletta löften.
 *
 * Undantaget sänker inte kravet på ordagrannhet — det byter ut ett trubbigt
 * mått (antal ord) mot ett skarpare: citatet måste vara en hel rad, den raden
 * får förekomma exakt en gång, och den får inte rymmas i någon annan rad.
 * Då bevisar träffen precis det golvet ville skydda: att texten står där, som
 * en egen punkt, på partiets egen sida. Gäller bara partiernas domäner —
 * i en nyhetsartikel är en tvåordsrad en rubrik eller en bildtext.
 */
export const QUOTE_MIN_WORDS_PARTY_LINE = 2;

/** G5 (§7): max nya löften per artikel — fler ⇒ hela artikeln till review. */
export const MAX_PROMISES_PER_ARTICLE = 5;

/* ─────────────────────────────────────────────── G1: schema (ajv 2020-12) ── */

const schemaPath = new URL("../schemas/extraction.schema.json", import.meta.url);
const extractionSchema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateCandidate: ValidateFunction = ajv.compile(extractionSchema);

function gateG1(candidate: unknown): GateFailure[] {
  if (validateCandidate(candidate)) return [];
  const detail = (validateCandidate.errors ?? [])
    .map((e) => `${e.instancePath || "/"} ${e.message ?? "ogiltig"}`)
    .join("; ");
  return [{ gate: "G1", reason: `Schemafel: ${detail}` }];
}

/* ──────────────────────────────────────────── G2: källdomän (artikelnivå) ── */

/**
 * Härleder den kanoniska domänen ur en käll-URL, eller förklarar varför den
 * inte kan godkännas. Regler: https, ingen explicit port, exakt match efter
 * strip av ETT ledande "www.". Övriga subdomäner kräver egen allowlist-rad
 * (data.riksdagen.se står t.ex. explicit i §6.1).
 */
export function canonicalDomain(rawUrl: string): { domain: string } | { error: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { error: `ogiltig URL: ${truncate(rawUrl, 120)}` };
  }
  if (url.protocol !== "https:") return { error: `protokoll ${url.protocol} — https krävs` };
  if (url.port !== "") return { error: `explicit port ${url.port} tillåts inte` };
  // URL-parsern ger lowercase, IDNA/punycode-normaliserad hostname.
  let host = url.hostname.replace(/\.$/u, "");
  if (host.startsWith("www.")) host = host.slice(4);
  return { domain: host };
}

function gateG2(article: NormalizedArticle, allowlist: readonly string[]): GateFailure[] {
  const result = canonicalDomain(article.url);
  if ("error" in result) return [{ gate: "G2", reason: `Källans URL underkänd: ${result.error}` }];
  if (!allowlist.includes(result.domain)) {
    return [{ gate: "G2", reason: `Domänen "${result.domain}" finns inte i allowlist (exakt match krävs)` }];
  }
  if (result.domain !== article.domain) {
    return [{
      gate: "G2",
      reason: `Inkonsistens: artikelns domain-fält "${article.domain}" matchar inte URL-härledd domän "${result.domain}"`,
    }];
  }
  return [];
}

/* ─────────────────────────────────── G3: verbatimgrinden (hårda spärren) ── */

/**
 * Normalisering för verbatimjämförelse. Tillämpas IDENTISKT på källtext och
 * citat — den kan därför aldrig låta påhittad text passera, bara neutralisera
 * typografiska olikheter (CMS-citattecken, NBSP, mjuka bindestreck, radbryt).
 * Skiftläge bevaras: ordagrant är ordagrant.
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
 * Slår upp vilken PDF-sida ett verbatimgranskat citat står på. Returnerar
 * 1-indexerat sidnummer, eller null när artikeln inte är en PDF-chunk eller
 * citatet spänner över ett sidbryt (då är chunk-ankaret bästa kända läge).
 */
export function resolveQuotePage(article: NormalizedArticle, quote: string): number | null {
  if (!article.pdfPages) return null;
  const needle = normalizeForVerbatim(quote);
  if (needle.length === 0) return null;
  for (let i = 0; i < article.pdfPages.texts.length; i++) {
    if (normalizeForVerbatim(article.pdfPages.texts[i] ?? "").includes(needle)) {
      return article.pdfPages.firstPage + i;
    }
  }
  return null;
}

/** Byter/sätter #page-fragmentet — PDF-standardens enda djuplänksform. */
export function withPageAnchor(url: string, page: number): string {
  return `${url.replace(/#.*$/u, "")}#page=${page}`;
}

export function countWords(normalized: string): number {
  return normalized === "" ? 0 : normalized.split(" ").length;
}

/**
 * Avslutande skiljetecken, som inte skiljer två punkter i en lista åt.
 *
 * Partier skriver ofta sina punktlistor som en löpande mening: varje punkt
 * slutar med komma och den sista med punkt. Om citatet råkar bära kommat eller
 * inte avgörs av utvinningen, inte av partiet — och det är ingen skillnad i vad
 * som utlovas.
 */
export function utanAvslutandeSkiljetecken(rad: string): string {
  return rad.replace(/[.,;:!?]+$/u, "").trim();
}

/**
 * Är citatet en HEL, unik rad i källtexten? Kravet bakom det lägre citatgolvet.
 *
 * Raderna kommer ur `stripHtml`, som bryter rad på `</li>`, `</p>`, `</div>`
 * och `<br>` — en punkt i en lista blir alltså en egen rad. Tre villkor, alla
 * måste hålla: citatet ÄR en hel rad (inte ett utplock ur en längre mening),
 * den raden står exakt en gång, och citatet ryms inte inuti någon annan rad.
 * Faller något av dem gäller det vanliga golvet och posten går till granskning.
 *
 * **Jämförelsen bortser från avslutande skiljetecken** (mätt 2026-08-09). Det
 * här undantaget påstods tidigare inte nå partiernas punktlistor alls, med
 * förklaringen att punkterna inte hamnade på var sin rad. Mätt mot Liberalernas
 * alkoholsida stämde det inte: punkterna får var sin rad, och fyra av fem korta
 * citat klarade regeln. Det femte föll på att källan lyder «tillåta
 * takeaway-försäljning av alkohol**,**» medan citatet saknade kommat — två
 * grannpunkter i samma lista behandlades alltså olika beroende på om
 * utvinningen råkat ta med tecknet.
 *
 * **Citatkravet lossas inte av det här.** Att citatet står ordagrant i
 * källtexten prövas separat och med oförändrad stränghet; det enda som avgörs
 * här är om posten får använda det lägre golvet.
 */
export function arEgenRadIKallan(quote: string, articleText: string): boolean {
  const q = utanAvslutandeSkiljetecken(normalizeForVerbatim(quote));
  if (q === "") return false;
  const rader = articleText
    .split(/\r?\n/u)
    .map((r) => utanAvslutandeSkiljetecken(normalizeForVerbatim(r)))
    .filter((r) => r !== "");
  if (rader.filter((r) => r === q).length !== 1) return false;
  return !rader.some((r) => r !== q && r.includes(q));
}

function gateG3(
  candidate: ExtractionCandidate,
  articleText: string,
  arPartiegenSida: boolean,
): GateFailure[] {
  const failures: GateFailure[] = [];
  const quote = normalizeForVerbatim(candidate.quote);
  const words = countWords(quote);

  const kortMenEgenPunkt =
    arPartiegenSida &&
    words >= QUOTE_MIN_WORDS_PARTY_LINE &&
    arEgenRadIKallan(candidate.quote, articleText);

  if (words < QUOTE_MIN_WORDS && !kortMenEgenPunkt) {
    failures.push({
      gate: "G3",
      reason: arPartiegenSida
        ? `Citatet har ${words} ord — minst ${QUOTE_MIN_WORDS} krävs (kortare tillåts bara om citatet är en hel, unik punkt på partiets egen sida)`
        : `Citatet har ${words} ord — minst ${QUOTE_MIN_WORDS} krävs`,
    });
  }
  if (words > QUOTE_MAX_WORDS) {
    failures.push({ gate: "G3", reason: `Citatet har ${words} ord — max ${QUOTE_MAX_WORDS} tillåts (§5.1)` });
  }
  if (quote !== "" && !normalizeForVerbatim(articleText).includes(quote)) {
    failures.push({
      gate: "G3",
      reason: "Citatet återfinns inte ordagrant i källtexten (whitespace-normaliserad jämförelse)",
    });
  }
  return failures;
}

/* ────────────────────────────────────────── G4: belopp- och datumrimlighet ── */

/** R5-spärren. Återanvänds av publish på cost-stegets msek_base (försvar i djupet). */
export function passesAmountCapR5(msek: number | null): boolean {
  if (msek === null) return true;
  return Number.isFinite(msek) && msek >= 0 && msek <= R5_CAP_MSEK;
}

function gateG4(candidate: ExtractionCandidate, article: NormalizedArticle, now: Date): GateFailure[] {
  const failures: GateFailure[] = [];

  const amount = candidate.amount_in_text_msek;
  if (amount !== null && !Number.isFinite(amount)) {
    failures.push({ gate: "G4", reason: "Beloppet är inte ett ändligt tal" });
  } else if (!passesAmountCapR5(amount)) {
    failures.push({
      gate: "G4",
      reason: `Beloppsspärr R5: ${amount} msek överstiger taket ${R5_CAP_MSEK} msek (1 500 mdkr)`,
    });
  }

  const published = Date.parse(article.published);
  if (Number.isNaN(published)) {
    failures.push({ gate: "G4", reason: `Källans publiceringsdatum går inte att tolka: "${article.published}"` });
  } else {
    const diffDays = Math.abs(now.getTime() - published) / 86_400_000;
    if (diffDays > DATE_WINDOW_DAYS) {
      failures.push({
        gate: "G4",
        reason: `Publiceringsdatum ${article.published} ligger ${Math.round(diffDays)} dygn från körningen — fönstret är ±${DATE_WINDOW_DAYS} dygn (≈18 mån)`,
      });
    }
  }
  return failures;
}

/* ───────────────────────────────────────────────── Orkestrering: runGates ── */

/**
 * Kör hela grindkedjan för EN artikel med dess extraktionskandidater.
 *
 * Exekveringsordning (rapporterade grind-id följer alltid specens namn):
 *  1. G2 (artikelnivå) — otillåten källa fäller allt; kandidatinnehåll spelar
 *     då ingen roll.
 *  2. G5 (artikelnivå) — belopps-/spambomb: fler än 5 kandidater fäller hela
 *     artikeln INNAN någon kandidat processas vidare.
 *  3. Per kandidat: G1 → (G3, G4). Alla fallerande grindar samlas (bättre
 *     underlag i review-issuet) men G3/G4 kräver schema-giltig kandidat (G1).
 */
export function runGates(
  article: NormalizedArticle,
  candidates: readonly unknown[],
  ctx: GateContext,
): GateReport {
  const sendAllToReview = (failure: GateFailure): GateReport => ({
    accepted: [],
    review: candidates.map((candidate) => ({ candidate, failures: [failure] })),
    articleRejected: true,
  });

  // 1. G2 — artikelnivå.
  const [g2Failure] = gateG2(article, ctx.allowlist);
  if (g2Failure) return sendAllToReview(g2Failure);

  // 2. G5 — artikelnivå.
  if (candidates.length > MAX_PROMISES_PER_ARTICLE) {
    return sendAllToReview({
      gate: "G5",
      reason: `${candidates.length} kandidater ur en artikel — max ${MAX_PROMISES_PER_ARTICLE} (spam-/bombskydd, hela artikeln till review)`,
    });
  }

  // 3. Per kandidat. Domänen är redan kanoniserad och godkänd av G2 ovan —
  //    samma kanon används här, så "www." inte gör en partisida till en
  //    främmande domän.
  const domanResultat = canonicalDomain(article.url);
  const artikelDoman = "domain" in domanResultat ? domanResultat.domain : null;
  const arPartiegenSida =
    artikelDoman !== null &&
    (ctx.partiDomaner ?? []).some((d) => {
      const r = canonicalDomain(`https://${d}`);
      return "domain" in r && r.domain === artikelDoman;
    });

  const accepted: ExtractionCandidate[] = [];
  const review: ReviewedCandidate[] = [];

  for (const raw of candidates) {
    const g1 = gateG1(raw);
    if (g1.length > 0) {
      // Utan giltigt schema kan G3/G4 inte läsa fälten säkert.
      review.push({ candidate: raw, failures: g1 });
      continue;
    }
    const candidate = raw as ExtractionCandidate;
    const failures = [
      ...gateG3(candidate, article.text, arPartiegenSida),
      ...gateG4(candidate, article, ctx.now),
    ];
    if (failures.length > 0) {
      review.push({ candidate: raw, failures });
    } else {
      accepted.push(candidate);
    }
  }

  return { accepted, review, articleRejected: false };
}

/* ──────────────────────────────────────────────────────────── Hjälpare ── */

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
