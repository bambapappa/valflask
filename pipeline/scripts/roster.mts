/**
 * HV3-komplettering: hämtar per-ledamotsrösterna för KOPPLADE voteringar
 * till data/roster/<votering_id>.json. Bara voteringar som förekommer i
 * godkända kopplingar (data/kopplingar.json) hämtas — ledamotsmeriter
 * beräknas aldrig på voteringar ingen koppling pekar på.
 *
 *   npm run roster            # hämtar det som saknas
 *   npm run roster -- --om    # hämtar om även befintliga filer
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fetchVoteringRader, type HttpFetch } from "../src/riksdagen.ts";
import type { Handling } from "../src/handlingar.ts";
import type { Koppling } from "../src/domar.ts";

const politeFetch: HttpFetch = async (url) => {
  await new Promise((r) => setTimeout(r, 300));
  return fetch(url);
};

async function main() {
  const om = process.argv.includes("--om");
  const rot = resolve(import.meta.dirname, "../..");
  const kopplingar: Koppling[] = JSON.parse(readFileSync(resolve(rot, "data/kopplingar.json"), "utf8"));
  const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));
  const hById = new Map(handlingar.map((h) => [h.id, h]));

  const voteringIdn = new Set<string>();
  for (const k of kopplingar) {
    if (k.status !== "aktiv") continue;
    const h = hById.get(k.handling_id);
    if (h?.kind === "votering" && h.votering_id) voteringIdn.add(h.votering_id);
  }
  console.log(`${voteringIdn.size} kopplade voteringar`);

  const dir = resolve(rot, "data/roster");
  mkdirSync(dir, { recursive: true });
  let hamtade = 0;
  for (const vid of [...voteringIdn].sort()) {
    const fil = resolve(dir, `${vid}.json`);
    if (!om && existsSync(fil)) continue;
    const rader = await fetchVoteringRader(politeFetch, vid);
    rader.sort((a, b) => a.intressent_id.localeCompare(b.intressent_id));
    writeFileSync(fil, JSON.stringify(rader, null, 2) + "\n");
    hamtade += 1;
  }
  console.log(`klart: ${hamtade} hämtade, ${voteringIdn.size - hamtade} fanns redan`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
