import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { svenskDag } from "./dagen.ts";
import { provaUtrakningsrad, tillampa, type Utrakningsrad, type Utrakningspost } from "./utrakningsbyte.ts";
import type { PromiseEntry } from "./loftesforslag.ts";

export interface FrystUtrakningsforslag {
  version: "utrakningsforslag/1";
  fore: { loften: string };
  tidpunkt: string;
  rad: Utrakningsrad;
  tidigareLofte: PromiseEntry;
  nyttLofte: PromiseEntry;
  hash: string;
}
function hash(v: unknown): string { return createHash("sha256").update(kanoniskJson(v)).digest("hex"); }

/** Fryser en textändring för separat sakprövning. Beloppet är inget sakfacit. */
export function forberedUtrakningsforslag(rad: Utrakningsrad, loften: PromiseEntry[], nu: Date): FrystUtrakningsforslag {
  if (!loften.length || new Set(loften.map((p) => p.id)).size !== loften.length) throw new Error("Tomt eller dubblerat löftesbestånd");
  const prov = provaUtrakningsrad(rad, new Map(loften.map((p) => [p.id, p as unknown as Utrakningspost])));
  if (!prov.ok) throw new Error(prov.fel.join("; "));
  const tidigare = loften.find((p) => p.id === rad.id)!;
  const nytt = tillampa(tidigare as unknown as Utrakningspost, rad) as unknown as PromiseEntry;
  nytt.history = [...tidigare.history, { date: svenskDag(nu), commit: "0000000", change: rad.skal }];
  const payload = { version: "utrakningsforslag/1" as const, fore: { loften: hash(loften) }, tidpunkt: nu.toISOString(),
    rad: structuredClone(rad), tidigareLofte: structuredClone(tidigare), nyttLofte: structuredClone(nytt) };
  return { ...payload, hash: hash(payload) };
}

/** Kräver oförändrat bestånd och exakt slutform; fattar inget publiceringsbeslut. */
export function tillampaUtrakningsforslag(f: FrystUtrakningsforslag, loften: PromiseEntry[], forvantadHash: string): PromiseEntry[] {
  const { hash: sparad, ...payload } = f;
  if (f.version !== "utrakningsforslag/1" || hash(payload) !== sparad || sparad !== forvantadHash) throw new Error("Uträkningsförslaget har ändrats");
  const aktuellt = forberedUtrakningsforslag(f.rad, loften, new Date(f.tidpunkt));
  if (aktuellt.hash !== sparad) throw new Error("Uträkningsförslagets föreläge eller slutform har ändrats");
  return structuredClone(loften.map((p) => p.id === f.nyttLofte.id ? f.nyttLofte : p));
}
