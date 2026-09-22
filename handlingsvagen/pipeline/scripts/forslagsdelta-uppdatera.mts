/**
 * För ihop förslagskörningens resultat med färsk defaultgren i ett filpaket.
 *
 *   node --import tsx/esm scripts/forslagsdelta-uppdatera.mts <kö-start> <kö-resultat> <provade-resultat>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { lasForslagsdelta, skrivForslagsdelta } from "../src/forslagsdelta-skrivning.ts";
import type { KoPost } from "../src/granskning.ts";

const [startfil, resultatfil, provadefil] = process.argv.slice(2);
if (!startfil || !resultatfil || !provadefil) {
  console.error("Användning: forslagsdelta-uppdatera <kö-start> <kö-resultat> <provade-resultat>");
  process.exit(1);
}

function lista<T>(fil: string): T[] {
  const värde: unknown = JSON.parse(readFileSync(resolve(fil), "utf8"));
  if (!Array.isArray(värde)) throw new Error(`${fil} ska vara en lista`);
  return värde as T[];
}

const dataDir = resolve(import.meta.dirname, "../../data");
const { fore } = lasForslagsdelta(dataDir);
const start = lista<KoPost>(startfil);
const resultat = lista<KoPost>(resultatfil);
const provadeResultat = lista<string>(provadefil);
const loften = lista<{ id: string; status?: string }>(resolve(import.meta.dirname, "../../../data/promises.json"));
const aktivaLoften = new Set(loften.filter((p) => p.status !== "tillbakadragen").map((p) => p.id));

const ut = skrivForslagsdelta(dataDir, fore, start, resultat, provadeResultat, aktivaLoften);
if (ut.bortstadade.length > 0) {
  console.log(`Städade ${ut.bortstadade.length} förslag mot tillbakadragna löften:\n  ` +
    ut.bortstadade.map((p) => `${p.promise_id} ↔ ${p.handling_id}`).join("\n  "));
}
console.log(`kö: ${ut.koFore} före, ${ut.koNya} nya ur körningen, ${ut.koEfter} efter`);
console.log(`provade par: ${ut.provadeFore} före, ${provadeResultat.length} i körningen, ${ut.provadeEfter} efter`);
console.log(ut.andrat ? "Båda filerna prövade och skrivna i ett paket." : "Inga ändringar — inget skrivet.");
