/** Koppling och synlig rättelse hör till samma återställbara skrivning. */
import { lasFillage, skapaFilpaket, skrivFilpaket, type Fillage } from "../../../pipeline/src/datatransaktion.ts";
import type { KopplingPost } from "./granskning.ts";

export const KOPPLINGSRATTELSEFILER = ["kopplingar.json", "rattelser.json"] as const;

function lista<T>(text: string | null, namn: string, saknadTillats: boolean): T[] {
  if (text === null) {
    if (saknadTillats) return [];
    throw new Error(`${namn} saknas`);
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error(`${namn} kan inte läsas som JSON`); }
  if (!Array.isArray(value)) throw new Error(`${namn} ska vara en lista`);
  return value as T[];
}

export function lasKopplingsrattelselage(dir: string): { fore: Fillage; kopplingar: KopplingPost[]; rattelser: unknown[] } {
  const fore = lasFillage(dir, KOPPLINGSRATTELSEFILER);
  return {
    fore,
    kopplingar: lista<KopplingPost>(fore["kopplingar.json"] ?? null, "Kopplingarna", false),
    rattelser: lista<unknown>(fore["rattelser.json"] ?? null, "Rättelseloggen", true),
  };
}

export function skrivKopplingsrattelse(dir: string, fore: Fillage, kopplingar: KopplingPost[], rattelser: unknown[]): void {
  if (Object.keys(fore).sort().join() !== [...KOPPLINGSRATTELSEFILER].sort().join()) throw new Error("Fel filuppsättning för kopplingsrättelse");
  if (!Array.isArray(kopplingar) || !Array.isArray(rattelser)) throw new Error("Kopplingsrättelse kräver listor");
  if (fore["kopplingar.json"] === null) throw new Error("Kopplingarna saknas");
  const efter = {
    "kopplingar.json": JSON.stringify(kopplingar, null, 2) + "\n",
    "rattelser.json": JSON.stringify(rattelser, null, 2) + "\n",
  };
  skrivFilpaket(dir, skapaFilpaket(fore, efter));
}
