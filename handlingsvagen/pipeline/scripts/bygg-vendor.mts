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

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { byggKopia, type RaLoftesuppgift } from "../src/vendorkopia.ts";

/**
 * Grannens data ligger ett steg upp: Handlingsvågen bor i `handlingsvagen/`
 * inuti valflask, så Fläskvågens `data/` är systerkatalogen till vår egen.
 *
 * Standardvärdet VAR `/home/user/valflask/data/promises.json` — en sökväg som
 * bara finns i en byggcontainer. Utanför den föll körningen på ENOENT, och det
 * var det bästa som kunde hända: hade sökvägen funnits hade skriptet läst
 * någon annans data utan att säga ifrån. En standard ska peka på repot den
 * ligger i, inte på maskinen den råkade köras på först.
 */
function parseArgs(argv: string[]) {
  const grannen = (fil: string) => resolve(import.meta.dirname, "../../..", "data", fil);
  let promisesPath = process.env.PROMISES_PATH ?? grannen("promises.json");
  let partiesPath = process.env.PARTIES_PATH ?? grannen("parties.json");
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--promises") promisesPath = resolve(argv[++i]!);
    else if (argv[i] === "--parties") partiesPath = resolve(argv[++i]!);
  }
  for (const [flagga, sokvag] of [["--promises", promisesPath], ["--parties", partiesPath]] as const) {
    if (!existsSync(sokvag)) {
      throw new Error(
        `Hittar inte ${sokvag}. Ange ${flagga} <sökväg> eller sätt ` +
          `${flagga === "--promises" ? "PROMISES_PATH" : "PARTIES_PATH"}.`,
      );
    }
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
