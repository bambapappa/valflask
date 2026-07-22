/*
 * Budgetgrind (i stil med Fläskvågens T-serie): sajten skeppar aldrig råfilerna.
 * Mäter de skivade api/hv-nyttolasterna innan de byggs — en grind, inte en
 * förhoppning. Kör: npm test (från site/).
 */
import assert from "node:assert";
import { buildSummary, lofteIds, buildLofteDetalj, buildSokIndex } from "../src/lib/rutnat.ts";

const KB = 1024;
let fel = 0;
function grind(namn: string, bytes: number, tak: number) {
  const ok = bytes <= tak;
  console.log(`${ok ? "✓" : "✗"} ${namn}: ${(bytes / KB).toFixed(1)} KB (tak ${(tak / KB).toFixed(0)} KB)`);
  if (!ok) fel += 1;
}
function storlek(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v));
}

grind("summary.json", storlek(buildSummary()), 100 * KB);
grind("sok-index.json", storlek(buildSokIndex()), 400 * KB);

let störst = 0;
let störstId = "";
for (const id of lofteIds()) {
  const b = storlek(buildLofteDetalj(id));
  if (b > störst) { störst = b; störstId = id; }
}
grind(`största löftesdetalj (${störstId})`, störst, 500 * KB);

assert.strictEqual(fel, 0, `${fel} budgetgrind(ar) föll`);
console.log("budget: alla grindar gröna");
