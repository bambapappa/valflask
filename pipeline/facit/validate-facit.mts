/**
 * Facit-validator: hämtar varje käll-URL live via samma page-väg som pipelinen
 * (LiveSource → fetchPage → stripHtml, med entitet-avkodning) och kontrollerar
 * för varje facit-löfte om citatet finns ordagrant i den hämtade texten — samma
 * verbatim-regel (normalizeForVerbatim) som grind G3.
 *
 *   node --import tsx/esm pipeline/facit/validate-facit.mts
 *
 * HITTAD  = B kan fånga löftet (texten nåbar + passerar G3).
 * SAKNAS  = gräv: sidan omskriven, citatet ändrat, eller sidan gick inte att hämta.
 *
 * Detta säger inget om huruvida LLM-A faktiskt plockar löftet — det är ett mjukare
 * steg i skarp körning. Validatorn mäter fångbarheten, inte urvalet.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LiveSource } from "../src/fetch.ts";
import { normalizeForVerbatim } from "../src/gates.ts";

interface FacitEntry {
  id: string;
  party: string | null;
  category: string;
  source_url: string | null;
  title: string;
  quote: string;
}
interface Facit {
  count: number;
  entries: FacitEntry[];
}

const facitPath = join(import.meta.dirname, "manifest-facit.json");
const facit = JSON.parse(readFileSync(facitPath, "utf8")) as Facit;

const urls = [...new Set(facit.entries.map((e) => e.source_url).filter((u): u is string => !!u))];

console.log(`Facit: ${facit.entries.length} löften, ${urls.length} käll-URL:er.\n`);
console.log("Hämtar sidorna via pipelinens page-väg …\n");

const source = new LiveSource({
  feeds: urls.map((url, i) => ({ id: `facit-${i}`, type: "page" as const, url })),
  limits: { max_articles_per_run: 100, min_chars: 1 },
});

const articles = await source.fetch();
const textByUrl = new Map<string, string>(articles.map((a) => [a.url, normalizeForVerbatim(a.text)]));

let hits = 0;
let misses = 0;
const missing: FacitEntry[] = [];

for (const url of urls) {
  const norm = textByUrl.get(url);
  const forUrl = facit.entries.filter((e) => e.source_url === url);
  console.log(`── ${url}`);
  if (norm === undefined) {
    console.log(`   ⚠️  sidan kunde inte hämtas — ${forUrl.length} löften kan inte kontrolleras\n`);
    misses += forUrl.length;
    missing.push(...forUrl);
    continue;
  }
  for (const e of forUrl) {
    const q = normalizeForVerbatim(e.quote);
    const found = q !== "" && norm.includes(q);
    if (found) hits++;
    else { misses++; missing.push(e); }
    console.log(`   ${found ? "✅ HITTAD" : "❌ SAKNAS"}  ${e.id} [${e.party}] ${e.title.slice(0, 52)}`);
  }
  console.log();
}

console.log(`Resultat: ${hits}/${facit.entries.length} hittade, ${misses} saknas.`);
if (missing.length) {
  console.log(`\nSaknas (gräv i dessa):`);
  for (const e of missing) console.log(`  ${e.id} [${e.party}] — ${e.source_url}\n    "${e.quote.slice(0, 90)}…"`);
  process.exitCode = 1;
}
