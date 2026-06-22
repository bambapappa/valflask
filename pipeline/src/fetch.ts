import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import type { NormalizedArticle } from "./gates.ts";

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
  type: "rss" | "riksdagen_api";
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
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
};

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
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

export function dedup(
  articles: NormalizedArticle[],
  existingSeen: ReadonlyMap<string, string>,
): { newArticles: NormalizedArticle[]; seen: Map<string, string> } {
  const newArticles: NormalizedArticle[] = [];
  const seen = new Map(existingSeen);
  for (const article of articles) {
    const hash = sha256(article.url);
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

  constructor(opts: {
    feeds: SourceFeed[];
    limits: { max_articles_per_run: number; min_chars: number };
    httpFetch?: HttpFetchFn;
    cacheDir?: string | null;
    userAgent?: string;
  }) {
    this.feeds = opts.feeds;
    this.limits = opts.limits;
    this.httpFetch = opts.httpFetch ?? globalThis.fetch.bind(globalThis);
    this.cacheDir = opts.cacheDir ?? null;
    this.userAgent = opts.userAgent ?? USER_AGENT;
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
          : await this.fetchRss(feed, etagCache);

        for (const article of feedArticles) {
          if (article.text.length < this.limits.min_chars) continue;
          articles.push(article);
        }

        this.stats.set(feed.id, feedArticles.length);
      } catch (e) {
        console.error(`[fetch] feed ${feed.id} failed: ${e instanceof Error ? e.message : e}`);
        this.stats.set(feed.id, 0);
      }
    }

    saveEtagCache(this.cacheDir, etagCache);
    return articles.slice(0, this.limits.max_articles_per_run);
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

    return { text: await res.text(), status: res.status };
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
