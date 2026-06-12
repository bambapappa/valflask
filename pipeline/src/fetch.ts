import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import type { NormalizedArticle } from "./gates.ts";

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
