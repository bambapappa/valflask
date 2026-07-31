/**
 * Engångsmigrering (b-0014): sätter utskottsfältet (organ) på befintliga
 * handlingar. Dokument får organ ur en omläsning av dokumentlistans
 * metadata (inga fulltexter); voteringar ur beteckningen (UU15 → UU).
 * Uttrycklig migrering — mergeHandlingar ändrar aldrig poster i tysthet,
 * det här skriptet gör det synligt i en egen commit.
 *
 *   npm run organ-backfill -- --rm 2022/23 --rm 2023/24 --rm 2024/25 --rm 2025/26
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchDokument, type DokTyp } from "../src/riksdagen.ts";
import type { Handling } from "../src/handlingar.ts";
import { politeFetch } from "./hamta.mts";

const rms: string[] = [];
for (let i = 2; i < process.argv.length; i += 1) if (process.argv[i] === "--rm") rms.push(process.argv[++i]!);
if (rms.length === 0) rms.push("2025/26");

const path = resolve(import.meta.dirname, "../../data/handlingar.json");
const handlingar: Handling[] = JSON.parse(readFileSync(path, "utf8"));

const organAvDokId = new Map<string, string>();
for (const rm of rms) {
  for (const typ of ["mot", "prop", "ip", "fr"] as DokTyp[]) {
    console.log(`${typ} ${rm} …`);
    for (const d of await fetchDokument(politeFetch, typ, rm)) {
      if (d.organ) organAvDokId.set(d.dok_id, d.organ);
    }
  }
}

let satta = 0;
let utan = 0;
for (const h of handlingar) {
  if (h.organ) continue;
  if (h.kind === "votering") {
    const bet = h.dok_id.split(":")[1] ?? "";
    const organ = bet.replace(/\d+$/u, "");
    if (organ) { h.organ = organ; satta += 1; } else utan += 1;
  } else {
    const organ = organAvDokId.get(h.dok_id);
    if (organ) { h.organ = organ; satta += 1; } else utan += 1;
  }
}
writeFileSync(path, JSON.stringify(handlingar, null, 2) + "\n");
console.log(`klart: organ satt på ${satta} handlingar, ${utan} utan uppgift (tomt är ärligt)`);
