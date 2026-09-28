import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { svenskDag } from "./dagen.ts";
import { provaSortrad, tillampa, type Sortrad, type Sortlofte } from "./sortbyte.ts";
import type { PromiseEntry } from "./loftesforslag.ts";

export interface FrystSortforslag {
  version: "sortforslag/1";
  fore: { loften: string };
  tidpunkt: string;
  rad: Sortrad;
  tidigareLofte: PromiseEntry;
  nyttLofte: PromiseEntry;
  hash: string;
}
function hash(v: unknown): string { return createHash("sha256").update(kanoniskJson(v)).digest("hex"); }
/** Fryser klassning och motivering utan att avgöra vad citatet faktiskt lovar. */
export function forberedSortforslag(rad: Sortrad, loften: PromiseEntry[], nu: Date): FrystSortforslag {
  if (!loften.length || new Set(loften.map((p) => p.id)).size !== loften.length) throw new Error("Tomt eller dubblerat löftesbestånd");
  const tidigare = loften.find((p) => p.id === rad.id);
  const prov = provaSortrad(tidigare as unknown as Sortlofte | undefined, rad);
  if (!prov.ok || !tidigare) throw new Error(prov.fel.join("; "));
  const nytt = tillampa(tidigare as unknown as Sortlofte, rad, svenskDag(nu)) as unknown as PromiseEntry;
  // Historiken ska beskriva den aktuella ändringen, inte anta en äldre felorsak.
  nytt.history = [...tidigare.history, { date: svenskDag(nu), commit: "0000000",
    change: `Löftestyp ändrad från ${tidigare.loftestyp ?? "ej angiven"} till ${rad.sort}. ${rad.skal}` }];
  const payload = { version: "sortforslag/1" as const, fore: { loften: hash(loften) }, tidpunkt: nu.toISOString(),
    rad: structuredClone(rad), tidigareLofte: structuredClone(tidigare), nyttLofte: structuredClone(nytt) };
  return { ...payload, hash: hash(payload) };
}
export function tillampaSortforslag(f: FrystSortforslag, loften: PromiseEntry[], forvantadHash: string): PromiseEntry[] {
  const { hash: sparad, ...payload } = f;
  if (f.version !== "sortforslag/1" || hash(payload) !== sparad || sparad !== forvantadHash) throw new Error("Typförslaget har ändrats");
  const aktuellt = forberedSortforslag(f.rad, loften, new Date(f.tidpunkt));
  if (aktuellt.hash !== sparad) throw new Error("Typförslagets föreläge eller slutform har ändrats");
  return structuredClone(loften.map((p) => p.id === f.nyttLofte.id ? f.nyttLofte : p));
}
