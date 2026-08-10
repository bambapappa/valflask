/**
 * Vendorar in ett SLIMMAT utdrag ur valflask (Fläskvågens publika data) till
 * detta repo, så att Handlingsvågens egen sajt kan byggas fristående utan att
 * nå in i systerrepot vid byggtid (b-0017: egen Pages-sajt; b-0019: vendorat
 * index). Källan är och förblir valflask — det här är en läskopia som skrivs
 * om varje gång datat ändras, aldrig en andra sanning.
 *
 *   npm run vendor -- \
 *     --promises <valflask data/promises.json> \
 *     --parties  <valflask data/parties.json>
 *
 * Skriver:
 *   data/loften-index.json  — ett kort löftesobjekt per löfte (rutnätets rader,
 *                             detaljhuvud och sökindex): titel, kategori,
 *                             partier, citat, datum, käll- och arkivlänk.
 *   data/parties.json       — de åtta riksdagspartierna (rutnätets kolumner och
 *                             domsmotorns partiuniversum), kod/namn/block.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { byggKopia, type RaLoftesuppgift } from "../src/vendorkopia.ts";

function parseArgs(argv: string[]) {
  let promisesPath = process.env.PROMISES_PATH ?? "/home/user/valflask/data/promises.json";
  let partiesPath = process.env.PARTIES_PATH ?? "/home/user/valflask/data/parties.json";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--promises") promisesPath = resolve(argv[++i]!);
    else if (argv[i] === "--parties") partiesPath = resolve(argv[++i]!);
  }
  return { promisesPath, partiesPath };
}

interface RawParty {
  code: string;
  name: string;
  block: string;
}

function main() {
  const { promisesPath, partiesPath } = parseArgs(process.argv.slice(2));
  const rot = resolve(import.meta.dirname, "../..");

  const promises: RaLoftesuppgift[] = JSON.parse(readFileSync(promisesPath, "utf8"));
  const loften = byggKopia(promises);

  const parties: RawParty[] = JSON.parse(readFileSync(partiesPath, "utf8"));
  const partier = parties.map((p) => ({ code: p.code, namn: p.name, block: p.block }));

  writeFileSync(resolve(rot, "data/loften-index.json"), JSON.stringify(loften, null, 2) + "\n");
  writeFileSync(resolve(rot, "data/parties.json"), JSON.stringify(partier, null, 2) + "\n");
  console.log(`vendorat: ${loften.length} löften, ${partier.length} partier`);
}

main();
