/**
 * Röstskörd (b-0012): hämtar ALLA voteringars per-ledamotsröster för givna
 * riksmöten och lagrar dem kompakt — data/roster/<riksmöte>.json med en
 * röststräng per votering (J/N/A/F, "-" = satt ej i kammaren) plus det
 * gemensamma personregistret data/personer.json.
 *
 *   npm run roster -- --rm 2022/23 --rm 2023/24
 *   npm run roster -- --rm 2025/26 --limit 5     # rökprov
 *
 * Körningen är idempotent: riksmötesfilen skrivs om i sin helhet ur samma
 * öppna data, personregistret merge-uppdateras.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fetchVoteringRader, fetchVoteringsIdn } from "../src/riksdagen.ts";
import { RmRosterBygge, mergePersoner, rmFilnamn, type Person } from "../src/roster.ts";
import { politeFetch } from "./hamta.mts";

function parseArgs(argv: string[]) {
  const rms: string[] = [];
  let limit: number | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--rm") rms.push(argv[++i]!);
    else if (argv[i] === "--limit") limit = Number(argv[++i]);
  }
  if (rms.length === 0) rms.push("2025/26");
  return { rms, limit };
}

async function main() {
  const { rms, limit } = parseArgs(process.argv.slice(2));
  const rot = resolve(import.meta.dirname, "../..");
  const registerPath = resolve(rot, "data/personer.json");
  const rosterDir = resolve(rot, "data/roster");
  mkdirSync(rosterDir, { recursive: true });

  for (const rm of rms) {
    console.log(`röster ${rm} …`);
    const idn = await fetchVoteringsIdn(politeFetch, rm);
    const take = limit ? idn.slice(0, limit) : idn;
    console.log(`  ${idn.length} voteringspunkter${limit ? `, tar ${take.length}` : ""}`);
    const bygge = new RmRosterBygge(rm);
    let done = 0;
    for (const vid of take) {
      bygge.laggTillVotering(await fetchVoteringRader(politeFetch, vid));
      done += 1;
      if (done % 50 === 0) console.log(`  … ${done}/${take.length}`);
    }
    const { roster, personer } = bygge.bygg();
    writeFileSync(resolve(rosterDir, rmFilnamn(rm)), JSON.stringify(roster, null, 2) + "\n");
    const register: Person[] = existsSync(registerPath) ? JSON.parse(readFileSync(registerPath, "utf8")) : [];
    const uppdaterat = mergePersoner(register, personer);
    writeFileSync(registerPath, JSON.stringify(uppdaterat, null, 2) + "\n");
    console.log(
      `  klart: ${roster.voteringar.length} voteringar, ${roster.personer.length} röstande, register ${uppdaterat.length} personer`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
