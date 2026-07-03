import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { DATE_WINDOW_DAYS, type NormalizedArticle } from "./gates.ts";

/* ──────────────────────── ArticleSource (M2 injicerbart gränssnitt) ── */

export interface ArticleSource {
  fetch(): Promise<NormalizedArticle[]>;
}

export class MemorySource implements ArticleSource {
  constructor(private articles: NormalizedArticle[]) {}
  async fetch(): Promise<NormalizedArticle[]> {
    return this.articles;
  }
}

export class FixtureSource implements ArticleSource {
  constructor(private fixtureDir: string) {}
  async fetch(): Promise<NormalizedArticle[]> {
    const files = readdirSync(this.fixtureDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    return files.map((f) => {
      const raw = readFileSync(`${this.fixtureDir}/${f}`, "utf8");
      const parsed = JSON.parse(raw) as { article: NormalizedArticle };
      return parsed.article;
    });
  }
}

/* ──────────────────────── Källkonfiguration (sources.yaml) ── */

export interface SourceFeed {
  id: string;
  type: "rss" | "riksdagen_api" | "page";
  url: string;
  verified?: string;
}

export interface SourceConfig {
  allowlist_domains: string[];
  feeds: SourceFeed[];
  limits: {
    max_articles_per_run: number;
    min_chars: number;
  };
}

/* ──────────────────────── HTTP-injicerbar klient ── */

export type HttpFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/* ──────────────────────── ETag/IMS-cache ── */

export interface CacheEntry {
  etag?: string;
  lastModified?: string;
  lastFetched: string;
}

export function loadEtagCache(cacheDir: string | null): Map<string, CacheEntry> {
  if (!cacheDir) return new Map();
  try {
    const raw = readFileSync(`${cacheDir}/etag-cache.json`, "utf8");
    return new Map(Object.entries(JSON.parse(raw) as Record<string, CacheEntry>));
  } catch {
    return new Map();
  }
}

export function saveEtagCache(cacheDir: string | null, cache: Map<string, CacheEntry>): void {
  if (!cacheDir) return;
  try {
    mkdirSync(cacheDir, { recursive: true });
    const obj: Record<string, CacheEntry> = {};
    for (const [k, v] of cache) obj[k] = v;
    writeFileSync(`${cacheDir}/etag-cache.json`, JSON.stringify(obj, null, 2) + "\n");
  } catch {
    // best-effort
  }
}

/* ──────────────────────── Robots.txt-respekt ── */

export interface RobotsRule {
  path: string;
  allow: boolean;
}

export function parseRobotsTxt(text: string, userAgent: string): RobotsRule[] {
  const lines = text.split("\n");

  const groups: Array<{ ua: string; rules: RobotsRule[] }> = [];
  let currentUa = "";
  let currentRules: RobotsRule[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("#") || line === "") continue;

    const lower = line.toLowerCase();
    if (lower.startsWith("user-agent:")) {
      if (currentUa && currentRules.length > 0) {
        groups.push({ ua: currentUa, rules: currentRules });
      }
      currentUa = line.slice("user-agent:".length).trim().toLowerCase();
      currentRules = [];
      continue;
    }

    if (lower.startsWith("disallow:")) {
      const path = line.slice("disallow:".length).trim();
      if (path) currentRules.push({ path, allow: false });
    } else if (lower.startsWith("allow:")) {
      const path = line.slice("allow:".length).trim();
      if (path) currentRules.push({ path, allow: true });
    }
  }

  if (currentUa && currentRules.length > 0) {
    groups.push({ ua: currentUa, rules: currentRules });
  }

  const uaLower = userAgent.toLowerCase();
  let bestGroup = groups.find((g) => g.ua !== "*" && uaLower.includes(g.ua));
  if (!bestGroup) {
    bestGroup = groups.find((g) => g.ua === "*");
  }

  return bestGroup?.rules ?? [];
}

export function isPathAllowed(path: string, rules: RobotsRule[]): boolean {
  let bestMatch = "";
  let bestAllow = true;

  for (const rule of rules) {
    if (path.startsWith(rule.path) && rule.path.length > bestMatch.length) {
      bestMatch = rule.path;
      bestAllow = rule.allow;
    }
  }

  return bestAllow;
}

/* ──────────────────────── HTML-stripping (fulltext extraktion) ── */

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'",
  "&nbsp;": " ", "&shy;": "",
  // Svenska + typografiska namngivna entiteter — måste avkodas, annars matchar
  // inte det verbatim-extraherade citatet källtexten i G3 (t.ex. sidor som
  // serverar &auml; i stället för ä).
  "&auml;": "ä", "&ouml;": "ö", "&aring;": "å",
  "&Auml;": "Ä", "&Ouml;": "Ö", "&Aring;": "Å",
  "&eacute;": "é", "&egrave;": "è", "&uuml;": "ü",
  "&ndash;": "–", "&mdash;": "—", "&hellip;": "…",
  "&rsquo;": "’", "&lsquo;": "‘", "&rdquo;": "”", "&ldquo;": "“",
};

export function stripHtml(html: string): string {
  return html
    // script/style/noscript-INNEHÅLL bort (inte bara taggarna): JS-kod är brus
    // för LLM A, en injektionsyta, och gör sidans innehålls-hash instabil när
    // inline-skript bär nonces/tidsstämplar.
    .replace(/<script\b[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "\n")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&[a-zA-Z]+;/g, (m) => HTML_ENTITIES[m] ?? m)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/* ──────────────────────── PDF-extraktion (skrivna manifest som PDF) ── */

/**
 * Antal PDF-sidor per artikel-chunk. Ett helt manifest (≈100 s.) som EN artikel
 * skulle kapas till ≤5 löften av A1/G5 — chunkning ger LLM A upp till 5 löften
 * per sidintervall i stället. Varje chunk får url `…pdf#page=N` (klickbart
 * djuplänk-ankare) så dedup/seen behandlar dem som separata artiklar.
 */
export const PDF_PAGES_PER_CHUNK = 10;

let pdfjsModule: typeof import("pdfjs-dist/legacy/build/pdf.mjs") | null = null;

async function getPdfjs(): Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> {
  if (!pdfjsModule) {
    pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsModule;
}

export function looksLikePdf(contentType: string | null, bytes: Uint8Array): boolean {
  if (contentType && contentType.toLowerCase().includes("application/pdf")) return true;
  // Magisk signatur "%PDF-" — vissa CDN:er serverar PDF som octet-stream.
  return bytes.length >= 5
    && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44
    && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

/**
 * Slår ihop textrader från en PDF-sida till löpande text, med dehyphenering av
 * radslutsavstavningar: "arbets-" + "marknaden" → "arbetsmarknaden". Utan detta
 * faller G3 verbatim på varje citat som råkar korsa ett avstavat radbryt (G3
 * kollapsar whitespace men syr aldrig ihop ord). Två specialfall:
 *  - versal/siffra före strecket ("EU-" + "medel") är ett äkta bindestreck i
 *    sammansättningen — raderna sys ihop men strecket behålls: "EU-medel";
 *  - hängande bindestreck i uppräkningar ("vård- och omsorg") lämnas orörda:
 *    fortsättningsraden börjar då med en konjunktion, aldrig en ordfortsättning.
 */
export function joinPdfLines(lines: string[]): string {
  let text = "";
  let prevSoftBreak = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    // Mjukt bindestreck (U+00AD) SIST på raden = avstavning utan synligt streck
    // (InDesign gör så): nästa rad är alltid en ordfortsättning. Inuti raden är
    // det bara en osynlig brytpunktsmarkör och strippas.
    const softBreak = /­$/u.test(trimmed);
    const line = trimmed.replace(/­/gu, "");
    if (line === "") continue;
    const continuesWord = /^[a-zåäöé]/u.test(line) && !/^(och|eller|samt)\b/u.test(line);
    if (prevSoftBreak && /\p{L}$/u.test(text) && /^\p{L}/u.test(line)) {
      text = text + line; // avstavad med mjukt streck: sy ihop rakt av
    } else if (continuesWord && /[a-zåäöé]-$/u.test(text)) {
      text = text.slice(0, -1) + line; // avstavning: strecket bort
    } else if (continuesWord && /[A-ZÅÄÖ0-9]-$/u.test(text)) {
      text = text + line; // sammansättning med äkta bindestreck: strecket kvar
    } else {
      text = text === "" ? line : `${text}\n${line}`;
    }
    prevSoftBreak = softBreak;
  }
  return text;
}

/** "D:20260604154527+02'00'" (PDF-datum) → ISO 8601, eller null. */
export function parsePdfDate(raw: string): string | null {
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:Z|([+-])(\d{2})'?(\d{2})?'?)?/u.exec(raw);
  if (!m) return null;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", s = "00", sign, oh, om = "00"] = m;
  const offset = sign ? `${sign}${oh}:${om}` : "Z";
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export interface PdfExtract {
  title: string | null;
  published: string | null;
  /** Extraherad text per sida (1-indexerad i PDF:en, 0-indexerad här). */
  pages: string[];
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfExtract> {
  const pdfjs = await getPdfjs();
  // Kopia: getDocument tar ägarskap över buffern (transfer).
  const loadingTask = pdfjs.getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    // Textextraktion behöver inga fontfiler; utan denna varnar pdf.js om
    // standardFontDataUrl för PDF:er som refererar de 14 standardfonterna.
    useSystemFonts: true,
  });
  try {
    const doc = await loadingTask.promise;

    let title: string | null = null;
    let published: string | null = null;
    try {
      const meta = await doc.getMetadata();
      const info = meta.info as Record<string, unknown>;
      if (typeof info.Title === "string" && info.Title.trim() !== "") title = info.Title.trim();
      if (typeof info.CreationDate === "string") published = parsePdfDate(info.CreationDate);
    } catch {
      // metadata är valfri
    }

    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let current = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        current += item.str;
        if (item.hasEOL) {
          lines.push(current);
          current = "";
        }
      }
      if (current !== "") lines.push(current);
      pages.push(joinPdfLines(lines));
    }

    return { title, published, pages };
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Max antal manifest-PDF:er som auto-följs från EN page-feed per hämtning.
 * Skydd mot länkfarmar; riktiga valsidor länkar 1–2 dokument.
 */
export const MAX_FOLLOWED_PDFS = 3;

/**
 * Hittar länkar till manifest-PDF:er i en HTML-sida: href som pekar på .pdf
 * på SAMMA kanoniska domän och vars sökväg ser ut som ett valdokument.
 * Detta är B:s "automatisk täckning": partier länkar sina manifest som PDF
 * från valsidan (S/L/C gör redan så), och partier som ännu inte publicerat
 * (M/SD/KD i juli 2026) fångas den dag PDF-länken dyker upp — utan att någon
 * behöver registrera en ny feed. Externa domäner följs aldrig (och G2
 * allowlist-grindar dessutom varje artikel nedströms).
 */
export function findManifestPdfLinks(html: string, baseUrl: string): string[] {
  let baseHost: string;
  try {
    baseHost = canonicalHost(new URL(baseUrl).hostname);
  } catch {
    return [];
  }
  const links = new Set<string>();
  for (const m of html.matchAll(/href="([^"]+)"/gi)) {
    const raw = m[1]!.replace(/&amp;/g, "&");
    let abs: URL;
    try {
      abs = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (abs.protocol !== "https:") continue;
    if (!/\.pdf$/iu.test(abs.pathname)) continue;
    if (!/(manifest|valplattform|valprogram|handlingsprogram)/iu.test(abs.pathname)) continue;
    if (canonicalHost(abs.hostname) !== baseHost) continue;
    abs.hash = "";
    links.add(abs.href);
    if (links.size >= MAX_FOLLOWED_PDFS) break;
  }
  return [...links];
}

function canonicalHost(hostname: string): string {
  let host = hostname.replace(/\.$/u, "");
  if (host.startsWith("www.")) host = host.slice(4);
  return host;
}

/* ──────────────────────── RSS/Atom-parsning ── */

interface ParsedFeedItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  content: string;
}

let xmlParserModule: typeof import("fast-xml-parser") | null = null;

async function getXmlParser(): Promise<typeof import("fast-xml-parser")> {
  if (!xmlParserModule) {
    xmlParserModule = await import("fast-xml-parser");
  }
  return xmlParserModule;
}

export async function parseRssXml(xml: string): Promise<ParsedFeedItem[]> {
  const { XMLParser } = await getXmlParser();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    isArray: (name: string) => name === "item" || name === "entry",
  });
  const parsed = parser.parse(xml);

  if (parsed.rss?.channel?.item) {
    return parsed.rss.channel.item.map((it: Record<string, unknown>) => ({
      title: String(it.title ?? ""),
      link: extractRssLink(it.link),
      pubDate: String(it.pubDate ?? it["dc:date"] ?? ""),
      description: String(it.description ?? ""),
      content: String(it["content:encoded"] ?? it.description ?? ""),
    }));
  }

  if (parsed.feed?.entry) {
    return parsed.feed.entry.map((it: Record<string, unknown>) => ({
      title: String(it.title ?? ""),
      link: extractAtomLink(it.link),
      pubDate: String(it.published ?? it.updated ?? ""),
      description: String(it.summary ?? ""),
      content: String(it.content ?? it.summary ?? ""),
    }));
  }

  return [];
}

function extractRssLink(link: unknown): string {
  if (typeof link === "string") return link;
  if (typeof link === "object" && link !== null) {
    const obj = link as Record<string, unknown>;
    if (typeof obj.href === "string") return obj.href;
    if (typeof obj["#text"] === "string") return obj["#text"];
  }
  return "";
}

function extractAtomLink(link: unknown): string {
  if (Array.isArray(link)) {
    const alt = link.find((l: Record<string, unknown>) => l["@_rel"] === "alternate");
    if (alt) return String(alt["@_href"] ?? "");
    return link.length > 0 ? String(link[0]?.["@_href"] ?? "") : "";
  }
  if (typeof link === "object" && link !== null) {
    return String((link as Record<string, unknown>)["@_href"] ?? "");
  }
  return String(link ?? "");
}

/* ──────────────────────── Riksdagen API-parsning ── */

export function parseRiksdagenDokumentlista(json: Record<string, unknown>): Array<{
  dok_id: string;
  titel: string;
  datum: string;
  dokument_url_text: string;
  url: string;
}> {
  const lista = json.dokumentlista as Record<string, unknown> | undefined;
  if (!lista) return [];

  const raw = lista.dokument;
  if (!raw) return [];

  const docs = Array.isArray(raw) ? raw : [raw];
  return docs.map((d: Record<string, unknown>) => ({
    dok_id: String(d.dok_id ?? ""),
    titel: String(d.titel ?? ""),
    datum: String(d.datum ?? ""),
    dokument_url_text: String(d.dokument_url_text ?? ""),
    url: `https://data.riksdagen.se/dokument/${d.dok_id}`,
  }));
}

export function parseRiksdagenAnforandelista(json: Record<string, unknown>): Array<{
  anforande_id: string;
  avsnittsrubrik: string;
  talare: string;
  parti: string;
  dok_datum: string;
  anforande_url_xml: string;
  url: string;
}> {
  const lista = json.anforandelista as Record<string, unknown> | undefined;
  if (!lista) return [];

  const raw = lista.anforande;
  if (!raw) return [];

  const items = Array.isArray(raw) ? raw : [raw];
  return items.map((a: Record<string, unknown>) => ({
    anforande_id: String(a.anforande_id ?? ""),
    avsnittsrubrik: String(a.avsnittsrubrik ?? ""),
    talare: String(a.talare ?? ""),
    parti: String(a.parti ?? ""),
    dok_datum: String(a.dok_datum ?? ""),
    anforande_url_xml: String(a.anforande_url_xml ?? ""),
    url: String(a.anforande_url_html ?? `https://data.riksdagen.se/anforande/${a.anforande_id}`),
  }));
}

/* ──────────────────────── SHA-256 & dedup ── */

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Seen-nyckel för en artikel. RSS/API: sha256(url) — en URL är en artikel.
 * Page-artiklar bär contentHash: nyckeln blir sha256(url + "\n" + contentHash),
 * så samma sida med NYTT innehåll får ny nyckel och processas om (B:s löpande
 * bevakning av manifest), medan oförändrat innehåll är sett och hoppas över.
 * Ompublicering av redan fångade löften stoppas nedströms av dublettkollen
 * (findPossibleDuplicate → review med duplicateOf), aldrig av seen.
 */
export function seenKey(article: Pick<NormalizedArticle, "url" | "contentHash">): string {
  return article.contentHash
    ? sha256(`${article.url}\n${article.contentHash}`)
    : sha256(article.url);
}

export function dedup(
  articles: NormalizedArticle[],
  existingSeen: ReadonlyMap<string, string>,
): { newArticles: NormalizedArticle[]; seen: Map<string, string> } {
  const newArticles: NormalizedArticle[] = [];
  const seen = new Map(existingSeen);
  for (const article of articles) {
    const hash = seenKey(article);
    if (!seen.has(hash)) {
      newArticles.push(article);
      seen.set(hash, article.url);
    }
  }
  return { newArticles, seen };
}

export function loadSeen(path: string): Map<string, string> {
  try {
    const raw = readFileSync(path, "utf8");
    const obj = JSON.parse(raw) as Record<string, string>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

/* ──────────────────────── LiveSource (skarp fetch) ── */

const USER_AGENT = "DrygastBot/1.0 (+https://drygast.nu/om)";

export class LiveSource implements ArticleSource {
  private feeds: SourceFeed[];
  private limits: { max_articles_per_run: number; min_chars: number };
  private httpFetch: HttpFetchFn;
  private cacheDir: string | null;
  private userAgent: string;
  private robotsCache: Map<string, RobotsRule[]>;
  private stats: Map<string, number>;

  private now: () => Date;

  constructor(opts: {
    feeds: SourceFeed[];
    limits: { max_articles_per_run: number; min_chars: number };
    httpFetch?: HttpFetchFn;
    cacheDir?: string | null;
    userAgent?: string;
    /** Injicerbar klocka (test-determinism för färskhetsspärren på följda PDF:er). */
    now?: () => Date;
  }) {
    this.feeds = opts.feeds;
    this.limits = opts.limits;
    this.httpFetch = opts.httpFetch ?? globalThis.fetch.bind(globalThis);
    this.cacheDir = opts.cacheDir ?? null;
    this.userAgent = opts.userAgent ?? USER_AGENT;
    this.now = opts.now ?? (() => new Date());
    this.robotsCache = new Map();
    this.stats = new Map();
  }

  getStats(): Map<string, number> {
    return new Map(this.stats);
  }

  async fetch(): Promise<NormalizedArticle[]> {
    const articles: NormalizedArticle[] = [];
    const etagCache = loadEtagCache(this.cacheDir);

    // Hämta ALLA feeds (ingen global kapning här). Annars äter feeds högt upp i
    // listan — partiernas RSS — upp budgeten innan riksdagen/media ens hämtas.
    // Processbudgeten (på NYA artiklar) tillämpas i runPipeline efter dedup.
    for (const feed of this.feeds) {
      try {
        const feedArticles = feed.type === "riksdagen_api"
          ? await this.fetchRiksdagen(feed, etagCache)
          : feed.type === "page"
            ? await this.fetchPage(feed, etagCache)
            : await this.fetchRss(feed, etagCache);

        for (const article of feedArticles) {
          if (article.text.length < this.limits.min_chars) continue;
          articles.push({ ...article, feedType: feed.type });
        }

        this.stats.set(feed.id, feedArticles.length);
      } catch (e) {
        console.error(`[fetch] feed ${feed.id} failed: ${e instanceof Error ? e.message : e}`);
        this.stats.set(feed.id, 0);
      }
    }

    saveEtagCache(this.cacheDir, etagCache);
    // INGEN slice här — den globala kapningen stred mot kommentaren ovan och
    // svalt page-feedsen (sist i sources.yaml): partiernas RSS + riksdagen
    // fyllde alltid max_articles_per_run innan manifesten ens nådde dedup.
    // Budgeten på NYA artiklar ligger i runPipeline (maxNewArticles).
    return articles;
  }

  private async checkRobots(feedUrl: string): Promise<boolean> {
    const url = new URL(feedUrl);
    const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;

    if (!this.robotsCache.has(robotsUrl)) {
      try {
        const res = await this.httpFetch(robotsUrl, {
          headers: { "User-Agent": this.userAgent },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const text = await res.text();
          this.robotsCache.set(robotsUrl, parseRobotsTxt(text, this.userAgent));
        } else {
          this.robotsCache.set(robotsUrl, []);
        }
      } catch {
        this.robotsCache.set(robotsUrl, []);
      }
    }

    const rules = this.robotsCache.get(robotsUrl)!;
    if (rules.length === 0) return true;
    return isPathAllowed(url.pathname, rules);
  }

  private async fetchWithCache(
    url: string,
    etagCache: Map<string, CacheEntry>,
    extraHeaders?: Record<string, string>,
  ): Promise<{ text: string; status: number } | null> {
    const raw = await this.fetchRawWithCache(url, etagCache, extraHeaders);
    if (!raw) return null;
    return { text: new TextDecoder("utf-8").decode(raw.bytes), status: raw.status };
  }

  /** Som fetchWithCache men lämnar kroppen rå — page-källan avgör HTML/PDF själv. */
  private async fetchRawWithCache(
    url: string,
    etagCache: Map<string, CacheEntry>,
    extraHeaders?: Record<string, string>,
  ): Promise<{ bytes: Uint8Array; contentType: string | null; status: number } | null> {
    const headers: Record<string, string> = {
      "User-Agent": this.userAgent,
      ...extraHeaders,
    };

    const cached = etagCache.get(url);
    if (cached) {
      if (cached.etag) headers["If-None-Match"] = cached.etag;
      if (cached.lastModified) headers["If-Modified-Since"] = cached.lastModified;
    }

    const res = await this.httpFetch(url, {
      headers,
      signal: AbortSignal.timeout(30000),
      redirect: "follow",
    });

    if (res.status === 304) return null;

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }

    const entry: CacheEntry = { lastFetched: new Date().toISOString() };
    const etag = res.headers.get("etag");
    const lm = res.headers.get("last-modified");
    if (etag) entry.etag = etag;
    if (lm) entry.lastModified = lm;
    etagCache.set(url, entry);

    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get("content-type"),
      status: res.status,
    };
  }

  private async fetchRss(
    feed: SourceFeed,
    etagCache: Map<string, CacheEntry>,
  ): Promise<NormalizedArticle[]> {
    const allowed = await this.checkRobots(feed.url);
    if (!allowed) {
      console.log(`[fetch] robots.txt blockerar ${feed.id}`);
      return [];
    }

    const result = await this.fetchWithCache(feed.url, etagCache, {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    });
    if (!result) return [];

    const items = await parseRssXml(result.text);
    const articles: NormalizedArticle[] = [];

    for (const item of items) {
      if (!item.link) continue;
      const text = stripHtml(item.content || item.description);
      const domain = extractDomain(item.link);
      const published = parseRssDate(item.pubDate);

      articles.push({
        url: item.link,
        domain,
        title: item.title,
        text,
        published,
      });
    }

    return articles;
  }

  /**
   * "page"-källa: hämtar ett enskilt dokument (t.ex. ett partis valmanifest eller
   * policysida). HTML strippas till text och blir EN artikel. PDF (auto-detekterad
   * på content-type eller %PDF-signatur — flera partier publicerar hela manifestet
   * bara som PDF) textextraheras och chunkas per PDF_PAGES_PER_CHUNK sidor till en
   * artikel per chunk med url `…#page=N`, eftersom A1/G5 tar max 5 löften per
   * artikel. Extract-steget kör LLM A som vanligt. Så fångas skrivna manifest —
   * som inte finns som RSS — automatiskt och löpande, i stället för manuell skörd.
   */
  private async fetchPage(
    feed: SourceFeed,
    etagCache: Map<string, CacheEntry>,
  ): Promise<NormalizedArticle[]> {
    const allowed = await this.checkRobots(feed.url);
    if (!allowed) {
      console.log(`[fetch] robots.txt blockerar ${feed.id}`);
      return [];
    }

    const result = await this.fetchRawWithCache(feed.url, etagCache, {
      Accept: "text/html,application/xhtml+xml,application/pdf",
    });
    if (!result) return [];

    if (looksLikePdf(result.contentType, result.bytes)) {
      return this.pdfToArticles(feed, result.bytes);
    }

    const html = new TextDecoder("utf-8").decode(result.bytes);
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]!) : feed.id;
    const text = stripHtml(html);

    const articles: NormalizedArticle[] = [{
      url: feed.url,
      domain: extractDomain(feed.url),
      title,
      text,
      published: new Date().toISOString(),
      contentHash: sha256(text),
    }];

    // Auto-följ manifest-PDF:er länkade från sidan (samma domän). Ett trasigt
    // dokument fäller aldrig sid-artikeln — det loggas och hoppas över.
    for (const pdfUrl of findManifestPdfLinks(html, feed.url)) {
      try {
        if (!(await this.checkRobots(pdfUrl))) continue;
        const pdfResult = await this.fetchRawWithCache(pdfUrl, etagCache, {
          Accept: "application/pdf",
        });
        if (!pdfResult || !looksLikePdf(pdfResult.contentType, pdfResult.bytes)) continue;
        // Färskhetsspärr ENBART för auto-följda dokument: valsidor länkar ofta
        // FÖRRA valens manifest (SD/KD länkar 2022/2024-dokument). G4 hade ändå
        // stoppat publicering (±548 d), men att hoppa här sparar LLM-anropen
        // och håller review-kön ren. Kuraterade feeds behåller full grind-väg.
        articles.push(...await this.pdfToArticles({ ...feed, url: pdfUrl }, pdfResult.bytes, {
          skipStale: true,
        }));
      } catch (e) {
        console.error(`[fetch] följd PDF ${pdfUrl} failed: ${e instanceof Error ? e.message : e}`);
      }
    }

    return articles;
  }

  private async pdfToArticles(
    feed: SourceFeed,
    bytes: Uint8Array,
    opts?: { skipStale?: boolean },
  ): Promise<NormalizedArticle[]> {
    const pdf = await extractPdfText(bytes);

    if (opts?.skipStale && pdf.published) {
      const ageDays = Math.abs(this.now().getTime() - Date.parse(pdf.published)) / 86_400_000;
      if (ageDays > DATE_WINDOW_DAYS) {
        console.log(`[fetch] följd PDF ${feed.url} är ${Math.round(ageDays)} dygn gammal (> ${DATE_WINDOW_DAYS}) — hoppas över`);
        return [];
      }
    }

    const domain = extractDomain(feed.url);
    const baseTitle = pdf.title ?? feed.id;
    const published = pdf.published ?? new Date().toISOString();

    const articles: NormalizedArticle[] = [];
    for (let start = 0; start < pdf.pages.length; start += PDF_PAGES_PER_CHUNK) {
      const chunkPages = pdf.pages.slice(start, start + PDF_PAGES_PER_CHUNK);
      const singleChunk = pdf.pages.length <= PDF_PAGES_PER_CHUNK;
      const text = chunkPages.join("\n\n");
      articles.push({
        // #page=N är PDF:ens standard-djuplänk: klickbar källhänvisning till
        // rätt sida, och gör chunkarnas url:er distinkta för dedup/seen.
        url: singleChunk ? feed.url : `${feed.url}#page=${start + 1}`,
        domain,
        title: singleChunk
          ? baseTitle
          : `${baseTitle} (s. ${start + 1}–${start + chunkPages.length})`,
        text,
        published,
        // Per chunk: en ny manifestversion omprocessar bara ändrade sidintervall.
        contentHash: sha256(text),
      });
    }
    return articles;
  }

  private async fetchRiksdagen(
    feed: SourceFeed,
    etagCache: Map<string, CacheEntry>,
  ): Promise<NormalizedArticle[]> {
    const result = await this.fetchWithCache(feed.url, etagCache, {
      Accept: "application/json",
    });
    if (!result) return [];

    const json = JSON.parse(result.text) as Record<string, unknown>;

    if (json.dokumentlista) {
      return this.processRiksdagenDokument(json, etagCache);
    }
    if (json.anforandelista) {
      return this.processRiksdagenAnforanden(json, etagCache);
    }

    return [];
  }

  private async processRiksdagenDokument(
    json: Record<string, unknown>,
    etagCache: Map<string, CacheEntry>,
  ): Promise<NormalizedArticle[]> {
    const docs = parseRiksdagenDokumentlista(json);
    const articles: NormalizedArticle[] = [];

    for (const doc of docs) {
      const textUrl = doc.dokument_url_text.startsWith("//")
        ? `https:${doc.dokument_url_text}`
        : doc.dokument_url_text;

      let text = "";
      try {
        const textResult = await this.fetchWithCache(textUrl, etagCache);
        if (textResult) text = textResult.text;
      } catch {
        text = doc.titel;
      }

      const date = doc.datum ? `${doc.datum}T00:00:00Z` : new Date().toISOString();

      articles.push({
        url: doc.url,
        domain: "data.riksdagen.se",
        title: doc.titel,
        text: text || doc.titel,
        published: date,
      });
    }

    return articles;
  }

  private async processRiksdagenAnforanden(
    json: Record<string, unknown>,
    etagCache: Map<string, CacheEntry>,
  ): Promise<NormalizedArticle[]> {
    const items = parseRiksdagenAnforandelista(json);
    const articles: NormalizedArticle[] = [];

    for (const item of items) {
      let textUrl = item.anforande_url_xml;
      if (textUrl && !textUrl.startsWith("http")) {
        textUrl = `https://data.riksdagen.se${textUrl.startsWith("/") ? "" : "/"}${textUrl}`;
      }

      let text = "";
      try {
        if (textUrl) {
          const textResult = await this.fetchWithCache(textUrl, etagCache);
          if (textResult) text = textResult.text;
        }
      } catch {
        text = "";
      }

      const title = item.avsnittsrubrik
        ? `${item.avsnittsrubrik} — ${item.talare}`
        : `Anförande ${item.anforande_id} — ${item.talare}`;

      const date = item.dok_datum ? `${item.dok_datum}T00:00:00Z` : new Date().toISOString();

      articles.push({
        url: `https://data.riksdagen.se/anforande/${item.anforande_id}`,
        domain: "data.riksdagen.se",
        title,
        text: text || title,
        published: date,
      });
    }

    return articles;
  }
}

/* ──────────────────────── Hjälpare ── */

function extractDomain(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    let host = url.hostname.replace(/\.$/u, "");
    if (host.startsWith("www.")) host = host.slice(4);
    return host;
  } catch {
    return "";
  }
}

function parseRssDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  const parsed = Date.parse(dateStr);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return dateStr;
}
