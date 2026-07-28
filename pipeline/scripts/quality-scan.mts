/**
 * Kvalitetssökning över publicerade löften.
 *
 *   pnpm quality:scan              # alla tre sökningarna
 *   pnpm quality:scan --belopp     # bara belopp mot uträkning
 *   pnpm quality:scan --grupper    # bara löften som hör hemma i en grupp
 *   pnpm quality:scan --datid      # bara citat som beskriver genomförd politik
 *   pnpm quality:scan --strikt     # avsluta med felkod om något hittas
 *
 * Sökningen FÖRESLÅR bara. Den ändrar aldrig data, och en träff kan mycket väl
 * vara rätt prissatt — det är en människa som avgör. Bakgrunden till varje
 * sökning står i src/quality-scan.ts.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  findAmountMismatches,
  findUngroupedTwins,
  findCompletedPolicyQuotes,
  type ScanPromise,
} from "../src/quality-scan.ts";

const ROOT = resolve(import.meta.dirname, "../../");
const promises: ScanPromise[] = JSON.parse(
  readFileSync(join(ROOT, "data", "promises.json"), "utf8"),
);

const args = process.argv.slice(2);
const strict = args.includes("--strikt");
const only = args.filter((a) => a.startsWith("--") && a !== "--strikt");
const wants = (flag: string) => only.length === 0 || only.includes(flag);

function heading(text: string): void {
  console.log(`\n=== ${text} ===\n`);
}

let hits = 0;

if (wants("--belopp")) {
  heading("Belopp som inte stämmer med sin egen uträkning");
  const found = findAmountMismatches(promises);
  hits += found.length;
  if (found.length === 0) {
    console.log("  Inga.");
  } else {
    for (const f of found) {
      console.log(`  ${f.id} [${f.parties.join("/")}] ${f.direction}: ${f.detail}`);
    }
    const low = found.filter((f) => f.direction === "för lågt").length;
    console.log(`\n  ${found.length} träffar — ${low} för låga, ${found.length - low} för höga.`);
  }
}

if (wants("--grupper")) {
  heading("Löften som kan höra hemma i en befintlig grupp");
  const found = findUngroupedTwins(promises).filter((f) => f.score >= 0.25);
  hits += found.length;
  if (found.length === 0) {
    console.log("  Inga.");
  } else {
    for (const f of found.slice(0, 40)) {
      console.log(`  ${f.id} [${f.parties.join("/")}] → ${f.groupId} (${f.score.toFixed(2)})`);
      console.log(`      ${f.detail}`);
    }
    if (found.length > 40) console.log(`  … och ${found.length - 40} till.`);
    console.log(`\n  ${found.length} förslag. Många är falsklarm — läs citaten innan du länkar.`);
  }
}

if (wants("--datid")) {
  heading("Citat som kan beskriva genomförd politik utan åtagande");
  const found = findCompletedPolicyQuotes(promises);
  hits += found.length;
  if (found.length === 0) {
    console.log("  Inga.");
  } else {
    for (const f of found) {
      console.log(`  ${f.id} [${f.parties.join("/")}] ${f.detail}`);
    }
    console.log(`\n  ${found.length} träffar.`);
  }
}

console.log("");
if (strict && hits > 0) {
  console.error(`Sökningen hittade ${hits} poster att titta på.`);
  process.exit(1);
}
