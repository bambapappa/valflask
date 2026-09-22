/** Sammanhållen uppdatering av förslagskö och minne efter en modellkörning. */
import { lasFillage, skapaFilpaket, skrivFilpaket, type Fillage } from "../../../pipeline/src/datatransaktion.ts";
import { laggTillNyaKoPoster, nyaKoPoster, stadaAvgjorda, type KoPost } from "./granskning.ts";
import { mergeProvade } from "./provade.ts";

const FILER = ["kopplingsforslag.json", "provade-par.json"] as const;

function lista<T>(text: string | null | undefined, namn: string): T[] {
  if (text === null || text === undefined) throw new Error(`${namn} saknas`);
  let värde: unknown;
  try { värde = JSON.parse(text); }
  catch { throw new Error(`${namn} kan inte läsas som JSON`); }
  if (!Array.isArray(värde)) throw new Error(`${namn} ska vara en lista`);
  return värde as T[];
}

export function lasForslagsdelta(dir: string): { fore: Fillage; ko: KoPost[]; provade: string[] } {
  const fore = lasFillage(dir, FILER);
  return {
    fore,
    ko: lista<KoPost>(fore[FILER[0]], "Kopplingskön"),
    provade: lista<string>(fore[FILER[1]], "Prövade par"),
  };
}

export interface ForslagsdeltaResultat {
  andrat: boolean;
  koFore: number;
  koNya: number;
  koEfter: number;
  bortstadade: KoPost[];
  provadeFore: number;
  provadeEfter: number;
}

/** En ändrad fil eller trasig indata stoppar båda resultaten före commit. */
export function skrivForslagsdelta(
  dir: string,
  fore: Fillage,
  start: KoPost[],
  resultat: KoPost[],
  provadeResultat: string[],
  aktivaLoften: Set<string>,
): ForslagsdeltaResultat {
  if (Object.keys(fore).sort().join() !== [...FILER].sort().join()) throw new Error("Fel filuppsättning för förslagsdelta");
  if (!Array.isArray(start) || !Array.isArray(resultat) || !Array.isArray(provadeResultat)) {
    throw new Error("Förslagsdelta kräver tre listor");
  }
  const koFore = lista<KoPost>(fore[FILER[0]], "Kopplingskön");
  const provadeFore = lista<string>(fore[FILER[1]], "Prövade par");
  const nya = nyaKoPoster(start, resultat);
  const { kvar, bortstadade } = stadaAvgjorda(laggTillNyaKoPoster(koFore, start, resultat), aktivaLoften);
  const provadeEfter = mergeProvade(provadeFore, provadeResultat);
  const efter: Fillage = {
    [FILER[0]]: JSON.stringify(kvar, null, 2) + "\n",
    [FILER[1]]: JSON.stringify(provadeEfter, null, 2) + "\n",
  };
  const andrat = FILER.some((fil) => fore[fil] !== efter[fil]);
  if (andrat) skrivFilpaket(dir, skapaFilpaket(fore, efter));
  return {
    andrat,
    koFore: koFore.length,
    koNya: nya.length,
    koEfter: kvar.length,
    bortstadade,
    provadeFore: provadeFore.length,
    provadeEfter: provadeEfter.length,
  };
}
