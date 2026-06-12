import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, "../dist");
const DATA_DIR = resolve(__dirname, "../../data");

let errors = 0;

function fail(msg: string) {
  console.error(`FAIL: ${msg}`);
  errors++;
}

function check(label: string, condition: boolean, msg?: string) {
  if (condition) {
    console.log(`  OK: ${label}`);
  } else {
    fail(`${label}${msg ? ` — ${msg}` : ""}`);
  }
}

console.log("=== T9: SEO/AI layer verification ===");

// 1. summary.json: schema-valid + has generated_at + data_hash
console.log("\n--- summary.json ---");
const summaryPath = resolve(DIST_DIR, "api/v1/summary.json");
check("summary.json exists", existsSync(summaryPath));
if (existsSync(summaryPath)) {
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  check("summary.json has generated_at", typeof summary.generated_at === "string");
  check("summary.json has data_hash", typeof summary.data_hash === "string" && summary.data_hash.length === 64);
  check("summary.json has license", summary.license === "CC-BY-4.0");
  check("summary.json has data object", typeof summary.data === "object");
}

// 2. integrity.json: data_hash == sha256(kanonisk promises.json)
console.log("\n--- integrity.json ---");
const integrityPath = resolve(DIST_DIR, "api/v1/integrity.json");
check("integrity.json exists", existsSync(integrityPath));
if (existsSync(integrityPath)) {
  const integrity = JSON.parse(readFileSync(integrityPath, "utf8"));
  check("integrity.json has data_hash", typeof integrity.data_hash === "string");
  check("integrity.json has algorithm", integrity.algorithm === "sha256");

  // Verify hash matches canonical promises
  // integrity.json hashes the raw data from data/promises.json (same as pipeline)
  const rawPromisesPath = resolve(DATA_DIR, "promises.json");
  if (existsSync(rawPromisesPath)) {
    const rawPromises = JSON.parse(readFileSync(rawPromisesPath, "utf8"));
    const canonical = canonicalStringify(rawPromises);
    const expectedHash = createHash("sha256").update(canonical).digest("hex");
    check("integrity data_hash matches sha256(promises)", integrity.data_hash === expectedHash, `expected ${expectedHash.slice(0, 16)}... got ${integrity.data_hash?.slice(0, 16)}...`);
  }
}

// 3. All API endpoints exist
console.log("\n--- API endpoints ---");
const apiEndpoints = [
  "api/v1/summary.json",
  "api/v1/promises.json",
  "api/v1/parties.json",
  "api/v1/comparisons.json",
  "api/v1/changelog.json",
  "api/v1/integrity.json",
];
for (const ep of apiEndpoints) {
  check(`${ep} exists`, existsSync(resolve(DIST_DIR, ep)));
}

// 4. CORS headers would be set by CDN (_headers file)
console.log("\n--- CORS ---");
const headersPath = resolve(__dirname, "../public/_headers");
if (existsSync(headersPath)) {
  const headersContent = readFileSync(headersPath, "utf8");
  check("_headers has CORS for /api/*", headersContent.includes("Access-Control-Allow-Origin: *"));
}

// 5. llms.txt and llms-full.txt
console.log("\n--- llms.txt ---");
const llmsPath = resolve(DIST_DIR, "llms.txt");
check("llms.txt exists (from public/)", existsSync(llmsPath));

const llmsFullPath = resolve(DIST_DIR, "llms-full.txt");
check("llms-full.txt exists", existsSync(llmsFullPath));
if (existsSync(llmsFullPath)) {
  const content = readFileSync(llmsFullPath, "utf8");
  check("llms-full.txt has Sammanfattning section", content.includes("## Sammanfattning"));
  check("llms-full.txt has Alla löften section", content.includes("## Alla löften"));
  check("llms-full.txt has API section", content.includes("## API"));
}

// 6. sitemap.xml valid
console.log("\n--- sitemap.xml ---");
const sitemapPath = resolve(DIST_DIR, "sitemap.xml");
check("sitemap.xml exists", existsSync(sitemapPath));
if (existsSync(sitemapPath)) {
  const content = readFileSync(sitemapPath, "utf8");
  check("sitemap has xml declaration", content.startsWith("<?xml"));
  check("sitemap has urlset", content.includes("<urlset"));
  check("sitemap has urls", content.includes("<url><loc>"));
  check("sitemap has start page", content.includes("https://drygast.nu/</loc>"));
  check("sitemap has promise pages", content.includes("/lofte/"));
  check("sitemap has party pages", content.includes("/parti/"));
}

// 7. rss.xml valid
console.log("\n--- rss.xml ---");
const rssPath = resolve(DIST_DIR, "rss.xml");
check("rss.xml exists", existsSync(rssPath));
if (existsSync(rssPath)) {
  const content = readFileSync(rssPath, "utf8");
  check("rss has xml declaration", content.startsWith("<?xml"));
  check("rss has channel", content.includes("<channel>"));
  check("rss has items", content.includes("<item>"));
  check("rss has guid", content.includes("<guid>"));
  check("rss has pubDate", content.includes("<pubDate>"));
}

// 8. JSON-LD parseable on pages
console.log("\n--- JSON-LD ---");
const htmlFiles = [
  "index.html",
  "api/index.html",
  "metod/index.html",
  "lofte/p-2026-0001/hojd-a-kassa-90-procent/index.html",
  "parti/s/index.html",
  "sok/index.html",
];
let jsonLdCount = 0;
for (const f of htmlFiles) {
  const fullPath = resolve(DIST_DIR, f);
  if (existsSync(fullPath)) {
    const content = readFileSync(fullPath, "utf8");
    const ldMatches = content.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g);
    if (ldMatches) {
      for (const m of ldMatches) {
        const jsonStr = m.replace(/<script type="application\/ld\+json">/, "").replace(/<\/script>/, "");
        try {
          JSON.parse(jsonStr);
          jsonLdCount++;
        } catch {
          fail(`JSON-LD parse error in ${f}`);
        }
      }
    }
  }
}
check("JSON-LD parseable on pages", jsonLdCount > 0, `found ${jsonLdCount} JSON-LD blocks`);

// 9. robots.txt
console.log("\n--- robots.txt ---");
const robotsPath = resolve(DIST_DIR, "robots.txt");
check("robots.txt exists", existsSync(robotsPath));
if (existsSync(robotsPath)) {
  const content = readFileSync(robotsPath, "utf8");
  check("robots.txt allows all", content.includes("User-agent: *") && content.includes("Allow: /"));
  check("robots.txt lists AI bots", content.includes("GPTBot") && content.includes("ClaudeBot") && content.includes("PerplexityBot"));
  check("robots.txt has sitemap", content.includes("Sitemap: https://drygast.nu/sitemap.xml"));
}

// 10. Canonical link on pages
console.log("\n--- Canonical links ---");
let canonicalCount = 0;
for (const f of htmlFiles) {
  const fullPath = resolve(DIST_DIR, f);
  if (existsSync(fullPath)) {
    const content = readFileSync(fullPath, "utf8");
    if (content.includes('rel="canonical"')) {
      canonicalCount++;
    }
  }
}
check("canonical links on pages", canonicalCount >= htmlFiles.length - 1, `found ${canonicalCount}/${htmlFiles.length}`);

console.log("");
console.log(errors === 0 ? "T9: ALL CHECKS PASSED" : `T9: ${errors} FAILURES`);
process.exit(errors);

function canonicalStringify(data: unknown): string {
  if (data === null || data === undefined) return "null";
  if (typeof data === "boolean") return data ? "true" : "false";
  if (typeof data === "number") return JSON.stringify(data);
  if (typeof data === "string") return JSON.stringify(data);
  if (Array.isArray(data)) {
    const items = data.map((v) => canonicalStringify(v));
    return `[${items.join(",")}]`;
  }
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((k) => {
      const val = canonicalStringify(obj[k]);
      return `${JSON.stringify(k)}:${val}`;
    });
    return `{${pairs.join(",")}}`;
  }
  return "null";
}
