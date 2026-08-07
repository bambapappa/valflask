/**
 * Fyller fältet `avslaget` på kopplingar vars bevis bara avslår motioner.
 *
 * En sådan beslutstext är handlingens egen och passerar citatgrinden, men den
 * säger bara ATT några yrkanden föll — inte vad de begärde. Läsaren ser en
 * lista på nummer. Punkten pekar däremot ut varje yrkande med riksmöte,
 * beteckning, parti och nummer, så lydelsen ligger ett uppslag bort i
 * motionens egen yrkandelista hos riksdagen.
 *
 * Skriptet hämtar den lydelsen. Det skriver aldrig egen text: står lydelsen
 * inte att få tag på lämnas posten orörd och räknas som ett fel, för ett
 * tomt fält som ser ifyllt ut är värre än ett tomt fält.
 *
 *   npm run avslag-backfill                      # torrkörning, alla som behöver
 *   npm run avslag-backfill -- --skriv
 *   npm run avslag-backfill -- --koppling k-2026-0021 --skriv
 *
 * Hämtningarna cachas i data/.kallcache/ (delad med ko-kontrollera).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { avslagsbeslut } from "../src/grindar.ts";
import type { Avslag, KopplingPost } from "../src/granskning.ts";
import type { Handling } from "../src/handlingar.ts";
import {
  fetchMotionDokId,
  fetchUtskottspunkter,
  fetchYrkanden,
  parseAvslagsreferenser,
} from "../src/riksdagen.ts";
import { cachat, politeFetch } from "./kallcache.mts";

const rot = resolve(import.meta.dirname, "../..");
const kopplingarPath = resolve(rot, "data/kopplingar.json");

const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
const bara = argv.includes("--koppling") ? argv[argv.indexOf("--koppling") + 1] : undefined;

const kopplingar: KopplingPost[] = JSON.parse(readFileSync(kopplingarPath, "utf8"));
const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));
const hById = new Map(handlingar.map((h) => [h.id, h]));

const behover = kopplingar.filter(
  (k) =>
    k.status === "aktiv" &&
    avslagsbeslut(k.bevis?.citat ?? "") &&
    (k.avslaget ?? []).length === 0 &&
    (bara === undefined || k.id === bara),
);

console.log(`${behover.length} kopplingar behöver fältet avslaget${bara ? ` (filtrerat på ${bara})` : ""}`);

const fel: string[] = [];
let fyllda = 0;
for (const k of behover) {
  const h = hById.get(k.handling_id);
  const dok = k.bevis.kalla_dok_id ?? h?.dok_id;
  if (!h || !dok) {
    fel.push(`${k.id}: handlingen saknas eller saknar dokument-id`);
    continue;
  }

  // Referenserna läses ur punktens EGEN beslutstext hos riksdagen, inte ur
  // det sparade citatet — så att en avkortning i citatet inte tappar en
  // motion på vägen.
  const punkter = await cachat(`punkter-${dok}`, () => fetchUtskottspunkter(politeFetch, dok));
  const punkt = (punkter ?? []).find((p) => p.punkt === h.punkt);
  if (!punkt) {
    fel.push(`${k.id}: punkt ${h.punkt ?? "?"} finns inte i ${dok}`);
    continue;
  }

  const avslaget: Avslag[] = [];
  for (const ref of parseAvslagsreferenser(punkt.forslag)) {
    const dokId = await cachat(`motdok-${ref.rm.replace("/", "-")}-${ref.beteckning}`, () =>
      fetchMotionDokId(politeFetch, ref.rm, ref.beteckning),
    );
    if (!dokId) {
      fel.push(`${k.id}: hittar inte motion ${ref.rm}:${ref.beteckning} hos riksdagen`);
      continue;
    }
    const yrkanden = await cachat(`yrkanden-${dokId}`, () => fetchYrkanden(politeFetch, dokId));
    if (!yrkanden || yrkanden.length === 0) {
      fel.push(`${k.id}: motion ${ref.rm}:${ref.beteckning} (${dokId}) saknar yrkandelista`);
      continue;
    }
    const valda = ref.yrkanden.length > 0 ? yrkanden.filter((y) => ref.yrkanden.includes(y.nummer)) : yrkanden;
    if (valda.length === 0) {
      fel.push(`${k.id}: yrkande ${ref.yrkanden.join(", ")} finns inte i ${ref.rm}:${ref.beteckning}`);
      continue;
    }
    for (const y of valda) {
      avslaget.push({
        motion: `${ref.rm}:${ref.beteckning}`,
        parti: ref.parti,
        ...(ref.yrkanden.length > 0 ? { yrkande: y.nummer } : {}),
        dok_id: dokId,
        lydelse: y.lydelse,
      });
    }
  }

  if (avslaget.length === 0) {
    fel.push(`${k.id}: inga yrkanden gick att hämta — fältet lämnas tomt`);
    continue;
  }
  k.avslaget = avslaget;
  fyllda += 1;
  console.log(`\n${k.id} — ${punkt.rubrik} (punkt ${punkt.punkt})`);
  for (const a of avslaget) {
    console.log(`  ${a.motion}${a.yrkande ? ` yrkande ${a.yrkande}` : ""} (${a.parti || "-"}): ${a.lydelse.slice(0, 140)}`);
  }
}

console.log(`\n${fyllda} fyllda, ${fel.length} fel`);
for (const f of fel) console.log(`  ${f}`);

// Faller en enda post är fältet inte hämtat för hela högen. Skriv ingenting
// då: en halv verkställighet syns inte, ett stopp gör det.
if (fel.length > 0) {
  console.error("Inget skrivet — rätta felen och kör om.");
  process.exit(1);
}
if (skriv) {
  writeFileSync(kopplingarPath, JSON.stringify(kopplingar, null, 2) + "\n");
  console.log(`skrivet: ${kopplingarPath}`);
} else {
  console.log("torrkörning — lägg till --skriv för att verkställa.");
}
