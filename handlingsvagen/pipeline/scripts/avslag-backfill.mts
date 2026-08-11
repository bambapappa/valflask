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
import { hamtaAvslagsunderlag } from "../src/avslagsunderlag.ts";
import type { KopplingPost } from "../src/granskning.ts";
import type { Handling } from "../src/handlingar.ts";
import {
  fetchMotionDokId,
  fetchUtskottspunkter,
  fetchYrkanden,
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

  let underlag;
  try {
    underlag = await hamtaAvslagsunderlag(k.id, h.punkt, dok, {
      punkter: (id) => cachat(`punkter-${id}`, () => fetchUtskottspunkter(politeFetch, id)),
      motionDokId: (rm, beteckning) => cachat(`motdok-${rm.replace("/", "-")}-${beteckning}`, () =>
        fetchMotionDokId(politeFetch, rm, beteckning)),
      yrkanden: (id) => cachat(`yrkanden-${id}`, () => fetchYrkanden(politeFetch, id)),
    });
  } catch (e) {
    fel.push(e instanceof Error ? e.message : String(e));
    continue;
  }
  k.avslaget = underlag.avslaget;
  fyllda += 1;
  console.log(`\n${k.id} — ${underlag.punkt.rubrik} (punkt ${underlag.punkt.punkt})`);
  for (const a of underlag.avslaget) {
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
