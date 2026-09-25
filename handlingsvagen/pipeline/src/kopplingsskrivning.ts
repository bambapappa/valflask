/** Gemensamt föreläge för kopplingskön och de publicerade kopplingarna. */
import { lasFillage, skapaFilpaket, skrivFilpaket, type Fillage } from "../../../pipeline/src/datatransaktion.ts";
import type { KoPost, KopplingPost } from "./granskning.ts";

export const KOPPLINGSBESLUTSFILER = ["kopplingsforslag.json", "kopplingar.json"] as const;

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

export function lasKopplingslage(dir: string): { fore: Fillage; ko: KoPost[]; kopplingar: KopplingPost[] } {
  const fore = lasFillage(dir, KOPPLINGSBESLUTSFILER);
  return {
    fore,
    ko: lista<KoPost>(fore["kopplingsforslag.json"] ?? null, "Kopplingskön", false),
    kopplingar: lista<KopplingPost>(fore["kopplingar.json"] ?? null, "Kopplingarna", true),
  };
}

function eftertext(fore: string | null, value: unknown[]): string | null {
  // Behåll orörd fil byte för byte; ett avslag rör bara kön.
  if (fore === null && value.length === 0) return null;
  if (fore !== null && JSON.stringify(JSON.parse(fore)) === JSON.stringify(value)) return fore;
  return JSON.stringify(value, null, 2) + "\n";
}

/** Skriver båda registren under samma lås med journal och exakt föreläge. */
export function skrivKopplingsbeslut(dir: string, fore: Fillage, ko: KoPost[], kopplingar: KopplingPost[]): void {
  if (Object.keys(fore).sort().join() !== [...KOPPLINGSBESLUTSFILER].sort().join()) throw new Error("Fel filuppsättning för kopplingsbeslut");
  if (!Array.isArray(ko) || !Array.isArray(kopplingar)) throw new Error("Kopplingsbeslut kräver listor");
  const efter: Fillage = {
    "kopplingsforslag.json": eftertext(fore["kopplingsforslag.json"] ?? null, ko),
    "kopplingar.json": eftertext(fore["kopplingar.json"] ?? null, kopplingar),
  };
  if (efter["kopplingsforslag.json"] === null) throw new Error("Kopplingskön får inte tas bort");
  skrivFilpaket(dir, skapaFilpaket(fore, efter));
}
