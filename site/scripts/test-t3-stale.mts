import { readFileSync, writeFileSync, existsSync, copyFileSync, renameSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const DATA_DIR = resolve(ROOT, "data");
const SITE_DIR = resolve(ROOT, "site");
const DIST_DIR = resolve(SITE_DIR, "dist");

const PROMISES_PATH = resolve(DATA_DIR, "promises.json");
const BACKUP_PATH = resolve(DATA_DIR, "promises.json.bak");

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

console.log("=== T3-stale: Stale banner verification ===");

// Backup
if (!existsSync(PROMISES_PATH)) {
  fail("promises.json not found");
  process.exit(1);
}
copyFileSync(PROMISES_PATH, BACKUP_PATH);

// Modify fetched_at to >36h ago AND set at least one run_id to non-fixture
// so that isFixture=false and stale banner can appear
const OLD_DATE = new Date(Date.now() - (37 * 60 * 60 * 1000)).toISOString();
const promises = JSON.parse(readFileSync(PROMISES_PATH, "utf8"));
for (const p of promises) {
  if (p.source && p.source.fetched_at) {
    p.source.fetched_at = OLD_DATE;
  }
}
// Make all promises non-fixture so isFixture returns false
for (const p of promises) {
  p.extraction.run_id = "pipeline-2026-06-01T00:00:00";
}
writeFileSync(PROMISES_PATH, JSON.stringify(promises, null, 2) + "\n");

// Build
console.log("\n--- Building with stale data ---");
try {
  execSync("pnpm build", { cwd: SITE_DIR, stdio: "inherit" });
} catch (e) {
  fail("Build failed with stale data");
  // Restore
  renameSync(BACKUP_PATH, PROMISES_PATH);
  process.exit(1);
}

// Check stale banner
console.log("\n--- Checking stale banner ---");
const indexPath = resolve(DIST_DIR, "index.html");
if (existsSync(indexPath)) {
  const content = readFileSync(indexPath, "utf8");
  const hasStaleBanner = content.includes("Senast uppdaterad") && content.includes("data kan vara inaktuell");
  check("stale banner present in index.html", hasStaleBanner);
  // Ensure it does NOT show fixture text
  const hasFixture = content.includes("EXEMPELDATA");
  if (hasFixture) {
    check("fixture banner NOT shown when stale (fixture=false)", !hasFixture);
  }
} else {
  fail("index.html not found in dist");
}

// Restore
renameSync(BACKUP_PATH, PROMISES_PATH);

console.log("");
console.log(errors === 0 ? "T3-stale: ALL CHECKS PASSED" : `T3-stale: ${errors} FAILURES`);
process.exit(errors);
