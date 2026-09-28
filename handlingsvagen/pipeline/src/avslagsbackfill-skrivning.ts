/** Låst skrivning av äldre avslagsunderlag utan att förlora nyare kopplingar. */
import { lasFillage, skapaFilpaket, skrivFilpaket, type Fillage } from "../../../pipeline/src/datatransaktion.ts";
import type { KopplingPost } from "./granskning.ts";
import type { Handling } from "./handlingar.ts";

const FILER = ["kopplingar.json", "handlingar.json"] as const;

function lista<T>(text: string | null, namn: string): T[] {
  if (text === null) throw new Error(`${namn} saknas`);
  let värde: unknown;
  try { värde = JSON.parse(text); }
  catch { throw new Error(`${namn} kan inte läsas som JSON`); }
  if (!Array.isArray(värde)) throw new Error(`${namn} ska vara en lista`);
  return värde as T[];
}

export function lasAvslagsbackfill(dir: string): { fore: Fillage; kopplingar: KopplingPost[]; handlingar: Handling[] } {
  const fore = lasFillage(dir, FILER);
  return {
    fore,
    kopplingar: lista<KopplingPost>(fore["kopplingar.json"] ?? null, "Kopplingarna"),
    handlingar: lista<Handling>(fore["handlingar.json"] ?? null, "Handlingarna"),
  };
}

/** Kontrollerar båda källfilerna under samma lås; handlingarna skrivs byteidentiskt. */
export function skrivAvslagsbackfill(dir: string, fore: Fillage, kopplingar: KopplingPost[]): void {
  if (Object.keys(fore).sort().join() !== [...FILER].sort().join()) throw new Error("Fel filuppsättning för avslagsbackfill");
  if (!Array.isArray(kopplingar) || fore["kopplingar.json"] === null || fore["handlingar.json"] === null) {
    throw new Error("Avslagsbackfill kräver kopplingar och handlingar");
  }
  const efter: Fillage = {
    "kopplingar.json": JSON.stringify(kopplingar, null, 2) + "\n",
    "handlingar.json": fore["handlingar.json"]!,
  };
  skrivFilpaket(dir, skapaFilpaket(fore, efter));
}
