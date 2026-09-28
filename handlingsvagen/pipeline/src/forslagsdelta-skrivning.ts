/** Sammanhållen uppdatering av förslagskö och minne efter en modellkörning. */
import { lasFillage, skapaFilpaket, skrivFilpaket, type Fillage } from "../../../pipeline/src/datatransaktion.ts";
import { laggTillNyaKoPoster, nyaKoPoster, stadaAvgjorda, type KoPost } from "./granskning.ts";
import { mergeProvade, serialiseraSokregister, type Sokregister, type Sokpost } from "./provade.ts";

const FILER = ["kopplingsforslag.json", "provade-par.json", "sokta-loften.json"] as const;

function lista<T>(text: string | null | undefined, namn: string): T[] {
  if (text === null || text === undefined) throw new Error(`${namn} saknas`);
  let värde: unknown;
  try { värde = JSON.parse(text); }
  catch { throw new Error(`${namn} kan inte läsas som JSON`); }
  if (!Array.isArray(värde)) throw new Error(`${namn} ska vara en lista`);
  return värde as T[];
}

export function valideraSokregister(värde: unknown, namn: string): Sokregister {
  if (typeof värde !== "object" || värde === null || Array.isArray(värde) ||
      !("poster" in värde) || typeof värde.poster !== "object" || värde.poster === null || Array.isArray(värde.poster)) {
    throw new Error(`${namn} ska ha ett postregister`);
  }
  for (const [id, post] of Object.entries(värde.poster)) {
    if (typeof post !== "object" || post === null || Array.isArray(post) ||
        !("senast" in post) || typeof post.senast !== "string" ||
        !("kandidater" in post) || !Number.isInteger(post.kandidater) || (post.kandidater as number) < 0) {
      throw new Error(`${namn} har ogiltig mätning för ${id}`);
    }
  }
  return värde as Sokregister;
}

function sokregister(text: string | null | undefined, namn: string): Sokregister {
  if (text === null || text === undefined) return { poster: {} };
  let värde: unknown;
  try { värde = JSON.parse(text); }
  catch { throw new Error(`${namn} kan inte läsas som JSON`); }
  return valideraSokregister(värde, namn);
}

function sammaSokpost(a: Sokpost | undefined, b: Sokpost | undefined): boolean {
  return a?.senast === b?.senast && a?.kandidater === b?.kandidater;
}

/** Körningens nya mätningar läggs på färsk main, som vinner vid kollision. */
export function forenaSokregister(farsk: Sokregister, start: Sokregister, resultat: Sokregister): Sokregister {
  const poster = { ...farsk.poster };
  for (const [id, post] of Object.entries(resultat.poster)) {
    if (!sammaSokpost(post, start.poster[id]) && sammaSokpost(farsk.poster[id], start.poster[id])) {
      poster[id] = post;
    }
  }
  return serialiseraSokregister({ poster });
}

export function lasForslagsdelta(dir: string): { fore: Fillage; ko: KoPost[]; provade: string[]; sokregister: Sokregister } {
  const fore = lasFillage(dir, FILER);
  return {
    fore,
    ko: lista<KoPost>(fore[FILER[0]], "Kopplingskön"),
    provade: lista<string>(fore[FILER[1]], "Prövade par"),
    sokregister: sokregister(fore[FILER[2]], "Sökregistret"),
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
  sokningarNya: number;
}

/** En ändrad fil eller trasig indata stoppar båda resultaten före commit. */
export function skrivForslagsdelta(
  dir: string,
  fore: Fillage,
  start: KoPost[],
  resultat: KoPost[],
  provadeResultat: string[],
  sokStart: Sokregister,
  sokResultat: Sokregister,
  aktivaLoften: Set<string>,
): ForslagsdeltaResultat {
  if (Object.keys(fore).sort().join() !== [...FILER].sort().join()) throw new Error("Fel filuppsättning för förslagsdelta");
  if (!Array.isArray(start) || !Array.isArray(resultat) || !Array.isArray(provadeResultat)) {
    throw new Error("Förslagsdelta kräver tre listor");
  }
  const koFore = lista<KoPost>(fore[FILER[0]], "Kopplingskön");
  const provadeFore = lista<string>(fore[FILER[1]], "Prövade par");
  const sokFore = sokregister(fore[FILER[2]], "Sökregistret");
  valideraSokregister(sokStart, "Sökregistrets startläge");
  valideraSokregister(sokResultat, "Sökregistrets resultat");
  const nya = nyaKoPoster(start, resultat);
  const { kvar, bortstadade } = stadaAvgjorda(laggTillNyaKoPoster(koFore, start, resultat), aktivaLoften);
  const provadeEfter = mergeProvade(provadeFore, provadeResultat);
  const sokEfter = forenaSokregister(sokFore, sokStart, sokResultat);
  const efter: Fillage = {
    [FILER[0]]: JSON.stringify(kvar, null, 2) + "\n",
    [FILER[1]]: JSON.stringify(provadeEfter, null, 2) + "\n",
    [FILER[2]]: fore[FILER[2]] === null && Object.keys(sokEfter.poster).length === 0
      ? null : JSON.stringify(sokEfter, null, 2) + "\n",
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
    sokningarNya: Object.keys(sokEfter.poster).filter((id) => !sammaSokpost(sokEfter.poster[id], sokFore.poster[id])).length,
  };
}
