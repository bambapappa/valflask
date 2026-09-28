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
import { join, resolve } from "node:path";
import { lasFillage, skapaFilpaket, skrivFilpaket } from "../src/datatransaktion.ts";
import {
  buildSkeleton,
  validateStanceInvariants,
  type IssuesFile,
  type StanceCell,
} from "../src/stances.ts";

const ROOT = resolve(import.meta.dirname, "../../");
const DATA = join(ROOT, "data");
const STANCES_PATH = join(DATA, "stances.json");

const fore = lasFillage(DATA, ["issues.json", "stances.json"]);
if (typeof fore["issues.json"] !== "string") throw new Error("Frågeskelettet kräver frågelistan");
const issuesFile = JSON.parse(fore["issues.json"]) as IssuesFile;
const existing: StanceCell[] = typeof fore["stances.json"] === "string" ? JSON.parse(fore["stances.json"]) as StanceCell[] : [];

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

skrivFilpaket(DATA, skapaFilpaket(fore, {
  "issues.json": fore["issues.json"],
  "stances.json": JSON.stringify(cells, null, 2) + "\n",
}));
console.log(`Skrev ${STANCES_PATH}: ${cells.length} celler (${added >= 0 ? `+${added}` : added} nya), RS1–RS5 gröna.`);
