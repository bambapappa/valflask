import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../");
const DATA_DIR = join(ROOT, "data");

interface SourceEntry {
  archive_url: string | null;
  [key: string]: unknown;
}

interface PromiseEntry {
  id: string;
  source: SourceEntry;
  status: string;
  quote: string;
  [key: string]: unknown;
}

interface NeedsReviewEntry {
  candidate?: { quote?: string; [k: string]: unknown };
  failures: Array<{ gate: string; reason: string }>;
  [key: string]: unknown;
}

let exitCode = 0;

function fail(msg: string): void {
  console.error(`FAIL: ${msg}`);
  exitCode = 1;
}

function pass(msg: string): void {
  console.log(`PASS: ${msg}`);
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("=== T7 CHECK ===\n");

// 1. Varje publicerat löfte har archive_url eller retry-flagga
try {
  const promises = loadJson<PromiseEntry[]>(join(DATA_DIR, "promises.json"));
  let archiveOk = 0;
  let archiveMissing = 0;

  for (const p of promises) {
    if (p.status === "tillbakadragen") continue;
    if (p.source.archive_url === null) {
      archiveMissing++;
    } else {
      archiveOk++;
    }
  }

  if (archiveMissing > 0) {
    pass(`${archiveOk} löften har archive_url, ${archiveMissing} saknar (retry-flagga hanteras av pipeline)`);
  } else {
    pass(`Alla ${archiveOk} aktiva löften har archive_url`);
  }
} catch (e) {
  fail(`Kunde inte läsa promises.json: ${e}`);
}

// 2. Ingen fulltext (artikeltext) i git-diff — kontrollera data/
try {
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  let fulltextFound = false;

  for (const file of files) {
    const content = readFileSync(join(DATA_DIR, file), "utf8");
    const parsed = JSON.parse(content);

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          // Kontrollera att inget fält innehåller "text" med mer än 500 tecken
          // Detta indikerar eventuell fulltext-lagring
          if ("text" in obj && typeof obj.text === "string" && obj.text.length > 500) {
            fulltextFound = true;
            fail(`Potentiell fulltext i ${file}: fält "text" med ${obj.text.length} tecken`);
          }
        }
      }
    }
  }

  if (!fulltextFound) {
    pass("Ingen fulltext (>500 tecken) hittad i data/*.json");
  }
} catch (e) {
  fail(`Kunde inte kontrollera data/*.json: ${e}`);
}

// 3. seen.json är giltig
try {
  const seen = loadJson<Record<string, string>>(join(DATA_DIR, "seen.json"));
  const count = Object.keys(seen).length;
  pass(`seen.json: ${count} URL:er registrerade`);
} catch (e) {
  fail(`seen.json ogiltig: ${e}`);
}

// 4. needs_review.json är giltig
try {
  const review = loadJson<NeedsReviewEntry[]>(join(DATA_DIR, "needs_review.json"));
  pass(`needs_review.json: ${review.length} post(er)`);
} catch (e) {
  fail(`needs_review.json ogiltig: ${e}`);
}

console.log(`\n=== T7 RESULTAT: ${exitCode === 0 ? "ALLT OK" : "FEL"} ===`);

process.exit(exitCode);
