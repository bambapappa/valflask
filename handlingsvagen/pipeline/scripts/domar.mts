/**
 * Genererar data/domar.json deterministiskt ur godkända kopplingar,
 * handlingar och roster. Skriptet är HELA skrivvägen — ingen människa och
 * ingen språkmodell redigerar domar.json (spec §4).
 *
 *   npm run vendor -- --promises <...> --parties <...>   (kör först)
 *   npm run domar  -- --promises <sökväg till valflask data/promises.json>
 *
 * Körs om vid varje dataändring. Att det faktiskt sker vaktas av
 * tests/domar-aktuell.test.ts, som räknar om ur samma inläsning
 * (src/domar-bygg.ts) och jämför med den incheckade filen. Den kontrollen
 * stod länge bara som ett påstående här utan att finnas — en incheckad dom
 * som inte stämde med kopplingarna gick igenom grönt i åtta dagar.
 *
 * Partidomar räknas för ALLA åtta riksdagspartier per mål med aktiv koppling
 * (b-0018 F1, b-0019): rutnätet visar alla partier, och varje cell fylls av
 * partiets EGEN handling — dess röst i en kopplad votering eller dess eget
 * författarskap av en kopplad motion/proposition. Partier utan kopplad
 * handling får status "ingen_handling_annu" (en ärlig tom cell). Motsvarande
 * grindkoder styr aldrig ett partis röst: rösten är öppna data, riktningen är
 * mänskligt beslutad. Partiuniversumet läses ur vendorade data/parties.json;
 * saknas den faller skriptet tillbaka på målets egna partier (äldre beteende).
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beraknaDomar } from "../src/domar-bygg.ts";

function parseArgs(argv: string[]) {
  let promisesPath: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--promises") promisesPath = resolve(argv[++i]!);
  }
  if (!promisesPath) throw new Error("--promises <sökväg> krävs (valflask data/promises.json)");
  return { promisesPath };
}

function main() {
  const { promisesPath } = parseArgs(process.argv.slice(2));
  const rot = resolve(import.meta.dirname, "../..");
  const { partidomar, ledamotsmeriter } = beraknaDomar(rot, promisesPath);
  const ut = resolve(rot, "data/domar.json");
  writeFileSync(
    ut,
    JSON.stringify(
      { genererad: new Date().toISOString().slice(0, 10), partidomar, ledamotsmeriter },
      null,
      2,
    ) + "\n",
  );
  console.log(`klart: ${partidomar.length} partidomar, ${ledamotsmeriter.length} ledamotsmeriter → ${ut}`);
}

main();
