/**
 * Race-säker uppdatering av kopplingskön efter en förslagskörning
 * (foreslag-workflowns pushloop):
 *
 *   node --import tsx/esm scripts/ko-uppdatera.mts <startfil> <resultatfil>
 *
 * Läser data/kopplingsforslag.json (färskt läge från defaultgrenen), lägger
 * på körningens NYA poster (i resultatfilen men inte i startfilen) och
 * skriver tillbaka. Poster ägaren avgjorde under körningen återuppstår
 * aldrig — de fanns i startläget och räknas inte som nya.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { laggTillNyaKoPoster, nyaKoPoster, stadaAvgjorda, type KoPost } from "../src/granskning.ts";

const [startfil, resultatfil] = process.argv.slice(2);
if (!startfil || !resultatfil) {
  console.error("Användning: ko-uppdatera <startfil> <resultatfil>");
  process.exit(1);
}

const koPath = resolve(import.meta.dirname, "../../data/kopplingsforslag.json");
const farsk = JSON.parse(readFileSync(koPath, "utf8")) as KoPost[];
const start = JSON.parse(readFileSync(resolve(startfil), "utf8")) as KoPost[];
const resultat = JSON.parse(readFileSync(resolve(resultatfil), "utf8")) as KoPost[];

const nya = nyaKoPoster(start, resultat);
const uppdaterad = laggTillNyaKoPoster(farsk, start, resultat);

// Ett tillbakadraget löfte har ett mänskligt beslut bakom sig. Ligger ett
// förslag kvar mot det kan kopplingen godkännas mot ett löfte som inte finns.
const loften = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../data/promises.json"), "utf8"),
) as Array<{ id: string; status?: string }>;
const aktivaLoften = new Set<string>(
  loften.filter((p) => p.status !== "tillbakadragen").map((p) => p.id),
);
const { kvar, bortstadade } = stadaAvgjorda(uppdaterad, aktivaLoften);
if (bortstadade.length > 0) {
  console.log(
    `Städade ${bortstadade.length} förslag mot tillbakadragna löften:\n  ` +
      bortstadade.map((p) => `${p.promise_id} ↔ ${p.handling_id}`).join("\n  "),
  );
}

writeFileSync(koPath, JSON.stringify(kvar, null, 2) + "\n");
console.log(`kö: ${farsk.length} före, ${nya.length} nya ur körningen, ${kvar.length} efter`);
