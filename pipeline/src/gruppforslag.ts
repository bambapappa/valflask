import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { svenskDag } from "./dagen.ts";
import { provaGrupprad, tillampa, type Grupprad, type Grupplofte } from "./gruppsattning.ts";
import type { PromiseEntry } from "./loftesforslag.ts";

export interface Gruppmal extends Grupprad { id: string }
export interface FrystGruppforslag {
  version: "gruppforslag/1";
  fore: { loften: string };
  tidpunkt: string;
  rad: Gruppmal;
  tidigareLofte: PromiseEntry;
  nyttLofte: PromiseEntry;
  hash: string;
}
function hash(v: unknown): string { return createHash("sha256").update(kanoniskJson(v)).digest("hex"); }

/** Varje ändrad medlem prövas mot hela den planerade gruppen. */
export function forberedGruppforslag(rad: Gruppmal, loften: PromiseEntry[], nu: Date): FrystGruppforslag {
  if (!loften.length || new Set(loften.map(p => p.id)).size !== loften.length) throw new Error("Tomt eller dubblerat löftesbestånd");
  if (!rad.ids.includes(rad.id)) throw new Error("Målet ingår inte i gruppraden");
  const gruppLoften = loften as unknown as Grupplofte[];
  const prov = provaGrupprad(rad, new Map(gruppLoften.map(p => [p.id, p])));
  if (!prov.ok) throw new Error(prov.fel.join("; "));
  const tidigare = loften.find(p => p.id === rad.id)!;
  if (tidigare.group_id === rad.grupp) throw new Error("Gruppmedlemskapet är oförändrat");
  const medlemmar = gruppLoften.filter(p => (p.status ?? "aktiv") === "aktiv" && (p.group_id === rad.grupp || rad.ids.includes(p.id)));
  const nytt = tillampa(tidigare as unknown as Grupplofte, rad, medlemmar, svenskDag(nu)) as unknown as PromiseEntry;
  const payload = { version: "gruppforslag/1" as const, fore: { loften: hash(loften) }, tidpunkt: nu.toISOString(),
    rad: structuredClone(rad), tidigareLofte: structuredClone(tidigare), nyttLofte: structuredClone(nytt) };
  return { ...payload, hash: hash(payload) };
}

export function tillampaGruppforslag(f: FrystGruppforslag, loften: PromiseEntry[], forvantadHash: string): PromiseEntry[] {
  const { hash: sparad, ...payload } = f;
  if (f.version !== "gruppforslag/1" || hash(payload) !== sparad || sparad !== forvantadHash) throw new Error("Gruppförslaget har ändrats");
  const nytt = forberedGruppforslag(f.rad, loften, new Date(f.tidpunkt));
  if (nytt.hash !== sparad) throw new Error("Gruppförslagets föreläge eller slutform har ändrats");
  return structuredClone(loften.map(p => p.id === f.nyttLofte.id ? f.nyttLofte : p));
}
