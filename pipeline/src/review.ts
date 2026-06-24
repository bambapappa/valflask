import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(import.meta.dirname, "../../data");

interface CostShape {
  type: string;
  period: string;
  msek_low: number;
  msek_base: number;
  msek_high: number;
  basis: string;
  basis_url: string | null;
  method_note: string;
  confidence: number;
}

interface ReviewCandidate {
  candidate: {
    title?: string;
    parties?: string[];
    quote?: string;
    category?: string;
    person?: { name: string; role: string } | null;
    amount_in_text_msek?: number | null;
  };
  failures: Array<{ gate: string; reason: string }>;
  articleUrl: string;
  articleTitle: string;
  verifyReason?: string;
  costReason?: string;
  manualReason?: string;
  duplicateOf?: string;
  cost?: CostShape;
}

interface PromiseEntry {
  id: string;
  group_id: string | null;
  title: string;
  slug: string;
  parties: string[];
  person: { name: string; role: string } | null;
  quote: string;
  date_stated: string;
  source: { url: string; domain: string; archive_url: string | null; fetched_at: string };
  category: string;
  cost: Record<string, unknown>;
  financing_claimed: Record<string, unknown>;
  comparisons: string[];
  quip: string | null;
  status: string;
  history: unknown[];
  extraction: Record<string, unknown>;
}

function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s.length > 0 ? s : "lofte";
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function saveJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return ""; // manuell källa kan vara fritext (t.ex. "SVT Aktuellt, rikssänt")
  }
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
    if (item.manualReason) reasons.push(`manuell: ${item.manualReason}`);
    if (item.duplicateOf) {
      reasons.push(
        item.duplicateOf.startsWith("p-")
          ? `möjlig dublett av ${item.duplicateOf} (länka: approve ${i} --group ${item.duplicateOf}, annars avvisa)`
          : "möjlig dublett inom samma körning",
      );
    }

    console.log(`[${i}] ${title}`);
    console.log(`    Partier: ${parties}`);
    console.log(`    Källa: ${item.articleUrl}`);
    if (item.cost) {
      console.log(
        `    Kostnad: ${item.cost.msek_base} msek (${item.cost.msek_low}–${item.cost.msek_high}), ` +
          `${item.cost.basis}, conf ${item.cost.confidence}`,
      );
    }
    if (reasons.length > 0) console.log(`    Anledning: ${reasons.join("; ")}`);
    console.log();
  }

  console.log(`Totalt: ${items.length} post(er) i needs_review.`);
}

function nextId(promises: PromiseEntry[]): string {
  const maxNum = promises.reduce((max, p) => {
    const m = p.id.match(/^p-2026-(\d+)$/);
    return m ? Math.max(max, parseInt(m[1]!, 10)) : max;
  }, 0);
  return `p-2026-${String(maxNum + 1).padStart(4, "0")}`;
}

function approve(rawArgs: string[], dataDir: string = DATA_DIR): void {
  // Plocka ut --group <id> / --group=<id> (länkning av dublett) ur argumenten.
  let linkTo: string | undefined;
  const args: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i]!;
    if (a === "--group") {
      linkTo = rawArgs[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--group=")) {
      linkTo = a.slice("--group=".length);
      continue;
    }
    args.push(a);
  }

  const index = parseInt(args[0] ?? "", 10);
  const items = loadJson<ReviewCandidate[]>(join(dataDir, "needs_review.json"));

  if (Number.isNaN(index) || index < 0 || index >= items.length) {
    console.error(`Ogiltigt index: ${args[0]}. Tillgängliga: 0–${items.length - 1}`);
    process.exit(1);
  }

  const item = items[index]!;
  const cand = item.candidate ?? {};

  // Kostnad: bär med beräknad kostnad; tillåt manuell override <low> <base> <high>.
  let cost: CostShape | null = item.cost ?? null;
  if (args.length >= 4) {
    const low = Number(args[1]);
    const base = Number(args[2]);
    const high = Number(args[3]);
    if (![low, base, high].every((n) => Number.isFinite(n) && n >= 0)) {
      console.error("Ogiltiga belopp. Användning: approve <index> <low> <base> <high> (msek)");
      process.exit(1);
    }
    cost = {
      type: cost?.type ?? "utgift",
      period: cost?.period ?? "per_ar",
      msek_low: Math.round(low),
      msek_base: Math.round(base),
      msek_high: Math.round(high),
      basis: cost?.basis ?? "media",
      basis_url: cost?.basis_url ?? null,
      method_note: ((cost?.method_note ?? "") + " (belopp satt av granskare)").trim(),
      confidence: 0.9,
    };
  }

  if (!cost) {
    console.error(
      "Posten saknar kostnad. Ange den: pnpm review approve " + index + " <low> <base> <high> (msek)",
    );
    process.exit(1);
  }

  const promises = loadJson<PromiseEntry[]>(join(dataDir, "promises.json"));
  const newId = nextId(promises);
  const title = cand.title ?? item.articleTitle ?? "Okänt löfte";

  // Dublettlänkning: dela group_id med målet (R3 räknar gruppen en gång).
  let group_id: string | null = null;
  if (linkTo) {
    const target = promises.find((p) => p.id === linkTo);
    if (!target) {
      console.error(`Hittade inget löfte att länka till: ${linkTo}`);
      process.exit(1);
    }
    group_id = target.group_id ?? `g-${linkTo}`;
    if (!target.group_id) target.group_id = group_id;
  }

  const newPromise: PromiseEntry = {
    id: newId,
    group_id,
    title,
    slug: slugify(title),
    parties: cand.parties ?? [],
    person: cand.person ?? null,
    quote: cand.quote ?? "",
    date_stated: new Date().toISOString().slice(0, 10),
    source: {
      url: item.articleUrl,
      domain: domainOf(item.articleUrl),
      archive_url: null,
      fetched_at: new Date().toISOString(),
    },
    category: cand.category ?? "övrigt",
    cost: { ...cost },
    financing_claimed: {
      described: false,
      summary: null,
      msek: cand.amount_in_text_msek ?? null,
    },
    comparisons: [],
    quip: null,
    status: "aktiv",
    history: [],
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

  const linkNote = group_id ? ` [länkad till group ${group_id}]` : "";
  console.log(`Godkänd: ${newId} "${title}" — ${cost.msek_base} msek (${cost.basis})${linkNote}`);
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

/**
 * Manuell inrapportering av ett löfte modellen missat (t.ex. uttalande i
 * rikssänd TV). Läser en JSON-fil och lägger den i needs_review för granskning —
 * granskaren vouchar för källan vid approve. Mall: {title, parties, quote,
 * category, source, date_stated?, amount_in_text_msek?, person?, cost?}.
 */
function add(file: string | undefined, dataDir: string = DATA_DIR): void {
  if (!file) {
    console.error('Användning: pnpm review add <fil.json>');
    console.error('  Filen ska innehålla: {"title","parties":["s"],"quote","category","source", ...}');
    process.exit(1);
  }
  const m = loadJson<Record<string, unknown>>(file);
  for (const req of ["title", "parties", "quote", "source"]) {
    if (!m[req]) {
      console.error(`Manuell post saknar obligatoriskt fält: ${req}`);
      process.exit(1);
    }
  }

  const VALID_PARTIES = ["s", "m", "sd", "c", "v", "kd", "l", "mp"];
  const VALID_CATEGORIES = [
    "välfärd", "skatter", "försvar", "klimat-miljö", "rättsväsende",
    "utbildning", "infrastruktur", "migration", "övrigt",
  ];
  if (!/^https:\/\//.test(String(m.source))) {
    console.error(
      "Källan måste vara en https-länk — löften behöver en citerbar URL (t.ex. SVT-programmets sida eller klipp).",
    );
    process.exit(1);
  }
  const parties = m.parties as unknown;
  if (!Array.isArray(parties) || parties.length === 0 || !parties.every((p) => VALID_PARTIES.includes(String(p)))) {
    console.error(`"parties" måste vara minst en kod ur: ${VALID_PARTIES.join(", ")}`);
    process.exit(1);
  }
  const category = m.category ? String(m.category) : "övrigt";
  if (!VALID_CATEGORIES.includes(category)) {
    console.error(`Ogiltig kategori. Tillåtna: ${VALID_CATEGORIES.join(", ")}`);
    process.exit(1);
  }

  const entry: ReviewCandidate = {
    candidate: {
      title: String(m.title),
      parties: m.parties as string[],
      quote: String(m.quote),
      category: m.category ? String(m.category) : "övrigt",
      person: (m.person as { name: string; role: string } | null) ?? null,
      amount_in_text_msek: (m.amount_in_text_msek as number | null) ?? null,
    },
    failures: [],
    articleUrl: String(m.source),
    articleTitle: String(m.title),
    manualReason: "Manuellt inrapporterad — granska källans trovärdighet och sätt kostnad",
  };
  if (m.cost) entry.cost = m.cost as CostShape;

  const items = loadJson<ReviewCandidate[]>(join(dataDir, "needs_review.json"));
  items.push(entry);
  saveJson(join(dataDir, "needs_review.json"), items);

  console.log(`Tillagd i needs_review som [${items.length - 1}]: "${m.title}".`);
  console.log(
    `Godkänn med: pnpm review approve ${items.length - 1} <low> <base> <high>   (msek, om inget belopp angetts)`,
  );
}

const [, , command, ...args] = process.argv;

switch (command) {
  case "list":
    list();
    break;
  case "approve":
    if (!args[0]) {
      console.error("Användning: pnpm review approve <index> [low base high]");
      process.exit(1);
    }
    approve(args);
    break;
  case "reject":
    if (!args[0] || !args[1]) {
      console.error("Användning: pnpm review reject <index> <orsak>");
      process.exit(1);
    }
    reject(args[0], args.slice(1).join(" "));
    break;
  case "add":
    add(args[0]);
    break;
  default:
    console.log("Användning: pnpm review <list|approve|reject|add>");
    console.log("  list                         Visa poster i needs_review");
    console.log("  approve <index> [low base high] [--group p-XXXX]  Godkänn; kostnad; länka dublett");
    console.log("  reject <index> <orsak>       Avvisa post");
    console.log("  add <fil.json>               Lägg in ett manuellt inrapporterat löfte för granskning");
    process.exit(command ? 1 : 0);
}
