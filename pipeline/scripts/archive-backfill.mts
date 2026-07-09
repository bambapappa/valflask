/**
 * Arkiv-backfill / retry-steg (SPEC §6.2: "Vid fel: archive_url = null +
 * automatiskt nytt försök nästa run tills satt"). Seed-import och review-
 * godkännanden sätter archive_url=null och pipelinens live-arkivering är skör,
 * så publicerade löften saknar arkivbevis. Detta steg fyller nullen i tre faser:
 *   A) Wayback availability-API — befintlig snapshot (nära fetched_at, annars valfri)
 *   B) SAVE-läge: begär Wayback-save för URL:er utan snapshot (bunden budget)
 *   C) vänta på indexering, kolla availability igen för de sparade
 * Robust mot rate-limits (retry+backoff, generös throttle). Idempotent: bara
 * archive_url===null behandlas; dedup på käll-URL utan #fragment. Uppdaterar
 * data/promises.json + changelog (updated + ny data_hash).
 *
 * Körning:  node --import tsx/esm scripts/archive-backfill.mts <mode> <maxSaves> <limit>
 *   mode=avail  (default) — bara fas A (befintliga snapshots)
 *   mode=save   — fas A + B + C (begär saves för det som saknas)
 * I pipelinen körs 'save' med lågt maxSaves varje run (gradvis, snällt mot Wayback).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const DATA = join(import.meta.dirname, "../../data");
const MODE = process.argv[2] ?? "avail";
const MAX_SAVES = parseInt(process.argv[3] ?? "0", 10) || (MODE === "save" ? 25 : 0);
const LIMIT = parseInt(process.argv[4] ?? "0", 10) || Infinity;
const UA = "DrygastBot/1.0 (+https://drygast.nu/om)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function canonical(d: unknown): string {
  if (d === null || d === undefined) return "null";
  if (typeof d === "boolean") return d ? "true" : "false";
  if (typeof d === "number" || typeof d === "string") return JSON.stringify(d);
  if (Array.isArray(d)) return "[" + d.map(canonical).join(",") + "]";
  const o = d as Record<string, unknown>;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canonical(o[k])).join(",") + "}";
}
const save = (path: string, data: unknown) => writeFileSync(path, JSON.stringify(data, null, 2) + "\n");

interface Promise_ { id: string; source: { url: string; archive_url: string | null; fetched_at?: string }; }
const promises = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Promise_[];

const stripFrag = (u: string) => u.split("#")[0]!;
const tsDigits = (iso?: string) => (iso ? iso.replace(/[^0-9]/g, "").slice(0, 14) : "");

const groups = new Map<string, { ids: string[]; ts: string }>();
for (const p of promises) {
  if (p.source.archive_url) continue;
  const key = stripFrag(p.source.url);
  const g = groups.get(key) ?? { ids: [], ts: tsDigits(p.source.fetched_at) };
  g.ids.push(p.id);
  groups.set(key, g);
}
const urls = [...groups.keys()].slice(0, LIMIT);
console.log(`Null-arkiv: ${promises.filter((p) => !p.source.archive_url).length} löften över ${groups.size} käll-URL:er. Läge=${MODE} maxSaves=${MAX_SAVES} behandlar=${urls.length}.`);

// Availability med retry+backoff (archive.org rate-limitar under snabb eld).
async function availabilityOnce(url: string, ts: string): Promise<string | null> {
  const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}${ts ? `&timestamp=${ts}` : ""}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(api, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const j = await res.json() as { archived_snapshots?: { closest?: { url?: string; available?: boolean } } };
        const c = j.archived_snapshots?.closest;
        if (c?.available && c.url) return c.url.replace(/^http:/, "https:");
        return null; // giltigt svar, ingen snapshot
      }
    } catch { /* timeout/nät → backoff */ }
    await sleep(2500 * (attempt + 1));
  }
  return null;
}
// Prova nära fetched_at (datumtrohet), fall tillbaka på valfri snapshot (träffsäkerhet).
async function availability(url: string, ts: string): Promise<string | null> {
  const dated = ts ? await availabilityOnce(url, ts) : null;
  if (dated) return dated;
  await sleep(1000);
  return availabilityOnce(url, "");
}
async function requestSave(url: string): Promise<void> {
  try {
    await fetch(`https://web.archive.org/save/${url}`, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60000) });
  } catch { /* best-effort; fas C avgör utfallet */ }
}

const resolved = new Map<string, string>(); // key(url utan frag) -> snapshot-URL
const needSave: string[] = [];

// --- Fas A: befintliga snapshots ---
console.log("Fas A: availability för befintliga snapshots...");
for (const key of urls) {
  const snap = await availability(key, groups.get(key)!.ts);
  if (snap) { resolved.set(key, snap); console.log(`  ✓ ${key} -> ${snap.slice(0, 60)}`); }
  else { needSave.push(key); console.log(`  – saknas: ${key}`); }
  await sleep(3000);
}

// --- Fas B: begär saves (bunden) ---
const saved: string[] = [];
if (MODE === "save") {
  let saves = 0;
  console.log(`Fas B: begär saves (budget ${MAX_SAVES}) för ${needSave.length} saknade...`);
  for (const key of needSave) {
    if (saves >= MAX_SAVES) break;
    if (/youtube\.com|youtu\.be/.test(key)) { console.log(`  (hoppar youtube) ${key}`); continue; }
    saves++;
    console.log(`  save (${saves}/${MAX_SAVES}): ${key}`);
    await requestSave(key);
    saved.push(key);
    await sleep(6000);
  }
}

// --- Fas C: vänta på indexering, omkoll av sparade ---
if (saved.length > 0) {
  console.log(`Fas C: väntar 90s på indexering, sedan omkoll av ${saved.length} sparade...`);
  await sleep(90000);
  for (const key of saved) {
    const snap = await availability(key, "");
    if (snap) { resolved.set(key, snap); console.log(`  ✓ (efter save) ${key}`); }
    else console.log(`  – ännu ej indexerad: ${key}`);
    await sleep(3000);
  }
}

// --- applicera (behåll ev. #fragment för PDF-sidhänvisning) ---
const changed: string[] = [];
for (const p of promises) {
  if (p.source.archive_url) continue;
  const snap = resolved.get(stripFrag(p.source.url));
  if (!snap) continue;
  const frag = p.source.url.includes("#") ? "#" + p.source.url.split("#")[1] : "";
  p.source.archive_url = snap + frag;
  changed.push(p.id);
}

if (changed.length > 0) {
  promises.sort((a, b) => a.id.localeCompare(b.id));
  save(join(DATA, "promises.json"), promises);
  const dataHash = createHash("sha256").update(canonical(promises)).digest("hex");
  const changelog = JSON.parse(readFileSync(join(DATA, "changelog.json"), "utf8")) as unknown[];
  changelog.push({
    run_id: `archive-backfill-${new Date().toISOString().slice(0, 10)}`,
    added: [], updated: changed, retracted: [],
    data_hash: dataHash, timestamp: new Date().toISOString(),
  });
  save(join(DATA, "changelog.json"), changelog);
  console.log(`\nKLART: ${changed.length} löften fick archive_url (${resolved.size}/${urls.length} URL:er lösta). Ny data_hash: ${dataHash.slice(0, 16)}…`);
} else {
  console.log("\nInga archive_url uppdaterade.");
}
console.log(`Kvar utan arkiv: ${promises.filter((p) => !p.source.archive_url).length} löften.`);
