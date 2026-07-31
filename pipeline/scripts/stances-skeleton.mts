/**
 * Frågevågen V0 — genererar/kompletterar data/stances.json till RS1
 * (varje aktiv delfråga × 8 partier exakt en gång).
 *
 * Idempotent och icke-destruktiv: befintliga celler röres aldrig, saknade
 * läggs till tomma. Körs när frågelistan ändras (ny fråga/delfråga via PR).
 *
 *   pnpm stances:skeleton            skriv data/stances.json
 *   pnpm stances:skeleton --check    validera enbart (exit 1 vid RS-brott)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildSkeleton,
  validateStanceInvariants,
  type IssuesFile,
  type StanceCell,
} from "../src/stances.ts";

const ROOT = resolve(import.meta.dirname, "../../");
const ISSUES_PATH = join(ROOT, "data", "issues.json");
const STANCES_PATH = join(ROOT, "data", "stances.json");

const issuesFile = JSON.parse(readFileSync(ISSUES_PATH, "utf8")) as IssuesFile;
const existing: StanceCell[] = existsSync(STANCES_PATH)
  ? (JSON.parse(readFileSync(STANCES_PATH, "utf8")) as StanceCell[])
  : [];

const cells = buildSkeleton(issuesFile, existing);
const errors = validateStanceInvariants(issuesFile, cells);

if (errors.length > 0) {
  console.error(`RS-brott (${errors.length}):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

const added = cells.length - existing.length;
if (process.argv.includes("--check")) {
  console.log(`OK: ${cells.length} celler, RS1–RS5 gröna${added > 0 ? ` (${added} saknas — kör utan --check)` : ""}`);
  process.exit(added > 0 ? 1 : 0);
}

writeFileSync(STANCES_PATH, JSON.stringify(cells, null, 2) + "\n", "utf8");
console.log(`Skrev ${STANCES_PATH}: ${cells.length} celler (${added >= 0 ? `+${added}` : added} nya), RS1–RS5 gröna.`);
