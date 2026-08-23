/**
 * Kör om H2 mot riksdagens källor för alla PUBLICERADE kopplingar.
 *
 *   pnpm h2-svep                    # kör och skriv data/h2-svepet.json
 *   pnpm h2-svep -- --torr          # kör utan att skriva
 *   pnpm h2-svep -- --max 50        # kortare körning vid felsökning
 *
 * Veckojobb, inte byggrind: skriptet talar med riksdagens API. Fynd är data
 * och fäller aldrig körningen — utgången blir röd bara när SVEPET är trasigt,
 * det vill säga när mer än hälften av kopplingarna inte gick att pröva alls.
 * Skälet och gränsen står i src/h2svepet.ts.
 *
 * Skriptet rättar ingenting. Ett fynd läses av en människa och rättas med
 * `bevis-byt` eller `dra-in`, som skriver rättelsepost — tyst rättelse är
 * förbjuden.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchDokumentText, fetchUtskottspunkter, fetchYrkanden, type Utskottspunkt, type Yrkande } from "../src/riksdagen.ts";
import { byggHandlingstext } from "../src/foreslag.ts";
import { cachat, politeFetch } from "./kallcache.mts";
import { provaCitatet, svepstatus, svepetArTrasigt, type Sveprad } from "../src/h2svepet.ts";
import type { Handling } from "../src/handlingar.ts";
import type { KopplingPost } from "../src/granskning.ts";
import { svenskDag } from "../../../pipeline/src/dagen.ts";

const rot = resolve(import.meta.dirname, "../..");
const torr = process.argv.includes("--torr");
const max = process.argv.includes("--max") ? Number(process.argv[process.argv.indexOf("--max") + 1]) : Infinity;
const datum = svenskDag();

const kopplingar: KopplingPost[] = JSON.parse(readFileSync(resolve(rot, "data/kopplingar.json"), "utf8"));
const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));
const hById = new Map(handlingar.map((h) => [h.id, h]));

const punktCache = new Map<string, Utskottspunkt[] | undefined>();
async function hamtaPunkter(betDokId: string): Promise<Utskottspunkt[] | undefined> {
  if (!punktCache.has(betDokId)) {
    try {
      punktCache.set(betDokId, await fetchUtskottspunkter(politeFetch, betDokId));
    } catch {
      return undefined;
    }
  }
  return punktCache.get(betDokId);
}

const rader: Sveprad[] = [];
let i = 0;
for (const k of kopplingar) {
  if (k.status !== "aktiv") continue;
  if (i >= max) break;
  i += 1;

  const handling = hById.get(k.handling_id);
  if (!handling) {
    rader.push({
      koppling_id: k.id,
      handling_id: k.handling_id,
      dok_id: "",
      utfall: "oprovad",
      skal: "Handlingen finns inte i handlingar.json — kopplingen går inte att pröva",
    });
    continue;
  }

  // Citatet prövas mot det dokument det ska stå i: betänkandet för en
  // votering, annars handlingens eget dokument. Samma val som bevisbytet gör.
  const kallDok = k.bevis.kalla_dok_id ?? handling.dok_id;
  const kalltext = await cachat(`text-${kallDok}`, () => fetchDokumentText(politeFetch, kallDok));

  let yrkanden: Yrkande[] | undefined;
  let punkt: Utskottspunkt | undefined;
  if (handling.kind === "motion") {
    try {
      yrkanden = (await cachat(`yrk-${handling.dok_id}`, () => fetchYrkanden(politeFetch, handling.dok_id))) ?? undefined;
    } catch {
      yrkanden = undefined;
    }
  } else if (handling.kind === "votering" && k.bevis.kalla_dok_id) {
    const punkter = await hamtaPunkter(k.bevis.kalla_dok_id);
    punkt = punkter?.find((p) => p.punkt === (handling as { punkt?: number }).punkt);
  }

  const handlingstext = kalltext === null ? undefined : byggHandlingstext(punkt, yrkanden, kalltext, handling.kind);
  const { utfall, skal } = provaCitatet(k.bevis.citat, kalltext, handlingstext, k.bevis.brodtext_oppen);
  rader.push({ koppling_id: k.id, handling_id: k.handling_id, dok_id: kallDok, utfall, skal });
  if (i % 50 === 0) console.error(`  ${i} prövade`);
}

const status = svepstatus(rader);
console.log(`H2-svepet ${datum}: ${status.provade} publicerade kopplingar prövade mot riksdagens källor`);
console.log(`  ${status.haller} står ordagrant i handlingens egen del`);
console.log(`  ${status.brodtext_med_grund} citerar brödtexten på utskriven grund`);
console.log(`  ${status.oprovad} kunde inte prövas (hämtningen föll eller lydelserna gick inte att läsa)`);
console.log(`  ${status.fynd.length} att läsa`);
for (const f of status.fynd) console.log(`  FYND ${f.koppling_id} (${f.utfall}) ${f.skal}`);

if (!torr) {
  writeFileSync(
    resolve(rot, "data/h2-svepet.json"),
    JSON.stringify(
      {
        syfte:
          "Veckans omprövning av H2 mot riksdagens källor för publicerade kopplingar. " +
          "Rapporterande, aldrig en spärr. Se handlingsvagen/pipeline/src/h2svepet.ts.",
        kord: datum,
        ...status,
        // Varje prövad koppling står kvar med sitt utfall, inte bara
        // sammanräkningen. Ett svep som bara skriver «777 håller» går inte
        // att kontrollera, och den vecka ett tal ändras går det inte att se
        // VILKEN koppling som bytte läge. Raderna är stabila mellan veckor,
        // så diffen är tom när ingenting rört sig.
        rader: rader.slice().sort((a, b) => a.koppling_id.localeCompare(b.koppling_id)),
      },
      null,
      2,
    ) + "\n",
  );
  console.log("\nsvepet → data/h2-svepet.json");
}

if (svepetArTrasigt(status)) {
  console.error("\nSvepet mätte nästan ingenting — mer än hälften kunde inte prövas. Det är ett trasigt svep, inte ett friskintyg.");
  process.exit(1);
}
