/**
 * Engångsmigrering (b-0015): sätter motionstyp på befintliga motioner ur
 * riksdagens egen klassning (dokumentlistans subtyp-fält), inte en gissning.
 * Läser om dokumentlistans metadata (inga fulltexter) och mappar
 * dok_id → subtyp → motionstyp. Motioner utan klassning (t.ex. utgångna)
 * lämnas osatta — tomt är ärligt och avgörs i granskningen.
 *
 *   npm run motionstyp-backfill -- --rm 2022/23 --rm 2023/24 --rm 2024/25 --rm 2025/26
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchDokument } from "../src/riksdagen.ts";
import { motionstypAvSubtyp, type Handling } from "../src/handlingar.ts";
import { politeFetch } from "./hamta.mts";

const rms: string[] = [];
for (let i = 2; i < process.argv.length; i += 1) if (process.argv[i] === "--rm") rms.push(process.argv[++i]!);
if (rms.length === 0) rms.push("2025/26");

const path = resolve(import.meta.dirname, "../../data/handlingar.json");
const handlingar: Handling[] = JSON.parse(readFileSync(path, "utf8"));

const typAvDokId = new Map<string, "parti" | "kommitte" | "enskild">();
for (const rm of rms) {
  console.log(`mot ${rm} …`);
  for (const d of await fetchDokument(politeFetch, "mot", rm)) {
    const typ = motionstypAvSubtyp(d.subtyp);
    if (typ) typAvDokId.set(d.dok_id, typ);
  }
}

let satta = 0;
let redan = 0;
let utan = 0;
for (const h of handlingar) {
  if (h.kind !== "motion") continue;
  const typ = typAvDokId.get(h.dok_id);
  if (!typ) { utan += 1; continue; }
  if (h.motionstyp === typ) { redan += 1; continue; }
  h.motionstyp = typ;
  satta += 1;
}
writeFileSync(path, JSON.stringify(handlingar, null, 2) + "\n");
console.log(`klart: motionstyp satt på ${satta} motioner (${redan} redan rätt, ${utan} utan riksdagsklassning)`);
