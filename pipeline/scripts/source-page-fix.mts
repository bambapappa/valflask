/**
 * Engångskorrigering (ägarbeslut 2026-07-15): PDF-källänkar ska ankra på
 * citatets EXAKTA sida, inte chunkens första (#page=1/11/21… — artefakt av
 * PDF_PAGES_PER_CHUNK). Pipelinen gör nu uppslagningen själv vid publicering
 * (resolveQuotePage); detta script rättar det som redan ligger i data/:
 *
 *   1. stances.json + promises.json: varje post med .pdf-källa får #page satt
 *      till sidan där citatet står ordagrant (G3-kanon). Hittas inte citatet
 *      på en enskild sida (sidbryt) lämnas ankaret orört och loggas.
 *   2. stances.json: statements utan archive_url får Wayback-snapshot
 *      (befintlig i datat → availability-API → save), med samma #page-ankare.
 *      (Löftenas arkiv-backfill sköts redan löpande av archive-backfill.mts.)
 *   3. Poster som redan HAR archive_url får arkivankaret synkat med källans.
 *
 * Körning:  node --import tsx/esm scripts/source-page-fix.mts [--dry-run]
 * Idempotent; RS-validerar stances innan skrivning; promises får changelog-
 * post (updated + ny data_hash) enligt samma konvention som archive-backfill.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { extractPdfText } from "../src/fetch.ts";
import { normalizeForVerbatim, withPageAnchor } from "../src/gates.ts";
import { archiveViaArchiveToday } from "../src/archive.ts";
import { snapshotBacksQuote } from "../src/archive-verify.ts";
import { validateStanceInvariants, type IssuesFile, type StanceCell } from "../src/stances.ts";

const DATA = join(import.meta.dirname, "../../data");
const DRY_RUN = process.argv.includes("--dry-run");
const UA = "DrygastBot/1.0 (+https://drygast.nu/om)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isPdf = (u: string) => /\.pdf(?:#|$)/iu.test(u);
const stripFrag = (u: string) => u.split("#")[0]!;
const chunkStart = (u: string): number | null => {
  const m = u.match(/#page=(\d+)$/u);
  return m ? Number(m[1]) : null;
};

function canonical(d: unknown): string {
  if (d === null || d === undefined) return "null";
  if (typeof d === "boolean") return d ? "true" : "false";
  if (typeof d === "number" || typeof d === "string") return JSON.stringify(d);
  if (Array.isArray(d)) return "[" + d.map(canonical).join(",") + "]";
  const o = d as Record<string, unknown>;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canonical(o[k])).join(",") + "}";
}
const save = (path: string, data: unknown) => writeFileSync(path, JSON.stringify(data, null, 2) + "\n");

/* ─────────────────────────────────────────────── datat + gemensam vy ── */

interface SourceRef { url: string; archive_url: string | null }
interface Record_ { label: string; quote: string; source: SourceRef }

interface PromiseLite {
  id: string;
  quote: string;
  source: { url: string; archive_url: string | null; fetched_at?: string };
}

const cells = JSON.parse(readFileSync(join(DATA, "stances.json"), "utf8")) as StanceCell[];
const issuesFile = JSON.parse(readFileSync(join(DATA, "issues.json"), "utf8")) as IssuesFile;
const promises = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as PromiseLite[];

const stanceRecords: Record_[] = cells.flatMap((c) =>
  c.statements.map((st) => ({
    label: `${st.id} (${c.subquestion_id} × ${c.party})`,
    quote: st.quote,
    source: st.source,
  })),
);
const promiseRecords: Record_[] = promises.map((p) => ({
  label: p.id,
  quote: p.quote,
  source: p.source,
}));

/* ────────────────────────────── 1. exakt sida för alla PDF-citat ────── */

const pdfBases = new Set(
  [...stanceRecords, ...promiseRecords].filter((r) => isPdf(r.source.url)).map((r) => stripFrag(r.source.url)),
);

const pagesByBase = new Map<string, string[]>();
console.log(`Hämtar ${pdfBases.size} PDF-dokument...`);
for (const base of pdfBases) {
  const res = await fetch(base, {
    headers: { "User-Agent": UA, Accept: "application/pdf" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    console.error(`  FEL ${res.status}: ${base} — posterna för dokumentet lämnas orörda`);
    continue;
  }
  const pdf = await extractPdfText(new Uint8Array(await res.arrayBuffer()));
  pagesByBase.set(base, pdf.pages);
  console.log(`  ✓ ${base} (${pdf.pages.length} sidor)`);
}

/** Föredra träff inom det gamla chunk-fönstret (10 sidor) — global fallback. */
function findQuotePage(pages: string[], quote: string, oldAnchor: number | null): number | null {
  const needle = normalizeForVerbatim(quote);
  if (needle.length === 0) return null;
  const hit = (i: number) => normalizeForVerbatim(pages[i] ?? "").includes(needle);
  if (oldAnchor !== null) {
    for (let i = oldAnchor - 1; i < Math.min(oldAnchor + 9, pages.length); i++) {
      if (hit(i)) return i + 1;
    }
  }
  for (let i = 0; i < pages.length; i++) if (hit(i)) return i + 1;
  return null;
}

let anchorsFixed = 0;
const unresolved: string[] = [];
const changedPromiseIds = new Set<string>();

for (const r of [...stanceRecords, ...promiseRecords]) {
  if (!isPdf(r.source.url)) continue;
  const base = stripFrag(r.source.url);
  const pages = pagesByBase.get(base);
  if (!pages) continue;
  const page = findQuotePage(pages, r.quote, chunkStart(r.source.url));
  if (page === null) {
    unresolved.push(`${r.label}: citatet hittades inte på en enskild sida i ${base}`);
    continue;
  }
  const next = withPageAnchor(base, page);
  if (next !== r.source.url) {
    console.log(`  ${r.label}: ${r.source.url.slice(base.length) || "(inget ankare)"} → #page=${page}`);
    r.source.url = next;
    anchorsFixed++;
    if (/^p-/.test(r.label)) changedPromiseIds.add(r.label);
  }
  // Arkivankaret följer källans (Wayback serverar PDF:en genom samma visare).
  if (r.source.archive_url) {
    const synced = withPageAnchor(r.source.archive_url, page);
    if (synced !== r.source.archive_url) {
      r.source.archive_url = synced;
      if (/^p-/.test(r.label)) changedPromiseIds.add(r.label);
    }
  }
}
console.log(`\nAnkare korrigerade: ${anchorsFixed}. Olösta (sidbryt/saknad text): ${unresolved.length}`);
for (const u of unresolved) console.log(`  ! ${u}`);

/* ─────────────── 2. arkiv-backfill för stances (befintligt → save) ──── */

// Snapshot-cache: börja med det datat redan vet (samma dokument kan ha
// arkivkopia i en annan post — då behövs inget nätanrop alls).
const snapshotByBase = new Map<string, string>();
for (const r of [...stanceRecords, ...promiseRecords]) {
  const a = r.source.archive_url;
  if (!a) continue;
  const m = a.match(/^https?:\/\/web\.archive\.org\/web\/\d{4,14}(?:[a-z_]*)\/(.+)$/u);
  if (m) snapshotByBase.set(stripFrag(m[1]!), stripFrag(a));
}

async function availability(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const j = await res.json() as { archived_snapshots?: { closest?: { url?: string; available?: boolean } } };
        const c = j.archived_snapshots?.closest;
        return c?.available && c.url ? c.url.replace(/^http:/u, "https:") : null;
      }
    } catch { /* timeout/nät → backoff */ }
    await sleep(2500 * (attempt + 1));
  }
  return null;
}

async function requestSave(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://web.archive.org/save/${url}`, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(120000),
    });
    if (res.url.includes("web.archive.org/web/")) return stripFrag(res.url);
  } catch { /* best-effort — availability-omkollen avgör */ }
  return null;
}

const needArchive = stanceRecords.filter((r) => !r.source.archive_url);
console.log(`\nStance-poster utan arkiv: ${needArchive.length}`);
let archivesSet = 0;

/** Ett arkiv accepteras ENDAST om citatet står ordagrant i snapshotten —
 * availability ger NÄRMASTE kopia, som kan vara äldre än sidinnehållet
 * (extern granskning 2026-07-16: 4 av 25 HTML-arkiv backade inte sitt citat). */
async function verified(snap: string | null, quote: string): Promise<string | null> {
  if (!snap) return null;
  return (await snapshotBacksQuote(snap, quote)) === true ? snap : null;
}

for (const r of needArchive) {
  const base = stripFrag(r.source.url);
  let snap: string | null = null;
  if (!DRY_RUN) {
    // Ordning: (1) redan känd kopia i datat, (2) befintlig hos Wayback,
    // (3) färsk save, (4) archive.today — allt citat-verifierat per post.
    snap = await verified(snapshotByBase.get(base) ?? null, r.quote);
    if (!snap) snap = await verified(await availability(base), r.quote);
    if (!snap) {
      console.log(`  save: ${base}`);
      snap = await verified(await requestSave(base), r.quote);
      if (!snap) {
        await sleep(30000); // indexering hinner ikapp
        snap = await verified(await availability(base), r.quote);
      }
    }
    if (!snap) {
      console.log(`  archive.today-fallback: ${base}`);
      snap = await verified((await archiveViaArchiveToday(base)).archive_url, r.quote);
    }
    if (snap) snapshotByBase.set(base, snap);
    await sleep(3000);
  }
  if (!snap) {
    console.log(`  – citat-backat arkiv saknas fortfarande: ${r.label} (${base})`);
    continue;
  }
  const page = chunkStart(r.source.url);
  r.source.archive_url = page === null ? snap : withPageAnchor(snap, page);
  archivesSet++;
  console.log(`  ✓ ${r.label} → ${r.source.archive_url.slice(0, 80)}`);
}

/* ───────────────────────────────────────────── validera + skriv ─────── */

const rsErrors = validateStanceInvariants(issuesFile, cells);
if (rsErrors.length > 0) {
  console.error(`RS-brott efter korrigering — INGET skrivs:\n  ${rsErrors.join("\n  ")}`);
  process.exit(1);
}

if (DRY_RUN) {
  console.log(`\n[dry-run] Inget skrivet. Skulle rätta ${anchorsFixed} ankare och sätta ${archivesSet} arkivlänkar.`);
  process.exit(0);
}

save(join(DATA, "stances.json"), cells);
if (changedPromiseIds.size > 0) {
  save(join(DATA, "promises.json"), promises);
  const dataHash = createHash("sha256").update(canonical(promises)).digest("hex");
  const changelog = JSON.parse(readFileSync(join(DATA, "changelog.json"), "utf8")) as unknown[];
  changelog.push({
    run_id: `source-page-fix-${new Date().toISOString().slice(0, 10)}`,
    added: [], updated: [...changedPromiseIds].sort(), retracted: [],
    data_hash: dataHash, timestamp: new Date().toISOString(),
  });
  save(join(DATA, "changelog.json"), changelog);
}
const changelogNote = changedPromiseIds.size > 0 ? " (changelog-post skriven)" : "";
console.log(`\nKLART: ${anchorsFixed} ankare rättade, ${archivesSet} arkivlänkar satta, ${changedPromiseIds.size} löften uppdaterade${changelogNote}.`);
