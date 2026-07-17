/**
 * Engångsrättning (extern granskning 2026-07-16): fyra besked hade
 * Wayback-kopior ÄLDRE än sidinnehållet — snapshotten innehöll inte citatet
 * och backade därmed inte beskedet. Availability-API:t ger "närmaste" kopia,
 * inte nödvändigtvis en som täcker dagens text.
 *
 * För varje angiven post: begär FÄRSK Wayback-save av källan, verifiera att
 * citatet står ordagrant i den nya snapshotten, och skriv först då. Går det
 * inte sätts archive_url till null — en ärlig lucka som rot-watchen försöker
 * stänga veckovis (numera med samma citatverifiering).
 *
 * Körning:  node --import tsx/esm scripts/fix-stale-archives.mts <st-id> [...]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { archiveViaWayback, archiveViaArchiveToday } from "../src/archive.ts";
import { snapshotBacksQuote } from "../src/archive-verify.ts";
import { validateStanceInvariants, type IssuesFile, type StanceCell } from "../src/stances.ts";

const ROOT = resolve(import.meta.dirname, "../../");
const DATA = join(ROOT, "data");
const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("Ange statement-id:n: fix-stale-archives.mts st-2026-0045 ...");
  process.exit(1);
}

const cells = JSON.parse(readFileSync(join(DATA, "stances.json"), "utf8")) as StanceCell[];
const issuesFile = JSON.parse(readFileSync(join(DATA, "issues.json"), "utf8")) as IssuesFile;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let fixedCount = 0;
let clearedCount = 0;
for (const cell of cells) {
  for (const st of cell.statements) {
    if (!ids.includes(st.id)) continue;
    const base = st.source.url.split("#")[0]!;
    console.log(`\n${st.id} (${cell.subquestion_id} × ${cell.party}): färsk save av ${base}`);

    let snap = (await archiveViaWayback(base)).archive_url;
    if (snap && (await snapshotBacksQuote(snap, st.quote)) !== true) {
      console.log(`  save gav snapshot utan citatet — väntar på indexering och provar igen`);
      await sleep(30_000);
      snap = (await archiveViaWayback(base)).archive_url;
      if (snap && (await snapshotBacksQuote(snap, st.quote)) !== true) snap = null;
    }
    if (!snap) {
      const today = (await archiveViaArchiveToday(base)).archive_url;
      snap = today && (await snapshotBacksQuote(today, st.quote)) === true ? today : null;
    }

    if (snap) {
      st.source.archive_url = snap;
      fixedCount++;
      console.log(`  ✓ citat-backat arkiv: ${snap.slice(0, 90)}`);
    } else {
      st.source.archive_url = null;
      clearedCount++;
      console.log(`  – ingen citat-backad kopia gick att få nu; archive_url = null (rot-watchen försöker veckovis)`);
    }
    await sleep(4_000);
  }
}

const rsErrors = validateStanceInvariants(issuesFile, cells);
if (rsErrors.length > 0) {
  console.error(`RS-brott — INGET skrivs:\n  ${rsErrors.join("\n  ")}`);
  process.exit(1);
}
writeFileSync(join(DATA, "stances.json"), JSON.stringify(cells, null, 2) + "\n");
console.log(`\nKLART: ${fixedCount} arkiv ersatta med citat-backade kopior, ${clearedCount} nollställda i väntan på rot-watch.`);
