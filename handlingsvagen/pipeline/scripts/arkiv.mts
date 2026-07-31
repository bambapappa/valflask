/**
 * Arkivskörd + verifiering (HV5-checklistan: "arkivkopior verifierade").
 *
 * För varje AKTIV koppling hämtas en arkivögonblicksbild av källdokumentet och
 * det KONTROLLERAS att kopplingens exakta citat står ord för ord i
 * ögonblicksbilden — kärnprincipen "arkivlänkar måste bära citatet". En
 * arkivkopia som inte bär citatet accepteras aldrig; den posten lämnas som
 * overifierad (ärligt tomt).
 *
 * Källdokumentet är handlingens egen dokument för motion/proposition/
 * interpellation/skriftlig fråga (`h.url`) — men för en voteringskoppling är
 * det utskottsbetänkandet citatet faktiskt står i (`bevis.kalla_dok_id`),
 * eftersom voteringens egen post saknar sakinnehåll (se beslutslogg b-0013 om
 * betänkandekoppling). Samma verifiering, samma normalisering, bara annan
 * källa — och posten sparas ändå under voteringens `handling_id`, så sajtens
 * uppslag (`arkiv.get(handling_id)`) fungerar oförändrat.
 *
 * Resultatet skrivs till data/arkiv.json (en verifieringspost per handling), som
 * sajten slår upp vid byggtid. handlingar.json och betankanden.json rörs inte.
 *
 * Nätblockerat i sessionscontainern (web.archive.org nekas) — körs som
 * Actions-workflow (arkiv.yml) på GitHubs runners med öppet utnät, eller lokalt
 * från en session med öppen väg.
 *
 *   npm run arkiv -- [--limit N]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeForVerbatim } from "../src/grindar.ts";
import { dokumentUrl, htmlTillText, type HttpFetch } from "../src/riksdagen.ts";
import { politeFetch } from "./hamta.mts";

interface Koppling {
  id: string;
  handling_id: string;
  status: string;
  bevis: { citat: string; kalla_dok_id?: string };
}
interface Handling {
  id: string;
  kind: string;
  url: string;
}
interface ArkivPost {
  handling_id: string;
  koppling_id: string;
  kalla_url: string;
  arkiv_url: string | null;
  verifierad: boolean;
  skal?: string;
  datum: string;
}

const DOKUMENT = new Set(["motion", "proposition", "interpellation", "skriftlig_fraga"]);
const idag = () => new Date().toISOString().slice(0, 10);

/**
 * URL:en vars ögonblicksbild ska bära citatet — handlingens egen sida för
 * dokumenttyperna, betänkandets sida (via `kalla_dok_id`) för voteringar.
 * Saknar en voteringskoppling `kalla_dok_id` finns ingen källa att arkivera
 * (ärligt: hoppa över, gissa aldrig ett dok-id).
 */
function kallUrl(k: Koppling, h: Handling): string | null {
  if (h.kind === "votering") return k.bevis.kalla_dok_id ? dokumentUrl(k.bevis.kalla_dok_id) : null;
  return DOKUMENT.has(h.kind) ? h.url : null;
}

/** Slår upp/utlöser en Wayback-ögonblicksbild och returnerar dess URL, eller null. */
async function waybackSnapshot(fetcher: HttpFetch, url: string): Promise<string | null> {
  const kolla = async (): Promise<string | null> => {
    const res = await fetcher(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`);
    if (res.status !== 200) return null;
    const data = JSON.parse(await res.text()) as { archived_snapshots?: { closest?: { available?: boolean; url?: string } } };
    const c = data.archived_snapshots?.closest;
    return c?.available && c.url ? c.url.replace(/^http:/, "https:") : null;
  };
  const befintlig = await kolla();
  if (befintlig) return befintlig;
  // Ingen ögonblicksbild fanns — be Wayback fånga sidan, kolla sedan igen.
  try {
    await fetcher(`https://web.archive.org/save/${url}`);
  } catch {
    /* save är best effort; availability avgör */
  }
  return kolla();
}

/** Bär ögonblicksbilden citatet ord för ord? (samma normalisering som H2-grinden) */
async function barCitatet(fetcher: HttpFetch, snapshotUrl: string, citat: string): Promise<boolean> {
  const res = await fetcher(snapshotUrl);
  if (res.status !== 200) return false;
  const text = normalizeForVerbatim(htmlTillText(await res.text()));
  return text.includes(normalizeForVerbatim(citat));
}

async function main() {
  const argv = process.argv.slice(2);
  let limit = Infinity;
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === "--limit") limit = Number(argv[++i]);
  const rot = resolve(import.meta.dirname, "../..");
  const fetcher = politeFetch;

  const kopplingar: Koppling[] = JSON.parse(readFileSync(resolve(rot, "data/kopplingar.json"), "utf8"));
  const handlingar = new Map<string, Handling>(
    (JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8")) as Handling[]).map((h) => [h.id, h]),
  );
  const arkivPath = resolve(rot, "data/arkiv.json");
  const arkiv: ArkivPost[] = existsSync(arkivPath) ? JSON.parse(readFileSync(arkivPath, "utf8")) : [];
  const redanVerifierad = new Set(arkiv.filter((a) => a.verifierad).map((a) => a.handling_id));

  const aktiva = kopplingar.filter((k) => k.status === "aktiv");
  let nya = 0;
  let bekraftade = 0;
  for (const k of aktiva) {
    if (nya >= limit) break;
    const h = handlingar.get(k.handling_id);
    if (!h) continue;
    const url = kallUrl(k, h);
    if (!url) continue; // votering utan kalla_dok_id: ingen källa att arkivera (ärligt)
    if (redanVerifierad.has(h.id)) continue;
    nya += 1;
    console.log(`arkiverar ${h.id} (${h.kind}${h.kind === "votering" ? " via betänkande" : ""}) …`);
    let post: ArkivPost;
    try {
      const snapshot = await waybackSnapshot(fetcher, url);
      if (!snapshot) {
        post = { handling_id: h.id, koppling_id: k.id, kalla_url: url, arkiv_url: null, verifierad: false, skal: "ingen arkivögonblicksbild kunde skapas", datum: idag() };
      } else if (await barCitatet(fetcher, snapshot, k.bevis.citat)) {
        post = { handling_id: h.id, koppling_id: k.id, kalla_url: url, arkiv_url: snapshot, verifierad: true, datum: idag() };
        bekraftade += 1;
      } else {
        post = { handling_id: h.id, koppling_id: k.id, kalla_url: url, arkiv_url: snapshot, verifierad: false, skal: "citatet stod inte ord för ord i ögonblicksbilden", datum: idag() };
      }
    } catch (e) {
      post = { handling_id: h.id, koppling_id: k.id, kalla_url: url, arkiv_url: null, verifierad: false, skal: `fel: ${e instanceof Error ? e.message : String(e)}`, datum: idag() };
    }
    const i = arkiv.findIndex((a) => a.handling_id === h.id);
    if (i >= 0) arkiv[i] = post;
    else arkiv.push(post);
    writeFileSync(arkivPath, JSON.stringify(arkiv, null, 2) + "\n"); // delspara per handling
  }
  console.log(`klart: ${nya} prövade, ${bekraftade} arkivkopior verifierade → ${arkivPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
