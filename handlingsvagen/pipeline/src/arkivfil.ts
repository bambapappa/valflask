import { lasFillage, skapaFilpaket, skrivFilpaket, type Fillage } from "../../../pipeline/src/datatransaktion.ts";

export function lasArkivfil(dir: string): Fillage {
  return lasFillage(dir, ["arkiv.json"]);
}

/** Ett senare manuellt arkivbeslut får inte ersättas av äldre nätverksresultat. */
export function skrivArkivfil(dir: string, fore: Fillage, poster: unknown): Fillage {
  const efter = { "arkiv.json": JSON.stringify(poster, null, 2) + "\n" };
  skrivFilpaket(dir, skapaFilpaket(fore, efter));
  return efter;
}
