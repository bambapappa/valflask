import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(import.meta.dirname, "../../data");

interface ReviewCandidate {
  candidate: {
    title?: string;
    parties?: string[];
    quote?: string;
  };
  failures: Array<{ gate: string; reason: string }>;
  articleUrl: string;
  articleTitle: string;
  verifyReason?: string;
  costReason?: string;
}

interface PromiseEntry {
  id: string;
  title: string;
  parties: string[];
  quote: string;
  date_stated: string;
  source: { url: string; domain: string; archive_url: string | null; fetched_at: string };
  category: string;
  cost: Record<string, unknown>;
  financing_claimed: Record<string, unknown>;
  status: string;
  extraction: Record<string, unknown>;
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function saveJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function list(dataDir: string = DATA_DIR): void {
  const items = loadJson<ReviewCandidate[]>(join(dataDir, "needs_review.json"));
  if (items.length === 0) {
    console.log("Inga poster i needs_review.");
    return;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const title = item.candidate?.title ?? item.articleTitle ?? "(ingen titel)";
    const parties = item.candidate?.parties?.join(",") ?? "?";
    const reasons: string[] = [];
    if (item.failures.length > 0) reasons.push(item.failures.map((f) => f.gate).join(","));
    if (item.verifyReason) reasons.push(`verify: ${item.verifyReason}`);
    if (item.costReason) reasons.push(`cost: ${item.costReason}`);

    console.log(`[${i}] ${title}`);
    console.log(`    Partier: ${parties}`);
    console.log(`    Källa: ${item.articleUrl}`);
    if (reasons.length > 0) console.log(`    Anledning: ${reasons.join("; ")}`);
    console.log();
  }

  console.log(`Totalt: ${items.length} post(er) i needs_review.`);
}

function approve(indexStr: string, dataDir: string = DATA_DIR): void {
  const index = parseInt(indexStr, 10);
  const items = loadJson<ReviewCandidate[]>(join(dataDir, "needs_review.json"));

  if (Number.isNaN(index) || index < 0 || index >= items.length) {
    console.error(`Ogiltigt index: ${indexStr}. Tillgängliga: 0–${items.length - 1}`);
    process.exit(1);
  }

  const item = items[index]!;
  const promises = loadJson<PromiseEntry[]>(join(dataDir, "promises.json"));

  const maxNum = promises.reduce((max, p) => {
    const m = p.id.match(/^p-2026-(\d+)$/);
    return m ? Math.max(max, parseInt(m[1]!, 10)) : max;
  }, 0);

  const newId = `p-2026-${String(maxNum + 1).padStart(4, "0")}`;
  const title = item.candidate?.title ?? item.articleTitle ?? "Okänt löfte";

  const newPromise: PromiseEntry = {
    id: newId,
    title,
    parties: item.candidate?.parties ?? [],
    quote: item.candidate?.quote ?? "",
    date_stated: new Date().toISOString().slice(0, 10),
    source: {
      url: item.articleUrl,
      domain: new URL(item.articleUrl).hostname.replace(/^www\./, ""),
      archive_url: null,
      fetched_at: new Date().toISOString(),
    },
    category: "övrigt",
    cost: {
      type: "utgift",
      period: "per_ar",
      msek_low: 0,
      msek_base: 0,
      msek_high: 0,
      basis: "llm_estimat",
      basis_url: null,
      method_note: "Review-godkänd utan kostnadssättning.",
      confidence: 0.0,
    },
    financing_claimed: { described: false, summary: null, msek: null },
    status: "aktiv",
    extraction: {
      model: "review",
      verified_by: "owner",
      run_id: `review-${new Date().toISOString().slice(0, 13)}`,
    },
  };

  promises.push(newPromise);
  promises.sort((a, b) => a.id.localeCompare(b.id));

  const remaining = items.filter((_, i) => i !== index);

  saveJson(join(dataDir, "promises.json"), promises);
  saveJson(join(dataDir, "needs_review.json"), remaining);

  console.log(`Godkänd: ${newId} "${title}"`);
  console.log(`Commit-meddelande: data: review approve ${newId}`);
}

function reject(indexStr: string, reason: string, dataDir: string = DATA_DIR): void {
  const index = parseInt(indexStr, 10);
  const items = loadJson<ReviewCandidate[]>(join(dataDir, "needs_review.json"));

  if (Number.isNaN(index) || index < 0 || index >= items.length) {
    console.error(`Ogiltigt index: ${indexStr}. Tillgängliga: 0–${items.length - 1}`);
    process.exit(1);
  }

  const item = items[index]!;
  const title = item.candidate?.title ?? item.articleTitle ?? "(okänd)";
  const remaining = items.filter((_, i) => i !== index);

  saveJson(join(dataDir, "needs_review.json"), remaining);

  console.log(`Avvisad: "${title}" — ${reason}`);
}

const [,, command, ...args] = process.argv;

switch (command) {
  case "list":
    list();
    break;
  case "approve":
    if (!args[0]) {
      console.error("Användning: pnpm review approve <index>");
      process.exit(1);
    }
    approve(args[0]);
    break;
  case "reject":
    if (!args[0] || !args[1]) {
      console.error("Användning: pnpm review reject <index> <orsak>");
      process.exit(1);
    }
    reject(args[0], args.slice(1).join(" "));
    break;
  default:
    console.log("Användning: pnpm review <list|approve|reject>");
    console.log("  list              Visa poster i needs_review");
    console.log("  approve <index>   Godkänn post och flytta till promises");
    console.log("  reject <index> <orsak>  Avvisa post");
    process.exit(command ? 1 : 0);
}
