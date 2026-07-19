/**
 * Skördare: hämtar dokument och voteringar ur riksdagens öppna data och
 * uppdaterar data/handlingar.json idempotent.
 *
 *   npm run harvest -- --rm 2025/26 --typ mot,ip,fr --limit 2
 *   npm run harvest -- --rm 2022/23 --rm 2023/24 --typ mot,prop,ip,fr,vot
 *
 * --limit N begränsar till N sidor per typ (rökprov). Utan --limit skördas
 * allt. --out styr målfilen (standard ../data/handlingar.json).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  fetchDokument,
  fetchPersoner,
  fetchVoteringar,
  type DokTyp,
  type HttpFetch,
} from "../src/riksdagen.ts";
import {
  berikaPartier,
  mergeHandlingar,
  normaliseraDokument,
  normaliseraVoteringar,
  sorteraHandlingar,
  type Handling,
} from "../src/handlingar.ts";

function parseArgs(argv: string[]) {
  const rms: string[] = [];
  let typer = ["mot", "prop", "ip", "fr", "vot"];
  let limit: number | undefined;
  let out = resolve(import.meta.dirname, "../../data/handlingar.json");
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--rm") rms.push(argv[++i]!);
    else if (a === "--typ") typer = argv[++i]!.split(",");
    else if (a === "--limit") limit = Number(argv[++i]);
    else if (a === "--out") out = resolve(argv[++i]!);
  }
  if (rms.length === 0) rms.push("2025/26");
  return { rms, typer, limit, out };
}

const politeFetch: HttpFetch = async (url) => {
  await new Promise((r) => setTimeout(r, 300)); // artigt tempo mot öppna data
  return fetch(url);
};

async function main() {
  const { rms, typer, limit, out } = parseArgs(process.argv.slice(2));
  const existing: Handling[] = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : [];
  console.log(`start: ${existing.length} kända handlingar, riksmöten ${rms.join(", ")}, typer ${typer.join(",")}`);

  console.log("hämtar ledamotsregistret …");
  const personer = await fetchPersoner(politeFetch);
  const partiAvId = new Map(personer.map((p) => [p.intressent_id, p.parti]));
  console.log(`  ${personer.length} personer`);

  const incoming: Array<Omit<Handling, "id">> = [];
  for (const rm of rms) {
    for (const typ of typer) {
      if (typ === "vot") {
        console.log(`voteringar ${rm} …`);
        const rader = await fetchVoteringar(politeFetch, rm, limit ? { sz: limit * 200 } : {});
        const norm = normaliseraVoteringar(rader);
        console.log(`  ${rader.length} röster → ${norm.length} voteringspunkter`);
        incoming.push(...norm);
      } else {
        console.log(`${typ} ${rm} …`);
        const dok = await fetchDokument(politeFetch, typ as DokTyp, rm, limit ? { maxPages: limit } : {});
        const norm = dok
          .map((d) => normaliseraDokument(berikaPartier(d, partiAvId)))
          .filter((h): h is NonNullable<typeof h> => h !== null);
        console.log(`  ${dok.length} dokument → ${norm.length} handlingar`);
        incoming.push(...norm);
      }
    }
  }

  const year = new Date().getFullYear();
  const merged = mergeHandlingar(existing, sorteraHandlingar(incoming), year);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(merged, null, 2) + "\n");
  console.log(`klart: ${merged.length} handlingar (${merged.length - existing.length} nya) → ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
