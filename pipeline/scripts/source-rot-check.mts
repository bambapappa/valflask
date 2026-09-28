/**
 * Frågevågen — källröta-bevakningen (SPEC-FRAGEVAGEN.md §6.3, mänskligt beslut: veckovis).
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
import { join, resolve } from "node:path";
import { lasFillage, skapaFilpaket, skrivFilpaket } from "../src/datatransaktion.ts";
import { extractPdfText, looksLikePdf, stripHtml } from "../src/fetch.ts";
import { CitatkontrollPerKalla, type Kalltext } from "../src/stance-source-check.ts";
import { archiveWithFallback } from "../src/archive.ts";
import { snapshotBacksQuote } from "../src/archive-verify.ts";
import type { StanceCell } from "../src/stances.ts";
import { svenskDag } from "../src/dagen.ts";

const ROOT = resolve(import.meta.dirname, "../../");
const DATA = join(ROOT, "data");
const STANCES_PATH = join(DATA, "stances.json");
const USER_AGENT = "UtlovatBot/1.0 (+https://utlovat.se/om)";
const dryRun = process.argv.includes("--dry-run");

const fore = lasFillage(DATA, ["stances.json"]);
if (typeof fore["stances.json"] !== "string") throw new Error("Källrötekontrollen kräver ståndpunktsfilen");
const cells = JSON.parse(fore["stances.json"]) as StanceCell[];
const today = svenskDag();

async function hamtaKalltext(url: string): Promise<Kalltext> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/pdf" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { utfall: "obestamd" }; // nätverksfel — ingen anklagelse
  }
  if (res.status === 404 || res.status === 410) return { utfall: "borttagen" };
  if (!res.ok) return { utfall: "obestamd" }; // 5xx/429 m.m. — försök igen nästa vecka

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch {
    return { utfall: "obestamd" };
  }
  let text: string;
  if (looksLikePdf(res.headers.get("content-type"), bytes)) {
    try {
      // OBS: PdfExtract har `pages`, inte `text` — .text gav undefined och
      // hade kraschat körningen på första PDF-källan (26 av 52 statements).
      text = (await extractPdfText(bytes)).pages.join("\n");
    } catch {
      return { utfall: "obestamd" };
    }
  } else {
    text = stripHtml(new TextDecoder("utf-8").decode(bytes));
  }
  return { text };
}

let checked = 0;
let changed = 0;
let archived = 0;
const report: string[] = [];

// En hämtning per URL, men en separat citatkontroll för varje besked.
const kontroll = new CitatkontrollPerKalla(hamtaKalltext);
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
    const forstaPaUrl = !kontroll.har(st.source.url);
    const result = await kontroll.kontrollera(st.source.url, st.quote);
    if (forstaPaUrl) {
      await new Promise((r) => setTimeout(r, 1200)); // snäll takt
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

console.log(`Källröta-kontroll ${today}: ${checked} statements, ${kontroll.antalKallor()} URL:er, ${changed} statusändringar, ${archived} nya arkiv.`);
for (const line of report) console.log(`  ${line}`);

if (!dryRun && checked > 0) {
  skrivFilpaket(DATA, skapaFilpaket(fore, { "stances.json": JSON.stringify(cells, null, 2) + "\n" }));
  const parts = [changed > 0 ? `${changed} ändringar` : "", archived > 0 ? `${archived} arkiv` : ""].filter(Boolean).join(", ");
  console.log(parts
    ? `Skrev ${STANCES_PATH}. Committa med "data: källröta-kontroll ${today} (${parts})".`
    : `Skrev ${STANCES_PATH} (endast source_checked_at).`);
}
