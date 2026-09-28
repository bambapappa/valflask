import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { svenskDag } from "./dagen.ts";
import { provaIndragning, draIn, type Indragningsrad } from "./indragning.ts";
import type { PromiseEntry } from "./loftesforslag.ts";

export interface FrystIndragningsforslag {
  version: "indragningsforslag/1";
  fore: { loften: string };
  tidpunkt: string;
  rad: Indragningsrad;
  tidigareLofte: PromiseEntry;
  nyttLofte: PromiseEntry;
  hash: string;
}
function hash(v: unknown): string { return createHash("sha256").update(kanoniskJson(v)).digest("hex"); }

/** Fryser indragning, historik och föreläge för separat sakprövning. */
export function forberedIndragningsforslag(rad: Indragningsrad, loften: PromiseEntry[], nu: Date): FrystIndragningsforslag {
  if (!loften.length || new Set(loften.map((p) => p.id)).size !== loften.length) throw new Error("Tomt eller dubblerat löftesbestånd");
  const prov = provaIndragning(loften.find(p => p.id === rad.id), rad);
  if (!prov.ok) throw new Error(prov.fel.join("; "));
  const tidigare = loften.find((p) => p.id === rad.id)!;
  const nytt = draIn(tidigare, rad.skal, svenskDag(nu));
  const payload = { version: "indragningsforslag/1" as const, fore: { loften: hash(loften) }, tidpunkt: nu.toISOString(),
    rad: structuredClone(rad), tidigareLofte: structuredClone(tidigare), nyttLofte: structuredClone(nytt) };
  return { ...payload, hash: hash(payload) };
}

/** Kräver oförändrat bestånd och exakt slutform; fattar inget publiceringsbeslut. */
export function tillampaIndragningsforslag(f: FrystIndragningsforslag, loften: PromiseEntry[], forvantadHash: string): PromiseEntry[] {
  const { hash: sparad, ...payload } = f;
  if (f.version !== "indragningsforslag/1" || hash(payload) !== sparad || sparad !== forvantadHash) throw new Error("Indragningsförslaget har ändrats");
  const aktuellt = forberedIndragningsforslag(f.rad, loften, new Date(f.tidpunkt));
  if (aktuellt.hash !== sparad) throw new Error("Indragningsförslagets föreläge eller slutform har ändrats");
  return structuredClone(loften.map((p) => p.id === f.nyttLofte.id ? f.nyttLofte : p));
}
