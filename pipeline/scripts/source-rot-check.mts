/**
 * Frågevågen — källröta-bevakningen (SPEC-FRAGEVAGEN.md §6.3, ägarbeslut: veckovis).
 *
 * Re-hämtar käll-URL:erna för alla publicerade statements och stämplar:
 *   - "borttagen": källan svarar 404/410 (eller domänen är död)
 *   - "andrad":    källan svarar men citatet passerar inte längre verbatimgrinden
 *   - "ok":        citatet står kvar ordagrant
 *
 * Ingenting raderas — arkivkopian gäller och en ändrad/borttagen källa blir en
 * SYNLIG stämpel på sajten. Statusen kan gå tillbaka till "ok" om källan
 * återuppstår (t.ex. tillfälligt CMS-fel), men statementet självt är orörbart.
 * Nätverksfel/timeouts ändrar ALDRIG status (vi anklagar ingen för borttagning
 * på grund av vårt eget nätstrul) — de lämnar bara source_checked_at orörd.
 *
 *   pnpm stances:rot-check            kontrollera + skriv data/stances.json
 *   pnpm stances:rot-check --dry-run  rapportera enbart
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { extractPdfText, looksLikePdf, stripHtml } from "../src/fetch.ts";
import { normalizeForVerbatim } from "../src/gates.ts";
import { archiveWithFallback } from "../src/archive.ts";
import { snapshotBacksQuote } from "../src/archive-verify.ts";
import type { StanceCell } from "../src/stances.ts";

const ROOT = resolve(import.meta.dirname, "../../");
const STANCES_PATH = join(ROOT, "data", "stances.json");
const USER_AGENT = "DrygastBot/1.0 (+https://drygast.nu/om)";
const dryRun = process.argv.includes("--dry-run");

const cells = JSON.parse(readFileSync(STANCES_PATH, "utf8")) as StanceCell[];
const today = new Date().toISOString().slice(0, 10);

type CheckResult = "ok" | "andrad" | "borttagen" | "obestamd";

async function checkUrl(url: string, quote: string): Promise<CheckResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/pdf" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return "obestamd"; // nätverksfel — ingen anklagelse
  }
  if (res.status === 404 || res.status === 410) return "borttagen";
  if (!res.ok) return "obestamd"; // 5xx/429 m.m. — försök igen nästa vecka

  const bytes = new Uint8Array(await res.arrayBuffer());
  let text: string;
  if (looksLikePdf(res.headers.get("content-type"), bytes)) {
    try {
      // OBS: PdfExtract har `pages`, inte `text` — .text gav undefined och
      // hade kraschat körningen på första PDF-källan (26 av 52 statements).
      text = (await extractPdfText(bytes)).pages.join("\n");
    } catch {
      return "obestamd";
    }
  } else {
    text = stripHtml(new TextDecoder("utf-8").decode(bytes));
  }
  return normalizeForVerbatim(text).includes(normalizeForVerbatim(quote)) ? "ok" : "andrad";
}

let checked = 0;
let changed = 0;
let archived = 0;
const report: string[] = [];

// Max en kontroll per URL per körning — flera statements kan dela källa.
const byUrl = new Map<string, CheckResult>();
// Arkiv-backfill: en arkiveringsförfrågan per bas-URL per körning.
const archiveByBase = new Map<string, string | null>();

const stripFrag = (u: string) => u.split("#")[0]!;

/**
 * Fyller archive_url för besked som saknar det (t.ex. sidor Wayback spärrade
 * vid publicering). Kör ENDAST när källan fortfarande är "ok" — annars skulle
 * vi arkivera ett ändrat innehåll. Fallback-kedjan (Wayback → archive.today)
 * fungerar från GitHub Actions även där vår dev-proxy 429:ar, så luckor
 * stängs av sig själv över tid. Misslyckas bägge lämnas archive_url orört.
 */
async function backfillArchive(st: StanceCell["statements"][number]): Promise<boolean> {
  if (dryRun || st.source.archive_url) return false;
  const base = stripFrag(st.source.url);
  let snap = archiveByBase.get(base);
  if (snap === undefined) {
    snap = (await archiveWithFallback(base)).archive_url;
    archiveByBase.set(base, snap);
  }
  if (!snap) return false;
  // Arkivet accepteras ENDAST om citatet står ordagrant i snapshotten —
  // availability/newest kan ge en kopia som är äldre än sidinnehållet.
  if ((await snapshotBacksQuote(snap, st.quote)) !== true) return false;
  const frag = st.source.url.includes("#") ? "#" + st.source.url.split("#")[1] : "";
  st.source.archive_url = snap + frag;
  return true;
}

for (const cell of cells) {
  for (const st of cell.statements) {
    checked++;
    let result = byUrl.get(st.source.url);
    if (result === undefined) {
      result = await checkUrl(st.source.url, st.quote);
      byUrl.set(st.source.url, result);
      await new Promise((r) => setTimeout(r, 1200)); // snäll takt
    } else if (result !== "obestamd" && result !== "ok") {
      // Delad URL men annat citat: verbatimkontrollen är per citat — kör om.
      result = await checkUrl(st.source.url, st.quote);
    }
    if (result === "obestamd") continue;
    if (st.source_status !== result) {
      changed++;
      report.push(
        `${cell.subquestion_id} × ${cell.party} · ${st.id}: ${st.source_status} → ${result} (${st.source.url})`,
      );
      st.source_status = result;
    }
    st.source_checked_at = today;

    // Arkiv-backfill för luckor — bara om källan fortfarande står ordagrant kvar.
    if (result === "ok" && await backfillArchive(st)) {
      archived++;
      report.push(`ARKIV ${cell.subquestion_id} × ${cell.party} · ${st.id}: ${st.source.archive_url}`);
    }
  }
}

console.log(`Källröta-kontroll ${today}: ${checked} statements, ${byUrl.size} URL:er, ${changed} statusändringar, ${archived} nya arkiv.`);
for (const line of report) console.log(`  ${line}`);

if (!dryRun && checked > 0) {
  writeFileSync(STANCES_PATH, JSON.stringify(cells, null, 2) + "\n");
  const parts = [changed > 0 ? `${changed} ändringar` : "", archived > 0 ? `${archived} arkiv` : ""].filter(Boolean).join(", ");
  console.log(parts
    ? `Skrev ${STANCES_PATH}. Committa med "data: källröta-kontroll ${today} (${parts})".`
    : `Skrev ${STANCES_PATH} (endast source_checked_at).`);
}
