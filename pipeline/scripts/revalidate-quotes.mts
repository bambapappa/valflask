/**
 * Verbatim-revalidering av HELA det publicerade beståndet: hämtar varje löftes
 * käll-URL live (samma page-väg som pipelinen, inkl. PDF-extraktion) och
 * kontrollerar att citatet fortfarande återfinns ordagrant (G3-normaliserat).
 *
 *   node --import tsx/esm scripts/revalidate-quotes.mts [rapportfil.json]
 *
 * Utfall per löfte:
 *   OK             citatet återfinns i den levande källan
 *   SAKNAS         källan svarar men citatet finns inte längre (omskriven sida?)
 *   ONÅBAR         källan svarar inte (404/timeout) — arkivlänken är då beviset
 *   EJ_TEXTKÄLLA   video (YouTube) — verifieras genom att titta, inte grep:as
 *
 * SAKNAS/ONÅBAR är inte automatiskt fel (facit-README: en omskriven sida
 * signalerar att löftet flyttat, inte att fångsten var fel) — men de är
 * exakt det en granskare snubblar på, så de ska triageras: arkiv-fallback,
 * ny käll-URL eller retract. Kör före varje större publik exponering.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { join } from "node:path";
import { LiveSource } from "../src/fetch.ts";
import { normalizeForVerbatim } from "../src/gates.ts";

const DATA_DIR = join(import.meta.dirname, "../../data");
const reportPath = process.argv[2] ?? join(import.meta.dirname, "../.report/revalidate-quotes.json");

interface Promise_ {
  id: string;
  parties: string[];
  title: string;
  quote: string;
  status: string;
  source: { url: string; archive_url: string | null };
}

const promises = (JSON.parse(readFileSync(join(DATA_DIR, "promises.json"), "utf8")) as Promise_[])
  .filter((p) => p.status === "aktiv");

const isVideo = (u: string) => /youtube\.com|youtu\.be|svtplay\.se\/video/.test(u);
const baseOf = (u: string) => u.replace(/#.*$/u, "");

const urls = [...new Set(promises.filter((p) => !isVideo(p.source.url)).map((p) => baseOf(p.source.url)))];
console.log(`${promises.length} aktiva löften, ${urls.length} text-källor att hämta …`);

const source = new LiveSource({
  feeds: urls.map((url, i) => ({ id: `rv${i}`, type: "page" as const, url })),
  limits: { max_articles_per_run: 10000, min_chars: 1 },
});
const articles = await source.fetch();
const textByUrl = new Map<string, string>();
for (const a of articles) {
  const b = baseOf(a.url);
  textByUrl.set(b, `${textByUrl.get(b) ?? ""} ${normalizeForVerbatim(a.text)}`);
}

// Riksdagen-dokument: HTML-sidan saknar ofta fulltexten — hämta .text-varianten
// som fallback innan ett citat döms som SAKNAS.
const riksdagenMisses = new Set<string>();
for (const p of promises) {
  const b = baseOf(p.source.url);
  if (!b.includes("data.riksdagen.se/dokument/")) continue;
  const t = textByUrl.get(b);
  if (t && !t.includes(normalizeForVerbatim(p.quote))) riksdagenMisses.add(b);
}
if (riksdagenMisses.size > 0) {
  const fallback = new LiveSource({
    feeds: [...riksdagenMisses].map((u, i) => ({ id: `rvt${i}`, type: "page" as const, url: `${u}.text` })),
    limits: { max_articles_per_run: 10000, min_chars: 1 },
  });
  for (const a of await fallback.fetch()) {
    const b = baseOf(a.url).replace(/\.text$/u, "");
    textByUrl.set(b, `${textByUrl.get(b) ?? ""} ${normalizeForVerbatim(a.text)}`);
  }
}

type Verdict = "OK" | "SAKNAS" | "ONÅBAR" | "EJ_TEXTKÄLLA";
const rows: Array<{ id: string; parti: string; verdict: Verdict; archive: boolean; url: string; title: string }> = [];
const counts: Record<Verdict, number> = { OK: 0, SAKNAS: 0, "ONÅBAR": 0, "EJ_TEXTKÄLLA": 0 };

for (const p of promises) {
  const b = baseOf(p.source.url);
  let verdict: Verdict;
  if (isVideo(b)) verdict = "EJ_TEXTKÄLLA";
  else {
    const t = textByUrl.get(b);
    if (t === undefined) verdict = "ONÅBAR";
    else verdict = t.includes(normalizeForVerbatim(p.quote)) ? "OK" : "SAKNAS";
  }
  counts[verdict]++;
  rows.push({ id: p.id, parti: p.parties.join(","), verdict, archive: !!p.source.archive_url, url: b, title: p.title.slice(0, 60) });
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(rows, null, 1));
console.log(`\nResultat: ${counts.OK} OK, ${counts.SAKNAS} SAKNAS, ${counts["ONÅBAR"]} onåbara, ${counts["EJ_TEXTKÄLLA"]} video.`);
for (const r of rows.filter((r) => r.verdict === "SAKNAS" || r.verdict === "ONÅBAR")) {
  console.log(`  ${r.verdict === "SAKNAS" ? "❌" : "🔌"} ${r.id} [${r.parti}] arkiv:${r.archive ? "ja" : "NEJ"} ${r.url.slice(0, 65)} | ${r.title}`);
}
console.log(`\nRapport: ${reportPath}`);
process.exitCode = counts.SAKNAS + counts["ONÅBAR"] > 0 ? 1 : 0;
