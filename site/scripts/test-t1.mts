import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, "../dist");

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

console.log("=== T1: Build output verification ===");

check("dist/ exists", existsSync(DIST_DIR));

const requiredPaths = [
  "index.html",
  "api/index.html",
  "api/v1/summary.json",
  "api/v1/promises.json",
  "api/v1/parties.json",
  "api/v1/comparisons.json",
  "api/v1/changelog.json",
  "api/v1/integrity.json",
  "jamfor/index.html",
  "metod/index.html",
  "om/index.html",
  "press/index.html",
  "rattelser/index.html",
  "regeringar/index.html",
  "topplistor/index.html",
  "sok/index.html",
  "veckans-flask/2026-24/index.html",
  "rss.xml",
  "sitemap.xml",
  "llms.txt",
  "llms-full.txt",
  "lofte/p-2026-0001/hojd-a-kassa-90-procent/index.html",
  "parti/s/index.html",
  "parti/m/index.html",
  "parti/sd/index.html",
  "parti/c/index.html",
  "parti/v/index.html",
  "parti/kd/index.html",
  "parti/l/index.html",
  "parti/mp/index.html",
  "ledamot/magdalena-andersson/index.html",
  "og/start.png",
  "og/parti-s.png",
];

for (const p of requiredPaths) {
  const fullPath = resolve(DIST_DIR, p);
  check(`  ${p} exists`, existsSync(fullPath));
}

const lofteDir = resolve(DIST_DIR, "lofte");
if (existsSync(lofteDir)) {
  const lofteDirs = readdirSync(lofteDir).filter((d) => statSync(join(lofteDir, d)).isDirectory());
  check(`lofte pages ≥ 25`, lofteDirs.length >= 25, `got ${lofteDirs.length}`);
}

const ledamotDir = resolve(DIST_DIR, "ledamot");
if (existsSync(ledamotDir)) {
  const ledamotDirs = readdirSync(ledamotDir).filter((d) => statSync(join(ledamotDir, d)).isDirectory());
  check(`ledamot pages ≥ 1`, ledamotDirs.length >= 1, `got ${ledamotDirs.length}`);
}

console.log("");
console.log(errors === 0 ? "T1: ALL CHECKS PASSED" : `T1: ${errors} FAILURES`);
process.exit(errors);
