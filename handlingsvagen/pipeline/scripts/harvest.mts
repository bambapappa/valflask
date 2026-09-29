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
 *
 * DATUMFÖNSTER (--from/--tom) väljer dokument på datum i stället för på
 * riksmötestagg — septemberhandlingar bär förra riksmötets tagg och missas
 * annars. --from auto räknar startdagen ur målfilen (senaste daterade
 * handling minus ett överlapp); --tom är som standard dagens datum (UTC).
 * --rm ignoreras i fönsterläget. Voteringar kan inte väljas på datum (se
 * src/datumfonster.ts) — de skördas för riksmötena fönstret berör.
 *
 *   npm run harvest -- --from 2026-08-28 --tom 2026-09-29 --typ mot,prop,ip,fr,vot,bet
 *   npm run harvest -- --from auto --typ mot,prop,ip,fr,vot,bet
 *
 * I båda lägena hämtas bara voteringar vars id ännu inte finns i målfilen;
 * kända handlingar skrivs aldrig om (mergeHandlingar), så hämtningen av dem
 * var ren kostnad.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  fetchDokument,
  fetchPersoner,
  fetchVoteringRader,
  fetchVoteringsIdn,
  SaknarRostlista,
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
import {
  FONSTRETS_OVERLAPP_DAGAR,
  franDatumUrData,
  idagUtc,
  okandaVoteringsIdn,
  riksmotenForFonster,
  tolkaFonster,
  type Datumfonster,
} from "../src/datumfonster.ts";
import { politeFetch } from "./hamta.mts";

function parseArgs(argv: string[]) {
  const rms: string[] = [];
  let typer = ["mot", "prop", "ip", "fr", "vot"];
  let limit: number | undefined;
  let from: string | undefined;
  let tom: string | undefined;
  let out = resolve(import.meta.dirname, "../../data/handlingar.json");
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--rm") rms.push(argv[++i]!);
    else if (a === "--typ") typer = argv[++i]!.split(",");
    else if (a === "--limit") limit = Number(argv[++i]);
    else if (a === "--out") out = resolve(argv[++i]!);
    else if (a === "--from") from = argv[++i]!;
    else if (a === "--tom") tom = argv[++i]!;
    else throw new Error(`okänt argument: ${a}`);
  }
  if (tom !== undefined && from === undefined) throw new Error("--tom kräver --from");
  if (rms.length === 0 && from === undefined) rms.push("2025/26");
  return { rms, typer, limit, out, from, tom };
}

/** Fönstret ur argumenten, eller null i riksmötesläget. */
function bestamFonster(from: string | undefined, tom: string | undefined, existing: Handling[]): Datumfonster | null {
  if (from === undefined) return null;
  const start = from === "auto" ? franDatumUrData(existing, FONSTRETS_OVERLAPP_DAGAR) : from;
  return tolkaFonster(start, tom ?? idagUtc());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { typer, limit, out } = args;
  const existing: Handling[] = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : [];
  const fonster = bestamFonster(args.from, args.tom, existing);
  // I fönsterläget väljs dokument på datum (ett block, rm = null) och
  // voteringar för de riksmöten fönstret berör.
  const rms = fonster ? riksmotenForFonster(fonster) : args.rms;
  const urval = fonster
    ? `datumfönster ${fonster.from}–${fonster.tom} (voteringar: riksmöten ${rms.join(", ")})`
    : `riksmöten ${rms.join(", ")}`;
  console.log(`start: ${existing.length} kända handlingar, ${urval}, typer ${typer.join(",")}`);

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

  // Blocken i körordning. Riksmötesläget: varje (riksmöte, typ). Fönsterläget:
  // ett datumblock per dokumenttyp (rm = null), voteringar per riksmöte.
  const block: Array<{ typ: string; rm: string | null }> = fonster
    ? typer.flatMap((typ): Array<{ typ: string; rm: string | null }> =>
        typ === "vot" ? rms.map((rm) => ({ typ, rm })) : [{ typ, rm: null }],
      )
    : rms.flatMap((rm) => typer.map((typ) => ({ typ, rm })));
  const dokOpts = { ...(limit ? { maxPages: limit } : {}), ...(fonster ? { fonster } : {}) };
  const etikett = (rm: string | null) => rm ?? `${fonster!.from}–${fonster!.tom}`;

  const betPath = resolve(dirname(out), "betankanden.json");
  let betNya = 0;
  const utanRostlista: string[] = [];
  for (const { typ, rm } of block) {
    if (typ === "bet") {
      console.log(`bet ${etikett(rm)} …`);
      const dok = await fetchDokument(politeFetch, "bet", rm, dokOpts);
      const norm = dok
        .map((d) => normaliseraBetankande(d))
        .filter((b): b is Betankande => b !== null);
      const existingBet: Betankande[] = existsSync(betPath) ? JSON.parse(readFileSync(betPath, "utf8")) : [];
      const mergedBet = mergeBetankanden(existingBet, norm);
      writeFileSync(betPath, JSON.stringify(mergedBet, null, 2) + "\n");
      betNya += mergedBet.length - existingBet.length;
      console.log(
        `  ${dok.length} dokument → ${norm.length} indexposter, ${mergedBet.length} totalt (${mergedBet.length - existingBet.length} nya) → ${betPath}`,
      );
      continue; // eget index — handlingsräknaren gäller inte här
    } else if (typ === "vot") {
      console.log(`voteringar ${rm} …`);
      const idn = await fetchVoteringsIdn(politeFetch, rm!);
      const okanda = okandaVoteringsIdn(idn, merged);
      const take = limit ? okanda.slice(0, limit) : okanda;
      console.log(`  ${idn.length} voteringspunkter, ${okanda.length} ännu inte skördade${limit ? `, tar ${take.length}` : ""}`);
      const chunk: Array<Omit<Handling, "id">> = [];
      let done = 0;
      for (const vid of take) {
        try {
          const h = normaliseraVotering(await fetchVoteringRader(politeFetch, vid));
          if (h) chunk.push(h);
        } catch (err) {
          // Bara "röstlista saknas" hoppas över — och syns i utskriften. Id:t
          // skrivs inte in, så nästa körning frågar igen. Allt annat fäller.
          if (!(err instanceof SaknarRostlista)) throw err;
          utanRostlista.push(`${vid} (${err.dokId})`);
        }
        done += 1;
        if (done % 50 === 0) console.log(`  … ${done}/${take.length}`);
      }
      spara(chunk);
    } else {
      console.log(`${typ} ${etikett(rm)} …`);
      const dok = await fetchDokument(politeFetch, typ as DokTyp, rm, dokOpts);
      const norm = dok
        .map((d) => normaliseraDokument(berikaPartier(d, partiAvId)))
        .filter((h): h is NonNullable<typeof h> => h !== null);
      console.log(`  ${dok.length} dokument → ${norm.length} handlingar`);
      spara(norm);
    }
    console.log(`  sparat: ${merged.length} handlingar totalt`);
  }

  if (utanRostlista.length > 0) {
    console.warn(`OBS: ${utanRostlista.length} voteringar utan röstlista hos riksdagen, inte skördade: ${utanRostlista.join(", ")}`);
  }
  const betDel = typer.includes("bet") ? `; betänkanden: ${betNya} nya` : "";
  console.log(`klart: ${merged.length} handlingar (${merged.length - existing.length} nya)${betDel} → ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
