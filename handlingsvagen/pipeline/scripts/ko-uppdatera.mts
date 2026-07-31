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
import { laggTillNyaKoPoster, nyaKoPoster, type KoPost } from "../src/granskning.ts";

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
writeFileSync(koPath, JSON.stringify(uppdaterad, null, 2) + "\n");
console.log(`kö: ${farsk.length} före, ${nya.length} nya ur körningen, ${uppdaterad.length} efter`);
