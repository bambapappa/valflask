/**
 * Genererar data/domar.json deterministiskt ur godkända kopplingar,
 * handlingar och roster. Skriptet är HELA skrivvägen — ingen människa och
 * ingen språkmodell redigerar domar.json (spec §4). Körs om vid varje
 * dataändring; en incheckad dom utan motsvarande kopplingar är ett testfel.
 *
 *   npm run vendor -- --promises <...> --parties <...>   (kör först)
 *   npm run domar  -- --promises <sökväg till valflask data/promises.json>
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

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Handling } from "../src/handlingar.ts";
import type { RdVoteringRad } from "../src/riksdagen.ts";
import { computeLedamotMeriter, computePartiDomar, targetId, type Koppling } from "../src/domar.ts";
import { avkodaRoster, type Person, type RmRoster } from "../src/roster.ts";

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
  const kopplingar: Koppling[] = JSON.parse(readFileSync(resolve(rot, "data/kopplingar.json"), "utf8"));
  const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));
  const promises: Array<{ id: string; parties: string[]; status?: string }> = JSON.parse(
    readFileSync(promisesPath, "utf8"),
  );

  // Rutnätet (b-0018 F1) visar alla åtta riksdagspartier per mål. Domar räknas
  // därför för hela partiuniversumet på varje mål med minst en aktiv koppling;
  // domsmotorn fyller bara en cell där partiet självt agerat (röst i kopplad
  // votering, eget författarskap) — övriga blir "ingen_handling_annu", en ärlig
  // tom cell. Mål utan kopplingar redovisas inte alls här ("ingen handling ännu"
  // för dem följer av frånvaron i filen).
  const partierAvMal = new Map(promises.map((p) => [p.id, p.parties]));
  const partiFil = resolve(rot, "data/parties.json");
  const universum: string[] | null = existsSync(partiFil)
    ? (JSON.parse(readFileSync(partiFil, "utf8")) as Array<{ code: string }>).map((p) => p.code)
    : null;
  if (!universum) {
    console.warn("data/parties.json saknas — faller tillbaka på målens egna partier (kör npm run vendor för alla åtta).");
  }
  const targetParties: Record<string, string[]> = {};
  for (const k of kopplingar) {
    if (k.status !== "aktiv") continue;
    const t = targetId(k);
    const egnaPartier = partierAvMal.get(t);
    if (!egnaPartier) throw new Error(`koppling ${k.id} pekar på okänt mål ${t}`);
    targetParties[t] = universum ?? egnaPartier;
  }

  // Röster i kompakt b-0012-format: personregister + röststrängar per riksmöte.
  const rosterDir = resolve(rot, "data/roster");
  const roster = new Map<string, RdVoteringRad[]>();
  const registerPath = resolve(rot, "data/personer.json");
  if (existsSync(rosterDir) && existsSync(registerPath)) {
    const register: Person[] = JSON.parse(readFileSync(registerPath, "utf8"));
    for (const fil of readdirSync(rosterDir)) {
      if (!fil.endsWith(".json")) continue;
      const rmRoster: RmRoster = JSON.parse(readFileSync(resolve(rosterDir, fil), "utf8"));
      for (const [vid, rader] of avkodaRoster(rmRoster, register)) roster.set(vid, rader);
    }
  }

  const partidomar = computePartiDomar(kopplingar, handlingar, targetParties);
  const ledamotsmeriter = computeLedamotMeriter(kopplingar, handlingar, roster);
  const ut = resolve(rot, "data/domar.json");
  writeFileSync(ut, JSON.stringify({ genererad: new Date().toISOString().slice(0, 10), partidomar, ledamotsmeriter }, null, 2) + "\n");
  console.log(`klart: ${partidomar.length} partidomar, ${ledamotsmeriter.length} ledamotsmeriter → ${ut}`);
}

main();
