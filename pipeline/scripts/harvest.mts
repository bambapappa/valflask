/**
 * Skördare: hämtar dokument och voteringar ur riksdagens öppna data och
 * uppdaterar data/handlingar.json idempotent.
 *
 *   npm run harvest -- --rm 2025/26 --typ mot,ip,fr --limit 2
 *   npm run harvest -- --rm 2022/23 --rm 2023/24 --typ mot,prop,ip,fr,vot
 *   npm run harvest -- --rm 2022/23 --typ bet
 *
 * --limit N begränsar till N sidor per dokumenttyp och N voteringar per
 * riksmöte (rökprov). Utan --limit skördas allt. --out styr målfilen
 * (standard ../data/handlingar.json).
 *
 * Typen "bet" (betänkanden — voteringars källtexter) går till ett eget
 * index, betankanden.json bredvid målfilen, aldrig in i handlingar.json:
 * betänkanden är utskottsdokument utan partiaktör. Den ingår inte i
 * standardtyperna — skörda den uttryckligen med --typ bet.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  fetchDokument,
  fetchPersoner,
  fetchVoteringRader,
  fetchVoteringsIdn,
  type DokTyp,
} from "../src/riksdagen.ts";
import {
  berikaPartier,
  mergeHandlingar,
  normaliseraDokument,
  normaliseraVotering,
  sorteraHandlingar,
  type Handling,
} from "../src/handlingar.ts";
import { mergeBetankanden, normaliseraBetankande, type Betankande } from "../src/betankanden.ts";
import { politeFetch } from "./hamta.mts";

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


async function main() {
  const { rms, typer, limit, out } = parseArgs(process.argv.slice(2));
  const existing: Handling[] = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : [];
  console.log(`start: ${existing.length} kända handlingar, riksmöten ${rms.join(", ")}, typer ${typer.join(",")}`);

  console.log("hämtar ledamotsregistret …");
  const personer = await fetchPersoner(politeFetch);
  const partiAvId = new Map(personer.map((p) => [p.intressent_id, p.parti]));
  console.log(`  ${personer.length} personer`);

  // Delsparning efter varje (riksmöte, typ)-block: ett avbrott kostar som
  // mest ett block, och omkörning är idempotent via mergeHandlingar.
  const year = new Date().getFullYear();
  let merged = existing;
  mkdirSync(dirname(out), { recursive: true });
  const spara = (chunk: Array<Omit<Handling, "id">>) => {
    merged = mergeHandlingar(merged, sorteraHandlingar(chunk), year);
    writeFileSync(out, JSON.stringify(merged, null, 2) + "\n");
  };

  const betPath = resolve(dirname(out), "betankanden.json");
  for (const rm of rms) {
    for (const typ of typer) {
      if (typ === "bet") {
        console.log(`bet ${rm} …`);
        const dok = await fetchDokument(politeFetch, "bet", rm, limit ? { maxPages: limit } : {});
        const norm = dok
          .map((d) => normaliseraBetankande(d))
          .filter((b): b is Betankande => b !== null);
        const existingBet: Betankande[] = existsSync(betPath) ? JSON.parse(readFileSync(betPath, "utf8")) : [];
        const mergedBet = mergeBetankanden(existingBet, norm);
        writeFileSync(betPath, JSON.stringify(mergedBet, null, 2) + "\n");
        console.log(`  ${dok.length} dokument → ${norm.length} indexposter, ${mergedBet.length} totalt → ${betPath}`);
        continue; // eget index — handlingsräknaren gäller inte här
      } else if (typ === "vot") {
        console.log(`voteringar ${rm} …`);
        const idn = await fetchVoteringsIdn(politeFetch, rm);
        const take = limit ? idn.slice(0, limit) : idn;
        console.log(`  ${idn.length} voteringspunkter${limit ? `, tar ${take.length}` : ""}`);
        const chunk: Array<Omit<Handling, "id">> = [];
        let done = 0;
        for (const vid of take) {
          const h = normaliseraVotering(await fetchVoteringRader(politeFetch, vid));
          if (h) chunk.push(h);
          done += 1;
          if (done % 50 === 0) console.log(`  … ${done}/${take.length}`);
        }
        spara(chunk);
      } else {
        console.log(`${typ} ${rm} …`);
        const dok = await fetchDokument(politeFetch, typ as DokTyp, rm, limit ? { maxPages: limit } : {});
        const norm = dok
          .map((d) => normaliseraDokument(berikaPartier(d, partiAvId)))
          .filter((h): h is NonNullable<typeof h> => h !== null);
        console.log(`  ${dok.length} dokument → ${norm.length} handlingar`);
        spara(norm);
      }
      console.log(`  sparat: ${merged.length} handlingar totalt`);
    }
  }

  console.log(`klart: ${merged.length} handlingar (${merged.length - existing.length} nya) → ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
