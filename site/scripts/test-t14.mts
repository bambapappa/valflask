/**
 * T14 (SPEC-FRAGEVAGEN.md §10) — körs mot byggd dist/:
 *  1. Varje aktiv delfråga renderar exakt 8 partirader på sin frågesida.
 *  2. Tomcells-copyn är BYTE-IDENTISK för alla partier (§2.4).
 *  3. /fragor listar alla frågor; /svangningar existerar.
 *  4. Inga quips förekommer på tomma celler (tystnad kommenteras inte).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const DIST = resolve(ROOT, "site/dist");
const DATA = resolve(ROOT, "data");

let errors = 0;
function check(label: string, cond: boolean, msg?: string) {
  if (cond) console.log(`  OK: ${label}`);
  else {
    console.error(`FAIL: ${label}${msg ? ` — ${msg}` : ""}`);
    errors++;
  }
}

interface IssueEntry {
  slug: string;
  title: string;
  status: string;
  subquestions: Array<{ id: string }>;
}

const issuesFile = JSON.parse(readFileSync(resolve(DATA, "issues.json"), "utf8")) as {
  issues: IssueEntry[];
};
const parties = JSON.parse(readFileSync(resolve(DATA, "parties.json"), "utf8")) as Array<{
  code: string;
}>;

console.log("=== T14: Frågevågen — grid, tomcells-copy, sidor ===");

const fragorHtml = readFileSync(resolve(DIST, "fragor/index.html"), "utf8");
for (const issue of issuesFile.issues) {
  check(`/fragor länkar /fraga/${issue.slug}`, fragorHtml.includes(`/fraga/${issue.slug}`));
}

check("/svangningar byggd", existsSync(resolve(DIST, "svangningar/index.html")));

const EMPTY_RE = /Inget tydligt besked funnet i våra källor[^<]*/g;

for (const issue of issuesFile.issues) {
  if (issue.status !== "aktiv") continue;
  const path = resolve(DIST, `fraga/${issue.slug}/index.html`);
  if (!existsSync(path)) {
    check(`/fraga/${issue.slug} byggd`, false);
    continue;
  }
  const html = readFileSync(path, "utf8");

  for (const sq of issue.subquestions) {
    const rowIds = parties.map((p) => `id="${sq.id}-${p.code}"`);
    const present = rowIds.filter((id) => html.includes(id)).length;
    check(`${issue.slug} · ${sq.id}: 8 partirader`, present === 8, `${present}/8`);
  }

  // Tomcells-copy: alla förekomster på sidan ska vara byte-identiska.
  const empties = [...new Set(html.match(EMPTY_RE) ?? [])].map((s) => s.trim());
  check(
    `${issue.slug}: tomcells-copy identisk`,
    empties.length <= 1,
    `varianter: ${JSON.stringify(empties)}`,
  );

  check(
    `${issue.slug}: ingen marginalanteckning (quip) på frågesidan i tomt läge`,
    !html.includes("MARGINALANTECKNING"),
  );
}

// Tomcells-copyn ska dessutom vara identisk MELLAN partisidorna.
const partyEmpty = new Set<string>();
for (const p of parties) {
  const html = readFileSync(resolve(DIST, `parti/${p.code}/index.html`), "utf8");
  for (const m of html.match(EMPTY_RE) ?? []) partyEmpty.add(m.trim());
}
check("partisidor: tomcells-copy identisk över alla 8", partyEmpty.size <= 1, JSON.stringify([...partyEmpty]));

if (errors > 0) {
  console.error(`\nT14: ${errors} fel`);
  process.exit(1);
}
console.log("\nT14: grönt");
