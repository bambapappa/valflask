/**
 * Data-clean-vakten — körs SIST i sajtens testkedja.
 *
 * Flera tester (t3-stale) muterar riktiga data/-filer och återställer efteråt.
 * En läcka är katastrofal i CI: pipeline.yml kör `git add data/` senare i
 * jobbet och hade committat föroreningen som produktionsdata. Denna vakt gör
 * att en läcka aldrig kan passera tyst: kvarlämnade .bak-filer eller ospårade
 * ändringar i data/ ⇒ rött bygge.
 */
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const DATA_DIR = resolve(ROOT, "data");

let errors = 0;

console.log("=== Data-clean: inga testrester i data/ ===");

const baks = readdirSync(DATA_DIR).filter((f) => f.endsWith(".bak"));
if (baks.length > 0) {
  console.error(`FAIL: kvarlämnade backupfiler i data/: ${baks.join(", ")}`);
  errors++;
} else {
  console.log("  OK: inga .bak-filer i data/");
}

try {
  const dirty = execSync("git status --porcelain -- data/", { cwd: ROOT, encoding: "utf8" }).trim();
  if (dirty !== "") {
    console.error(`FAIL: data/ har omodifierade ändringar efter testkörning (testläcka?):\n${dirty}`);
    errors++;
  } else {
    console.log("  OK: git ser data/ som orörd");
  }
} catch {
  // Ingen git tillgänglig (t.ex. tarball-miljö) — .bak-kontrollen ovan får räcka.
  console.log("  OK: (git ej tillgängligt — hoppar över status-kontrollen)");
}

if (errors > 0) {
  console.error(`\nData-clean: ${errors} fel — data/ måste återställas innan något committas.`);
  process.exit(1);
}
console.log("\nData-clean: grönt");
