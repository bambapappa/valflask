import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { svenskDag } from "./dagen.ts";
import { nolla, provaNollrad, type Lofte, type Nollrad } from "./regelnollning.ts";
import type { PromiseEntry } from "./loftesforslag.ts";

export interface FrystNollforslag { version: "nollforslag/1"; fore: { loften: string }; tidpunkt: string; rad: Nollrad; tidigareLofte: PromiseEntry; nyttLofte: PromiseEntry; hash: string }
function hash(v: unknown): string { return createHash("sha256").update(kanoniskJson(v)).digest("hex"); }
export function forberedNollforslag(rad: Nollrad, loften: PromiseEntry[], nu: Date): FrystNollforslag {
  if (!loften.length || new Set(loften.map((p) => p.id)).size !== loften.length) throw new Error("Tomt eller dubblerat löftesbestånd");
  const tidigare = loften.find((p) => p.id === rad.id); const prov = provaNollrad(tidigare as unknown as Lofte | undefined, rad);
  if (!prov.ok || !tidigare) throw new Error(prov.fel.join("; "));
  const nytt = nolla(tidigare as unknown as Lofte, rad, svenskDag(nu)) as unknown as PromiseEntry;
  const payload = { version: "nollforslag/1" as const, fore: { loften: hash(loften) }, tidpunkt: nu.toISOString(), rad: structuredClone(rad), tidigareLofte: structuredClone(tidigare), nyttLofte: structuredClone(nytt) };
  return { ...payload, hash: hash(payload) };
}
export function tillampaNollforslag(f: FrystNollforslag, loften: PromiseEntry[], forvantadHash: string): PromiseEntry[] {
  const { hash: sparad, ...payload } = f;
  if (f.version !== "nollforslag/1" || hash(payload) !== sparad || sparad !== forvantadHash) throw new Error("Nollningsförslaget har ändrats");
  if (forberedNollforslag(f.rad, loften, new Date(f.tidpunkt)).hash !== sparad) throw new Error("Nollningsförslagets föreläge eller slutform har ändrats");
  return structuredClone(loften.map((p) => p.id === f.nyttLofte.id ? f.nyttLofte : p));
}
