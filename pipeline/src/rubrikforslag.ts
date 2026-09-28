import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { svenskDag } from "./dagen.ts";
import { provaRad, tillampa, type Rubrikrad, type Rubrikpost } from "./rubrikbyte.ts";
import type { PromiseEntry } from "./loftesforslag.ts";

export interface FrystRubrikforslag {
  version: "rubrikforslag/1";
  fore: { loften: string };
  tidpunkt: string;
  rad: Rubrikrad;
  tidigareLofte: PromiseEntry;
  nyttLofte: PromiseEntry;
  hash: string;
}
function hash(v: unknown): string { return createHash("sha256").update(kanoniskJson(v)).digest("hex"); }

/** Fryser rubrik, historik och föreläge för separat sakprövning. */
export function forberedRubrikforslag(rad: Rubrikrad, loften: PromiseEntry[], nu: Date): FrystRubrikforslag {
  if (!loften.length || new Set(loften.map((p) => p.id)).size !== loften.length) throw new Error("Tomt eller dubblerat löftesbestånd");
  const prov = provaRad(rad, new Map(loften.map((p) => [p.id, p as unknown as Rubrikpost])));
  if (!prov.ok) throw new Error(prov.fel.join("; "));
  const tidigare = loften.find((p) => p.id === rad.id)!;
  const nytt = tillampa(tidigare as unknown as Rubrikpost, rad) as unknown as PromiseEntry;
  nytt.history = [...tidigare.history, { date: svenskDag(nu), commit: "0000000", change: rad.skal }];
  const payload = { version: "rubrikforslag/1" as const, fore: { loften: hash(loften) }, tidpunkt: nu.toISOString(),
    rad: structuredClone(rad), tidigareLofte: structuredClone(tidigare), nyttLofte: structuredClone(nytt) };
  return { ...payload, hash: hash(payload) };
}

/** Kräver oförändrat bestånd och exakt slutform; fattar inget publiceringsbeslut. */
export function tillampaRubrikforslag(f: FrystRubrikforslag, loften: PromiseEntry[], forvantadHash: string): PromiseEntry[] {
  const { hash: sparad, ...payload } = f;
  if (f.version !== "rubrikforslag/1" || hash(payload) !== sparad || sparad !== forvantadHash) throw new Error("Rubrikförslaget har ändrats");
  const aktuellt = forberedRubrikforslag(f.rad, loften, new Date(f.tidpunkt));
  if (aktuellt.hash !== sparad) throw new Error("Rubrikförslagets föreläge eller slutform har ändrats");
  return structuredClone(loften.map((p) => p.id === f.nyttLofte.id ? f.nyttLofte : p));
}
