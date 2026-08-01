/**
 * Race-säker union-merge av provade-par.json efter en förslagskörning
 * (foreslag-workflowns pushloop):
 *
 *   node --import tsx/esm scripts/provade-uppdatera.mts <resultatfil>
 *
 * Läser data/provade-par.json (färskt läge från defaultgrenen) och förenar
 * med körningens resultat. Minnet är append-only — en union kan aldrig tappa
 * ett prövat par, så ingen startfil behövs (till skillnad från kö-mergen).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { mergeProvade } from "../src/provade.ts";

const [resultatfil] = process.argv.slice(2);
if (!resultatfil) {
  console.error("Användning: provade-uppdatera <resultatfil>");
  process.exit(1);
}

const path = resolve(import.meta.dirname, "../../data/provade-par.json");
const farsk: string[] = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
const resultat: string[] = existsSync(resolve(resultatfil)) ? JSON.parse(readFileSync(resolve(resultatfil), "utf8")) : [];

const uppdaterad = mergeProvade(farsk, resultat);
writeFileSync(path, JSON.stringify(uppdaterad, null, 2) + "\n");
console.log(`provade par: ${farsk.length} före, ${resultat.length} i körningen, ${uppdaterad.length} efter`);
