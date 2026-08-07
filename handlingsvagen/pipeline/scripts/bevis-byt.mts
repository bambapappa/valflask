/**
 * Byter bevis på REDAN PUBLICERADE kopplingar — en läst hög i en körning.
 *
 * `godkann-lista` når bara kön. Är kopplingen godkänd är citatet publicerat
 * intill den, och bytet är därför en **rättelse**: posten i
 * `data/rattelser.json` skrivs av körningen, och bytet lämnar spår i
 * kopplingens motivering. Tyst rättelse är förbjuden.
 *
 *   npm run bevis-byt -- <fil>            # torrkörning, alltid först
 *   npm run bevis-byt -- <fil> --skriv
 *
 * En rad per byte, fälten åtskilda av tabb:
 *
 *   k-2026-0019<TAB>Riksdagen ställer sig bakom det som anförs i motionen om…
 *   k-2026-0044<TAB>Vi vill därför att…<TAB>yrkandet anvisar bara medel enligt en tabell
 *
 * Tredje fältet är skälet till att ett citat som INTE står bland handlingens
 * egna lydelser ändå tas in. Utan skäl faller raden. Rader som börjar med #
 * är kommentarer.
 *
 * **Skriptet väljer aldrig citat.** Det hämtar källan, prövar det som står i
 * listan och skriver. Valet är en människas — kör
 * `handlingens-egna-ord`-skillen för att få lydelserna att välja mellan.
 *
 * Faller en enda rad skrivs ingenting. En halv verkställighet syns inte.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Handling } from "../src/handlingar.ts";
import {
  fetchDokumentText,
  fetchUtskottspunkter,
  fetchYrkanden,
  type Utskottspunkt,
  type Yrkande,
} from "../src/riksdagen.ts";
import { byggHandlingstext } from "../src/foreslag.ts";
import type { KopplingPost } from "../src/granskning.ts";
import { bytBevis, provaByte, rattelsePost, type Byte } from "../src/bevisbyte.ts";
import { cachat, politeFetch } from "./kallcache.mts";
import { kanon, lasProvningar } from "../../../pipeline/src/provningar.ts";

const rot = resolve(import.meta.dirname, "../..");
const rotData = resolve(rot, "../data");
const kopplingarPath = resolve(rot, "data/kopplingar.json");
const rattelserPath = resolve(rot, "data/rattelser.json");

const [listfil] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const skriv = process.argv.includes("--skriv");
const datum = new Date().toISOString().slice(0, 10);

if (!listfil) {
  console.error("Ange en fil med en rad per byte: <koppling-id><TAB><nytt citat>[<TAB><skäl>]");
  process.exit(1);
}

const byten: Byte[] = readFileSync(resolve(listfil), "utf8")
  .split("\n")
  .filter((r) => r.trim() !== "" && !r.trimStart().startsWith("#"))
  .map((r) => {
    const [id, citat, skal] = r.split("\t");
    return {
      id: (id ?? "").trim(),
      citat: (citat ?? "").trim(),
      ...(skal?.trim() ? { brodtextSkal: skal.trim() } : {}),
    };
  });

const kopplingar: KopplingPost[] = JSON.parse(readFileSync(kopplingarPath, "utf8"));
const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));

const punktCache = new Map<string, Utskottspunkt[]>();
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

const fel: string[] = [];
const gjorda: { koppling: KopplingPost; byte: Byte }[] = [];
let paUndantag = 0;
const uppdaterade = new Map<string, KopplingPost>();

for (const byte of byten) {
  const koppling = kopplingar.find((k) => k.id === byte.id);
  if (!koppling) {
    fel.push(`${byte.id}: finns inte i kopplingar.json — ligger den kvar i kön? Använd godkann-lista.`);
    continue;
  }
  if (koppling.status !== "aktiv") {
    fel.push(`${byte.id}: är ${koppling.status} — ett indraget belägg byts inte, det är redan borta.`);
    continue;
  }
  if (uppdaterade.has(byte.id)) {
    fel.push(`${byte.id}: står två gånger i listan — vilket citat som skulle gälla går inte att veta.`);
    continue;
  }

  const handling = handlingar.find((h) => h.id === koppling.handling_id);
  if (!handling) {
    fel.push(`${byte.id}: handlingen ${koppling.handling_id} finns inte i handlingar.json.`);
    continue;
  }

  // Citatet prövas mot det dokument det ska stå i: betänkandet för en
  // votering, annars handlingens eget dokument.
  const kallDok = koppling.bevis.kalla_dok_id ?? handling.dok_id;
  const kalltext = await cachat(`text-${kallDok}`, () => fetchDokumentText(politeFetch, kallDok));
  if (kalltext === null) {
    fel.push(`${byte.id}: källdokumentet ${kallDok} gick inte att hämta — citatet är oprövat.`);
    continue;
  }

  // Handlingens EGNA lydelser: motionens yrkanden, voteringspunktens
  // beslutstext. En fråga eller interpellation har ingen yrkandeform, och
  // ska aldrig fällas för att den saknar en.
  let yrkanden: Yrkande[] | undefined;
  let punkt: Utskottspunkt | undefined;
  if (handling.kind === "motion") {
    try {
      // `cachat` svarar null när hämtningen faller — och en tom yrkandelista
      // är inte samma sak som en lista vi inte kunde hämta.
      yrkanden = (await cachat(`yrk-${handling.dok_id}`, () => fetchYrkanden(politeFetch, handling.dok_id))) ?? undefined;
    } catch {
      yrkanden = undefined;
    }
  } else if (handling.kind === "votering" && koppling.bevis.kalla_dok_id) {
    const punkter = await hamtaPunkter(koppling.bevis.kalla_dok_id);
    punkt = punkter?.find((p) => p.punkt === (handling as { punkt?: number }).punkt);
  }
  const handlingstext = byggHandlingstext(punkt, yrkanden, kalltext);

  // Här skiljer sig skriptet medvetet från förslagsmotorn. Där får en
  // misslyckad hämtning av yrkandena passera — förslaget prövas ändå av en
  // människa efteråt. Här rättar vi PUBLICERAT data, och kontrollen av var
  // citatet står är hela skälet till att skriptet finns. Uteblir den tyst
  // har vi bytt ett belägg utan att veta om det nya är bättre.
  const kravLydelser = handling.kind === "motion" || handling.kind === "votering";
  if (kravLydelser && !handlingstext) {
    fel.push(
      `${byte.id}: handlingens egna lydelser gick inte att hämta (${handling.kind} ${handling.dok_id}) — ` +
        "kontrollen av var citatet står hade uteblivit tyst. Kör om när riksdagens api svarar.",
    );
    continue;
  }

  const prov = provaByte(byte, koppling.bevis.citat, kalltext, handlingstext);
  if (!prov.ok) {
    fel.push(`${byte.id}: ${prov.skal.join("; ")}`);
    continue;
  }
  if (prov.paUndantag) paUndantag += 1;

  uppdaterade.set(byte.id, bytBevis(koppling, byte, datum));
  gjorda.push({ koppling, byte });
}

console.log(
  `${byten.length} rader — ${gjorda.length} bevis prövade och klara att bytas ` +
    `(${paUndantag} på ett utskrivet undantag), ${fel.length} föll`,
);
for (const f of fel) console.log(`  ${f}`);

// Faller EN rad är listan inte den en människa sa ja till.
if (fel.length > 0) {
  console.error("\nInget skrivet — rätta listan och kör om.");
  process.exit(1);
}
if (gjorda.length === 0) {
  console.log("Ingenting att byta.");
  process.exit(0);
}

// Ett bytt citat gör kopplingens prövning i kvalitetsfiltret inaktuell:
// prövningen uttalade sig om det gamla belägget. Det stoppar inte bytet —
// rättelsen ska göras — men saken ska prövas om, och det syns inte av sig
// själv.
const provningar = lasProvningar(rotData);
const inaktuella = gjorda
  .filter(({ koppling }) => {
    const p = provningar.get(koppling.id);
    return p !== undefined && p.underlag_hash === kanon("koppling", koppling as unknown as Record<string, unknown>);
  })
  .map(({ koppling }) => koppling.id);

const nyaKopplingar = kopplingar.map((k) => uppdaterade.get(k.id) ?? k);
const rattelser: unknown[] = existsSync(rattelserPath)
  ? JSON.parse(readFileSync(rattelserPath, "utf8"))
  : [];
const post = rattelsePost(gjorda, datum);

console.log(`\nRättelsepost som skrivs:\n  ${post.affects}`);
if (inaktuella.length > 0) {
  console.log(
    `\n⚠ ${inaktuella.length} koppling(ar) har en prövning i kvalitetsfiltret som blir\n` +
      "  inaktuell av bytet — belägget är inte det som prövades. Pröva om dem:\n" +
      `  ${inaktuella.join(", ")}`,
  );
}

if (!skriv) {
  console.log("\ntorrkörning — lägg till --skriv för att verkställa.");
  process.exit(0);
}

writeFileSync(kopplingarPath, JSON.stringify(nyaKopplingar, null, 2) + "\n");
writeFileSync(rattelserPath, JSON.stringify([...rattelser, post], null, 2) + "\n");
console.log(`\nskrivet: ${kopplingarPath}, ${rattelserPath}`);
console.log(
  "Kvar att göra för hand:\n" +
    "  · backfilla den riktiga commit-hashen i rättelseposten (andra commiten)\n" +
    "  · kör koppling-sync efter sammanslagningen, annars visar issuet det gamla citatet",
);
