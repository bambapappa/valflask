import { cachat, hamtaJson } from "./scripts/kallcache.mts";
import { tabeller } from "./src/anslagstabell.ts";
const dok = process.argv[2]!;
const idxs = process.argv.slice(3).map(Number);
const payload = (await cachat(`dokstatus-${dok}`, () =>
  hamtaJson(`https://data.riksdagen.se/dokumentstatus/${dok}.json`))) as any;
const t = tabeller(payload.dokumentstatus.dokument.html);
for (const i of idxs) {
  console.log(`\n=== TABELL ${i} ===`);
  t[i]!.forEach((r) => console.log("  |", r.join(" | ")));
}
