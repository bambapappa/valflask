/**
 * Befriar de kö-poster som datumgrinden dömde på fel datum.
 *
 * `datumUrHtml` läste bara skapandedatum fram till 2026-08-19. En partisida om
 * abort eller djurskydd skapas en gång och skrivs om inför varje val, så
 * grinden mätte hur gammal sidan var i stället för hur gammal politiken är, och
 * avvisade partiernas nu gällande texter som fem och elva år gamla. Funktionen
 * är lagad — men lagningen biter bara vid nästa hämtning, och de redan dömda
 * posterna nås inte av den.
 *
 * **Kön kan nämligen inte rätta sig själv.** `publish.ts` slår ihop kön i
 * stället för att skriva över den, och sammanslagningen LÄGGER BARA TILL: en
 * post som redan ligger där rörs aldrig igen. Det är rätt regel — den finns för
 * att en tom körning inte ska radera det som väntar på en människa — men den
 * betyder att en felaktig grinddom blir permanent. Femtionio poster satt så.
 *
 * Att avvisa dem vore fel: de är inte avvisade, de är feldömda, och en
 * avvisning skriver in ett beslut ingen har fattat. Skriptet gör därför en enda
 * sak: det hämtar källsidan på nytt, räknar om datumet med den lagade
 * funktionen, och **stryker datumdomen på de poster där den inte längre håller**.
 *
 * Det rör ingen annan grinddom, sätter inga belopp och publicerar ingenting.
 * En befriad post ligger kvar i kön utan kostnad — nästa steg är `pnpm
 * kostnad:om`, och därefter en människa.
 *
 * Skriptet är en engångsåtgärd men tål att köras om: en post vars datumdom
 * redan är struken väljs inte igen.
 *
 *   pnpm datumgrind:om            # torrkörning, skriver inget
 *   pnpm datumgrind:om --skriv    # skarp körning
 *   Flaggor: --max=N
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { datumUrAdress, datumUrHtml } from "../src/fetch.ts";
import { DATE_WINDOW_DAYS } from "../src/gates.ts";

const DATA = resolve(import.meta.dirname, "../../data");
const USER_AGENT = "UtlovatBot/1.0 (+https://utlovat.se/om)";

function flagga(namn: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${namn}` || a.startsWith(`--${namn}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? "" : hit.slice(eq + 1);
}
const SKRIV = flagga("skriv") !== undefined;
const MAX = Number(flagga("max") ?? "0");

interface Grinddom {
  gate?: string;
  reason?: string;
}
interface KoPost {
  articleUrl?: string;
  articleTitle?: string;
  candidate: Record<string, unknown> | null;
  failures?: Grinddom[];
  [k: string]: unknown;
}

/**
 * Är domen datumfönstrets, och ingen annan?
 *
 * G4 bär två slags domar: beloppets rimlighet och källans datum. Bara den
 * senare vilar på det felläst datumet, och bara den får strykas. Mönstret
 * följer grindens egen formulering i `gates.ts`.
 */
export function arDatumdom(f: Grinddom): boolean {
  return f.gate === "G4" && /^Publiceringsdatum .* fönstret är/u.test(f.reason ?? "");
}

/** Ligger datumet innanför grindens fönster, räknat från nu? */
export function inomFonstret(iso: string, nu: Date): boolean {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return false;
  return Math.abs(d - nu.getTime()) <= DATE_WINDOW_DAYS * 86_400_000;
}

async function main(): Promise<void> {
  const fil = resolve(DATA, "needs_review.json");
  const poster = JSON.parse(readFileSync(fil, "utf8")) as KoPost[];
  const dömda = poster.map((p, i) => ({ p, i })).filter(({ p }) => (p.failures ?? []).some(arDatumdom));

  // En sida i taget, inte en post i taget: femtionio poster ligger på tretton
  // sidor, och att hämta samma sida fem gånger är att belasta partiet i onödan.
  const sidor = new Map<string, number[]>();
  for (const { p, i } of dömda) {
    const url = p.articleUrl ?? "";
    sidor.set(url, [...(sidor.get(url) ?? []), i]);
  }

  console.log(
    `${poster.length} poster i kön · ${dömda.length} dömda på källans datum, på ${sidor.size} sidor.`,
  );
  if (dömda.length === 0) return;

  const nu = new Date();
  const urval = MAX > 0 ? [...sidor].slice(0, MAX) : [...sidor];
  let befriade = 0;
  let kvar = 0;
  let ohämtade = 0;

  for (const [url, index] of urval) {
    let html: string;
    try {
      const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
    } catch (e) {
      // Ett tyst arkiv är inte en mätning, och en sida som inte svarar är inte
      // en sida utan uppdateringsdatum. Posterna får ligga kvar orörda.
      console.log(`  ?  ${index.length} st  ${url}\n       hämtningen föll: ${(e as Error).message}`);
      ohämtade += index.length;
      continue;
    }
    const datum = datumUrAdress(url) ?? datumUrHtml(html);
    if (datum === null || !inomFonstret(datum, nu)) {
      console.log(`  –  ${index.length} st  ${url}\n       grinden får ${datum ?? "inget datum"} — domen står kvar`);
      kvar += index.length;
      continue;
    }
    for (const i of index) {
      const p = poster[i]!;
      p.failures = (p.failures ?? []).filter((f) => !arDatumdom(f));
    }
    console.log(`  ✓  ${index.length} st  ${url}\n       grinden får ${datum} — datumdomen struken`);
    befriade += index.length;
  }

  console.log(
    `\nbefriade ${befriade} · domen står kvar för ${kvar} · ${ohämtade} kunde inte hämtas`,
  );
  if (!SKRIV) {
    console.log("Torrkörning — inget skrevs. Kör om med --skriv.");
    return;
  }
  writeFileSync(fil, JSON.stringify(poster, null, 2) + "\n", "utf8");
  console.log(`Skrivet till ${fil}.`);
  console.log(
    "De befriade posterna saknar fortfarande belopp. Nästa steg: pnpm kostnad:om — och därefter en människa.",
  );
}

if (import.meta.filename === process.argv[1]) {
  await main();
}
