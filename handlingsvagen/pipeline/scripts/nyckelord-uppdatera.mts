/**
 * Slår ihop en körnings nyckelordsskärvor med dem som redan ligger på
 * defaultgrenen — samma race-säkra mönster som provade-uppdatera.mts.
 *
 * Indexet är additivt: en handling som någon annan hunnit indexera ska
 * aldrig försvinna för att den här körningen inte kände till den. Vid
 * krock om samma handling vinner körningens egna termer (de är färskast).
 *
 *   node --import tsx/esm scripts/nyckelord-uppdatera.mts <resultatkatalog>
 *
 * Anropas av nyckelord.yml efter `git reset --hard origin/<default>`, med
 * körningens resultat undanlagt utanför arbetsträdet.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { DokumentTermer, Skarva } from "../src/nyckelord.ts";

const ROT = resolve(import.meta.dirname, "../..");
const MAL = join(ROT, "data/nyckelord");

function lasSkarva(sokvag: string): Skarva {
  return JSON.parse(readFileSync(sokvag, "utf8")) as Skarva;
}

function skriv(sokvag: string, handlingar: Record<string, DokumentTermer>): void {
  const sorterat: Record<string, DokumentTermer> = {};
  for (const id of Object.keys(handlingar).sort()) sorterat[id] = handlingar[id]!;
  writeFileSync(sokvag, JSON.stringify({ version: 1, handlingar: sorterat }, null, 2) + "\n");
}

const resultatkatalog = process.argv[2];
if (!resultatkatalog) {
  console.error("ange resultatkatalogen med körningens skärvor");
  process.exit(1);
}
if (!existsSync(resultatkatalog)) {
  console.log("ingen resultatkatalog — inget att slå ihop");
  process.exit(0);
}

mkdirSync(MAL, { recursive: true });
let nya = 0;
let totalt = 0;

for (const fil of readdirSync(resultatkatalog)) {
  if (!fil.endsWith(".json")) continue;
  const korning = lasSkarva(join(resultatkatalog, fil));
  const malfil = join(MAL, fil);
  const befintlig: Record<string, DokumentTermer> = existsSync(malfil)
    ? lasSkarva(malfil).handlingar
    : {};
  const fore = Object.keys(befintlig).length;
  // Körningens poster läggs ovanpå grenens — union, körningen vinner krock.
  const sammanslagen = { ...befintlig, ...korning.handlingar };
  nya += Object.keys(sammanslagen).length - fore;
  totalt += Object.keys(sammanslagen).length;
  skriv(malfil, sammanslagen);
}

console.log(`nyckelordsindex: ${nya} nya poster, ${totalt} totalt efter sammanslagning`);
