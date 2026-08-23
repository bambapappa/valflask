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
 * **Nätet i sessionscontainern går fram**, men Nodes inbyggda `fetch` läser inte
 * `HTTPS_PROXY` på egen hand. Noten här sa tidigare att web.archive.org nekas;
 * det var vår sida som inte använde proxyn. Kör:
 *
 *   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
 *     npm run arkiv -- --utan-save     # fas 1: läs vad som redan finns
 *   … samma miljö …
 *     npm run arkiv -- --om-saknas     # fas 2: skörda luckorna (långsam)
 *
 * Workflowen `arkiv.yml` på GitHubs runners behöver ingen proxy.
 *
 *   --limit N      bryt efter N handlingar
 *   --utan-save    be aldrig Wayback fånga en ny sida; mät bara vad som finns
 *   --om-saknas    ta om posterna som står `saknas` (annars hoppas de över)
 *   --bara-uppslag slå upp om en kopia finns, öppna den inte (halva svaret)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeForVerbatim } from "../src/grindar.ts";
import { dokumentUrl, htmlTillText, type HttpFetch } from "../src/riksdagen.ts";
import { politeFetch } from "./hamta.mts";
import { svenskDag } from "../../../pipeline/src/dagen.ts";

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
/**
 * Vad kontrollen kunde svara. Samma ordförråd som löftessidans
 * `arkiv-kontroll.mts`, och av samma skäl: **ett nätfel får aldrig se ut som ett
 * underkänt citat.** Före 2026-08-08 skrev skriptet `verifierad: false` med
 * skälet «fel: fetch failed» i samma fält som «citatet stod inte ord för ord»,
 * så en congesterad Wayback såg ut som dåliga bevis. Sex poster i beståndet var
 * av det slaget.
 */
/**
 * `finns-ogranskad` är avsiktligt skilt från `bar`. Tillgänglighets-API:et hos
 * archive.org och innehållet på web.archive.org är två olika värdar, och de kan
 * svara olika: mätt 2026-08-08 svarade uppslaget 200 medan hämtningen av själva
 * ögonblicksbilden avvisades. Då **vet vi att en kopia finns** men inte om den
 * bär citatet, och det är halva svaret — inte hela. Att skriva `bar` där vore att
 * hävda mer än vi kontrollerat.
 */
type Utfall = "bar" | "bar-inte" | "saknas" | "oavgjort" | "finns-ogranskad";

interface ArkivPost {
  handling_id: string;
  koppling_id: string;
  kalla_url: string;
  arkiv_url: string | null;
  /**
   * `true` bara när ögonblicksbilden hämtades OCH bar citatet ord för ord.
   * Sajten slår upp det här fältet, så det behåller sin betydelse.
   */
  verifierad: boolean;
  /** Vad kontrollen kunde svara — skilj `oavgjort` från `bar-inte`. */
  utfall: Utfall;
  skal?: string;
  datum: string;
}

const DOKUMENT = new Set(["motion", "proposition", "interpellation", "skriftlig_fraga"]);
const idag = () => svenskDag();

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

/**
 * Slår upp en Wayback-ögonblicksbild och returnerar dess URL, eller null.
 *
 * `bergaNya` styr om skriptet också **ber** Wayback fånga sidor som inte redan
 * är arkiverade. Det är skörden — och det är också det som gör en körning över
 * hela beståndet till timmar i stället för minuter: en `save` tar tiotals
 * sekunder och misslyckas ofta när Wayback är belastad. Mätt 2026-08-08: av de
 * första 124 posterna hade 33 ingen ögonblicksbild och krävde en save.
 *
 * Därför två faser. `--utan-save` läser bara vad som redan finns och ger en
 * fullständig mätning snabbt; en senare körning utan flaggan skördar luckorna.
 * En post utan kopia får `saknas`, vilket är ett svar och inte en lucka i
 * mätningen.
 */
/** Slog uppslaget fel, eller finns det verkligen ingen kopia? */
class ArkivetSvaradeInte extends Error {
  constructor(readonly status: number) {
    super(`arkivet svarade HTTP ${status} — säger ingenting om kopian`);
  }
}

async function waybackSnapshot(
  fetcher: HttpFetch,
  url: string,
  bergaNya: boolean,
): Promise<string | null> {
  const kolla = async (): Promise<string | null> => {
    const res = await fetcher(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`);
    // 429 är ett svar om OSS, inte om kopian. Mätt 2026-08-08: efter ett svep
    // över 527 ögonblicksbilder började archive.org svara 429, och eftersom
    // varje status utom 200 lästes som «ingen kopia finns» skrev skriptet
    // `saknas` på post efter post som mycket väl kan vara arkiverad. Ett
    // takfel får aldrig se ut som en saknad arkivkopia.
    if (res.status !== 200) throw new ArkivetSvaradeInte(res.status);
    const data = JSON.parse(await res.text()) as { archived_snapshots?: { closest?: { available?: boolean; url?: string } } };
    const c = data.archived_snapshots?.closest;
    return c?.available && c.url ? c.url.replace(/^http:/, "https:") : null;
  };
  const befintlig = await kolla();
  if (befintlig || !bergaNya) return befintlig;
  // Ingen ögonblicksbild fanns — be Wayback fånga sidan, kolla sedan igen.
  try {
    await fetcher(`https://web.archive.org/save/${url}`);
  } catch {
    /* save är best effort; availability avgör */
  }
  return kolla();
}

/**
 * Bär ögonblicksbilden citatet ord för ord? (samma normalisering som citatgrinden)
 *
 * `null` betyder att hämtningen inte gick fram — inte att citatet saknas. Ett
 * `false` här är ett omdöme om beviset; ett `null` är ett omdöme om nätet.
 */
async function barCitatet(
  fetcher: HttpFetch,
  snapshotUrl: string,
  citat: string,
): Promise<boolean | null> {
  const res = await fetcher(snapshotUrl);
  if (res.status !== 200) return null;
  const text = normalizeForVerbatim(htmlTillText(await res.text()));
  return text.includes(normalizeForVerbatim(citat));
}

async function main() {
  const argv = process.argv.slice(2);
  let limit = Infinity;
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === "--limit") limit = Number(argv[++i]);
  const bergaNya = !argv.includes("--utan-save");
  // Slå bara upp om en kopia finns; öppna den inte. Halva svaret, men det halva
  // svaret går att få när web.archive.org avvisar innehållshämtningar och
  // tillgänglighets-API:et ändå svarar. Posten får `finns-ogranskad`, aldrig `bar`.
  const baraUppslag = argv.includes("--bara-uppslag");
  // En omkörning ska ta de obesvarade igen. Utan det här hoppar `--utan-save`
  // över allt den nyss skrev `saknas` på, och den andra fasen får inget att göra.
  const taOmSaknas = argv.includes("--om-saknas");
  const rot = resolve(import.meta.dirname, "../..");
  const fetcher = politeFetch;

  const kopplingar: Koppling[] = JSON.parse(readFileSync(resolve(rot, "data/kopplingar.json"), "utf8"));
  const handlingar = new Map<string, Handling>(
    (JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8")) as Handling[]).map((h) => [h.id, h]),
  );
  const arkivPath = resolve(rot, "data/arkiv.json");
  const arkiv: ArkivPost[] = existsSync(arkivPath) ? JSON.parse(readFileSync(arkivPath, "utf8")) : [];
  // Hoppa över det som redan är avgjort. `oavgjort` är aldrig avgjort — det var
  // nätet som föll — så den tas alltid om. `saknas` tas om bara med --om-saknas,
  // eftersom en ny availability-fråga sällan ger ett annat svar.
  const klara = new Set(
    arkiv
      .filter(
        (a) =>
          a.verifierad ||
          a.utfall === "bar-inte" ||
          (a.utfall === "saknas" && !taOmSaknas) ||
          // Ett uppslag utan öppnad kopia är inte avgjort. Under --bara-uppslag
          // hoppas den över (svaret finns redan); annars tas den om och prövas.
          (a.utfall === "finns-ogranskad" && baraUppslag),
      )
      .map((a) => a.handling_id),
  );

  const aktiva = kopplingar.filter((k) => k.status === "aktiv");
  let nya = 0;
  let bekraftade = 0;
  for (const k of aktiva) {
    if (nya >= limit) break;
    const h = handlingar.get(k.handling_id);
    if (!h) continue;
    const url = kallUrl(k, h);
    if (!url) continue; // votering utan kalla_dok_id: ingen källa att arkivera (ärligt)
    if (klara.has(h.id)) continue;
    nya += 1;
    console.log(`arkiverar ${h.id} (${h.kind}${h.kind === "votering" ? " via betänkande" : ""}) …`);
    const bas = { handling_id: h.id, koppling_id: k.id, kalla_url: url, datum: idag() };
    let post: ArkivPost;
    try {
      const snapshot = await waybackSnapshot(fetcher, url, bergaNya);
      if (!snapshot) {
        post = { ...bas, arkiv_url: null, verifierad: false, utfall: "saknas", skal: "ingen arkivögonblicksbild kunde skapas" };
      } else if (baraUppslag) {
        post = {
          ...bas,
          arkiv_url: snapshot,
          verifierad: false,
          utfall: "finns-ogranskad",
          skal: "ögonblicksbilden finns men är inte öppnad — citatet är inte prövat mot den",
        };
      } else {
        const bar = await barCitatet(fetcher, snapshot, k.bevis.citat);
        if (bar === null) {
          post = { ...bas, arkiv_url: snapshot, verifierad: false, utfall: "oavgjort", skal: "ögonblicksbilden gick inte att hämta — säger ingenting om kopian" };
        } else if (bar) {
          post = { ...bas, arkiv_url: snapshot, verifierad: true, utfall: "bar" };
          bekraftade += 1;
        } else {
          post = { ...bas, arkiv_url: snapshot, verifierad: false, utfall: "bar-inte", skal: "citatet stod inte ord för ord i ögonblicksbilden" };
        }
      }
    } catch (e) {
      // Nätet eller arkivets tak, inte beviset. Posten får `oavgjort` så att en
      // omkörning tar den igen och ingen läser den som en arkivkopia vi
      // underkänt eller som en kopia som inte finns.
      const skal =
        e instanceof ArkivetSvaradeInte
          ? e.message
          : `nätet nådde inte fram: ${e instanceof Error ? e.message : String(e)}`;
      post = { ...bas, arkiv_url: null, verifierad: false, utfall: "oavgjort", skal };
      if (e instanceof ArkivetSvaradeInte && e.status === 429) {
        console.error(
          "\narchive.org svarar 429 — vi frågar för fort. Körningen avbryts hellre än att\n" +
            "skriva obesvarade poster i beståndet. Vänta och kör om; det som redan är\n" +
            "avgjort hoppas över.",
        );
        const i = arkiv.findIndex((a) => a.handling_id === h.id);
        if (i >= 0) arkiv[i] = post;
        else arkiv.push(post);
        writeFileSync(arkivPath, JSON.stringify(arkiv, null, 2) + "\n");
        break;
      }
    }
    const i = arkiv.findIndex((a) => a.handling_id === h.id);
    if (i >= 0) arkiv[i] = post;
    else arkiv.push(post);
    writeFileSync(arkivPath, JSON.stringify(arkiv, null, 2) + "\n"); // delspara per handling
  }
  const rakna = (u: Utfall) => arkiv.filter((a) => a.utfall === u).length;
  console.log(`klart: ${nya} prövade i den här körningen, ${bekraftade} nya verifierade → ${arkivPath}`);
  console.log(`hela beståndet: ${arkiv.length} poster · ${rakna("bar")} bär citatet · ${rakna("bar-inte")} bär inte`);
  console.log(`  ${rakna("finns-ogranskad")} har en kopia som inte är öppnad — halva svaret`);
  console.log(`  ${rakna("saknas")} utan ögonblicksbild · ${rakna("oavgjort")} nådde inte fram (kör om — säger inget om kopian)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
