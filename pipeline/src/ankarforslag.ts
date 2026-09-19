import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { svenskDag } from "./dagen.ts";
import { provaAnkarrad, satt, type Ankarrad, type Lofte } from "./ankarsattning.ts";
import type { PromiseEntry } from "./loftesforslag.ts";

export interface FrystAnkarforslag {
  version: "ankarforslag/1";
  fore: { loften: string };
  tidpunkt: string;
  rad: Ankarrad;
  tidigareLofte: PromiseEntry;
  ankare: PromiseEntry;
  nyttLofte: PromiseEntry;
  hash: string;
}

function hash(v: unknown): string {
  return createHash("sha256").update(kanoniskJson(v)).digest("hex");
}

/** Fryser mål, ankare och slutform utan att avgöra om löftena gäller samma sak. */
export function forberedAnkarforslag(rad: Ankarrad, loften: PromiseEntry[], nu: Date): FrystAnkarforslag {
  if (!loften.length || new Set(loften.map((p) => p.id)).size !== loften.length) {
    throw new Error("Tomt eller dubblerat löftesbestånd");
  }
  const tidigare = loften.find((p) => p.id === rad.id);
  const ankare = loften.find((p) => p.id === rad.ankare);
  const prov = provaAnkarrad(tidigare as unknown as Lofte | undefined, ankare as unknown as Lofte | undefined,
    rad, loften as unknown as Lofte[]);
  if (!prov.ok || !tidigare || !ankare) throw new Error(prov.fel.join("; "));
  const nytt = satt(tidigare as unknown as Lofte, ankare as unknown as Lofte, rad, svenskDag(nu)) as unknown as PromiseEntry;
  const payload = {
    version: "ankarforslag/1" as const,
    fore: { loften: hash(loften) },
    tidpunkt: nu.toISOString(),
    rad: structuredClone(rad),
    tidigareLofte: structuredClone(tidigare),
    ankare: structuredClone(ankare),
    nyttLofte: structuredClone(nytt),
  };
  return { ...payload, hash: hash(payload) };
}

export function tillampaAnkarforslag(f: FrystAnkarforslag, loften: PromiseEntry[], forvantadHash: string): PromiseEntry[] {
  const { hash: sparad, ...payload } = f;
  if (f.version !== "ankarforslag/1" || hash(payload) !== sparad || sparad !== forvantadHash) {
    throw new Error("Ankarförslaget har ändrats");
  }
  const aktuellt = forberedAnkarforslag(f.rad, loften, new Date(f.tidpunkt));
  if (aktuellt.hash !== sparad) throw new Error("Ankarförslagets föreläge, ankare eller slutform har ändrats");
  return structuredClone(loften.map((p) => p.id === f.nyttLofte.id ? f.nyttLofte : p));
}
