import { cachat, hamtaJson } from "./scripts/kallcache.mts";
import { tabeller } from "./src/anslagstabell.ts";
const dok = process.argv[2]!;
const payload = (await cachat(`dokstatus-${dok}`, () =>
  hamtaJson(`https://data.riksdagen.se/dokumentstatus/${dok}.json`))) as any;
const t = tabeller(payload.dokumentstatus.dokument.html);
t.forEach((rader, i) => {
  const rubrik = rader[0]!.join(" | ");
  if (/inkomsttitel/i.test(rubrik) || /inkomst/i.test(rubrik)) {
    console.log(`\n=== TABELL ${i} — ${rader.length} rader ===`);
    rader.forEach((r) => console.log("  |", r.join(" | ")));
  }
});
