/** Versionsbunden skrivning av maskinläsbar grund från redan publicerad prosa. */
import { lasFillage, skapaFilpaket, skrivFilpaket, type Fillage } from "../../../pipeline/src/datatransaktion.ts";
import type { KopplingPost } from "./granskning.ts";

const FIL = "kopplingar.json";

export function lasBrodtextbackfill(dir: string): { fore: Fillage; kopplingar: KopplingPost[] } {
  const fore = lasFillage(dir, [FIL]);
  const text = fore[FIL];
  if (text === null || text === undefined) throw new Error("Kopplingarna saknas");
  let värde: unknown;
  try { värde = JSON.parse(text); }
  catch { throw new Error("Kopplingarna kan inte läsas som JSON"); }
  if (!Array.isArray(värde)) throw new Error("Kopplingarna ska vara en lista");
  return { fore, kopplingar: värde as KopplingPost[] };
}

/** Tomt utfall lämnar filen byteidentisk; ändrat föreläge stoppar under lås. */
export function skrivBrodtextbackfill(dir: string, fore: Fillage, kopplingar: KopplingPost[]): boolean {
  if (Object.keys(fore).length !== 1 || fore[FIL] === null || fore[FIL] === undefined || !Array.isArray(kopplingar)) {
    throw new Error("Brödtextbackfill kräver kopplingarnas exakta föreläge");
  }
  const efter = JSON.stringify(kopplingar, null, 2) + "\n";
  if (efter === fore[FIL]) return false;
  skrivFilpaket(dir, skapaFilpaket(fore, { [FIL]: efter }));
  return true;
}
