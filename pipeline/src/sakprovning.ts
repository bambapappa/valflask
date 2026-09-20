import { ordnaSakreferenser, sakmomentensBeredskap, SAKMOMENT, type Sakreferens, type Sakbedomning, type Sakmoment } from "./sakmoment.ts";
export { ordnaSakreferenser, sakmomentensBeredskap, SAKMOMENT, type Sakreferens, type Sakbedomning, type Sakmoment } from "./sakmoment.ts";
import { tillampaIndragningsforslag, type FrystIndragningsforslag } from "./indragningsforslag.ts";
import { tillampaCitatforslag, type FrystCitatforslag } from "./citatforslag.ts";
import { createHash } from "node:crypto";
import { bindUnderlag, kanoniskJson, sammaUnderlag, type BundetUnderlag } from "./underlagsversion.ts";
import { byggUnderlagsregister } from "./underlagsregister.ts";
import { tillampaLoftesforslag, type FrystLoftesforslag, type PromiseEntry } from "./loftesforslag.ts";
import { tillampaKalkylforslag, type FrystKalkylforslag } from "./kalkylforslag.ts";
import { tillampaUtrakningsforslag, type FrystUtrakningsforslag } from "./utrakningsforslag.ts";
import type { ReviewCandidate } from "./review.ts";
import { tillampaSortforslag, type FrystSortforslag } from "./sortforslag.ts";
import { tillampaAnkarforslag, type FrystAnkarforslag } from "./ankarforslag.ts";
import { tillampaNollforslag, type FrystNollforslag } from "./nollforslag.ts";

import { tillampaRubrikforslag, type FrystRubrikforslag } from "./rubrikforslag.ts";

import { tillampaGruppforslag, type FrystGruppforslag } from "./gruppforslag.ts";

export interface Sakunderlag {
  version: "sakunderlag/1";
  forslag: FrystLoftesforslag | FrystKalkylforslag | FrystUtrakningsforslag | FrystSortforslag | FrystAnkarforslag | FrystNollforslag | FrystRubrikforslag | FrystCitatforslag | FrystIndragningsforslag | FrystGruppforslag;
  poster: BundetUnderlag;
  referenser: Sakreferens[];
  hash: string;
}

export interface Sakprovning {
  version: "sakprovning/1";
  underlag: Sakunderlag;
  bedomare: string | null;
  bedomningar: Sakbedomning[];
}

function hash(value: unknown): string {
  return createHash("sha256").update(kanoniskJson(value)).digest("hex");
}
/** Binder sparad slutform och rekursiva grupp-/ankarberoenden; hämtar inga källor. */
export function byggSakunderlag(
  forslag: FrystLoftesforslag | FrystKalkylforslag,
  loften: PromiseEntry[],
  kopost: ReviewCandidate,
  material: readonly Sakreferens[],
): Sakunderlag {
  const efter = forslag.version === "kalkylforslag/1"
    ? tillampaKalkylforslag(forslag, loften, kopost, forslag.hash)
    : tillampaLoftesforslag(forslag, loften, kopost, forslag.hash);
  return bindSlutform(forslag, efter, material);
}

/** Befintliga löftens textändring behöver ingen påhittad köpost. */
export function byggUtrakningsunderlag(forslag: FrystUtrakningsforslag, loften: PromiseEntry[], material: readonly Sakreferens[], samtidiga: readonly FrystUtrakningsforslag[] = []): Sakunderlag {
  let efter = tillampaUtrakningsforslag(forslag, loften, forslag.hash);
  const ids = new Set([forslag.rad.id]);
  for (const andra of samtidiga) {
    if (ids.has(andra.rad.id)) throw new Error("Dubblerad ändring i sakunderlag");
    ids.add(andra.rad.id);
    tillampaUtrakningsforslag(andra, loften, andra.hash);
    efter = efter.map((p) => p.id === andra.rad.id ? andra.nyttLofte : p);
  }
  return bindSlutform(forslag, efter, material);
}

export function byggRubrikunderlag(forslag: FrystRubrikforslag, loften: PromiseEntry[], material: readonly Sakreferens[], samtidiga: readonly FrystRubrikforslag[] = []): Sakunderlag {
  let efter = tillampaRubrikforslag(forslag, loften, forslag.hash);
  const ids = new Set([forslag.rad.id]);
  for (const andra of samtidiga) {
    if (ids.has(andra.rad.id)) throw new Error("Dubblerad ändring i sakunderlag");
    ids.add(andra.rad.id);
    tillampaRubrikforslag(andra, loften, andra.hash);
    efter = efter.map((p) => p.id === andra.rad.id ? andra.nyttLofte : p);
  }
  return bindSlutform(forslag, efter, material);
}

export function byggIndragningsunderlag(forslag: FrystIndragningsforslag, loften: PromiseEntry[], material: readonly Sakreferens[], samtidiga: readonly FrystIndragningsforslag[] = []): Sakunderlag {
  let efter = tillampaIndragningsforslag(forslag, loften, forslag.hash);
  const ids = new Set([forslag.rad.id]);
  for (const andra of samtidiga) {
    if (ids.has(andra.rad.id)) throw new Error("Dubblerad ändring i sakunderlag");
    ids.add(andra.rad.id);
    tillampaIndragningsforslag(andra, loften, andra.hash);
    efter = efter.map((p) => p.id === andra.rad.id ? andra.nyttLofte : p);
  }
  return bindSlutform(forslag, efter, material);
}

export function byggCitatunderlag(forslag: FrystCitatforslag, loften: PromiseEntry[], material: readonly Sakreferens[], samtidiga: readonly FrystCitatforslag[] = []): Sakunderlag {
  let efter = tillampaCitatforslag(forslag, loften, forslag.hash);
  const ids = new Set([forslag.rad.id]);
  for (const andra of samtidiga) {
    if (ids.has(andra.rad.id)) throw new Error("Dubblerad ändring i sakunderlag");
    ids.add(andra.rad.id);
    tillampaCitatforslag(andra, loften, andra.hash);
    efter = efter.map((p) => p.id === andra.rad.id ? andra.nyttLofte : p);
  }
  return bindSlutform(forslag, efter, [...material, { id: "hamtad-kalla", slag: "kalla", adress: forslag.kalla.url, innehall: forslag.kalla.text }]);
}

export function byggGruppunderlag(forslag: FrystGruppforslag, loften: PromiseEntry[], material: readonly Sakreferens[], samtidiga: readonly FrystGruppforslag[] = []): Sakunderlag {
  let efter = tillampaGruppforslag(forslag, loften, forslag.hash);
  const ids = new Set([forslag.rad.id]);
  for (const andra of samtidiga) {
    if (ids.has(andra.rad.id)) throw new Error("Dubblerad ändring i sakunderlag");
    ids.add(andra.rad.id);
    tillampaGruppforslag(andra, loften, andra.hash);
    efter = efter.map((p) => p.id === andra.rad.id ? andra.nyttLofte : p);
  }
  return bindSlutform(forslag, efter, material);
}

export function byggSortunderlag(forslag: FrystSortforslag, loften: PromiseEntry[], material: readonly Sakreferens[], samtidiga: readonly FrystSortforslag[] = []): Sakunderlag {
  let efter = tillampaSortforslag(forslag, loften, forslag.hash);
  const ids = new Set([forslag.rad.id]);
  for (const andra of samtidiga) {
    if (ids.has(andra.rad.id)) throw new Error("Dubblerad ändring i sakunderlag");
    ids.add(andra.rad.id);
    tillampaSortforslag(andra, loften, andra.hash);
    efter = efter.map((p) => p.id === andra.rad.id ? andra.nyttLofte : p);
  }
  return bindSlutform(forslag, efter, material);
}

export function byggAnkarunderlag(forslag: FrystAnkarforslag, loften: PromiseEntry[], material: readonly Sakreferens[], samtidiga: readonly FrystAnkarforslag[] = []): Sakunderlag {
  let efter = tillampaAnkarforslag(forslag, loften, forslag.hash);
  const ids = new Set([forslag.rad.id]);
  for (const andra of samtidiga) {
    if (ids.has(andra.rad.id)) throw new Error("Dubblerad ändring i sakunderlag");
    ids.add(andra.rad.id);
    tillampaAnkarforslag(andra, loften, andra.hash);
    efter = efter.map((p) => p.id === andra.rad.id ? andra.nyttLofte : p);
  }
  return bindSlutform(forslag, efter, material);
}

export function byggNollunderlag(forslag: FrystNollforslag, loften: PromiseEntry[], material: readonly Sakreferens[], samtidiga: readonly FrystNollforslag[] = []): Sakunderlag {
  let efter = tillampaNollforslag(forslag, loften, forslag.hash); const ids = new Set([forslag.rad.id]);
  for (const andra of samtidiga) { if (ids.has(andra.rad.id)) throw new Error("Dubblerad ändring i sakunderlag"); ids.add(andra.rad.id); tillampaNollforslag(andra, loften, andra.hash); efter = efter.map((p) => p.id === andra.rad.id ? andra.nyttLofte : p); }
  return bindSlutform(forslag, efter, material);
}

function bindSlutform(forslag: Sakunderlag["forslag"], efter: PromiseEntry[], material: readonly Sakreferens[]): Sakunderlag {
  const register = byggUnderlagsregister({
    loften: efter as unknown as Record<string, unknown>[],
    handlingar: [], kopplingar: [], standpunkter: [],
  });
  const payload = {
    version: "sakunderlag/1" as const,
    forslag: structuredClone(forslag),
    poster: bindUnderlag(`lofte:${forslag.nyttLofte.id}`, register),
    referenser: ordnaSakreferenser(material),
  };
  return { ...payload, hash: hash(payload) };
}

/** Nya utkast avstår i varje moment. Referensmaterial är inte en utförd bedömning. */
export function skapaSakprovning(underlag: Sakunderlag): Sakprovning {
  kontrolleraUnderlag(underlag);
  return {
    version: "sakprovning/1",
    underlag: structuredClone(underlag),
    bedomare: null,
    bedomningar: (Object.keys(SAKMOMENT) as Sakmoment[]).map((moment) => ({
      moment, utfall: "oavgjort", motivering: "", belagg: [],
    })),
  };
}

function kontrolleraUnderlag(underlag: Sakunderlag): void {
  const { hash: sparad, ...payload } = underlag;
  const { hash: forslagshash, ...forslag } = underlag.forslag;
  if (underlag.version !== "sakunderlag/1" || hash(payload) !== sparad || hash(forslag) !== forslagshash ||
      Object.keys(underlag).sort().join(",") !== "forslag,hash,poster,referenser,version" ||
      !sammaUnderlag(underlag.poster, underlag.poster) ||
      underlag.poster.rot !== `lofte:${underlag.forslag.nyttLofte.id}` ||
      kanoniskJson(ordnaSakreferenser(underlag.referenser)) !== kanoniskJson(underlag.referenser)) {
    throw new Error("Sakprövningens underlag är ändrat eller ogiltigt");
  }
  const rot = underlag.poster.poster.find((p) => `lofte:${p.id}` === underlag.poster.rot && p.slag === "lofte");
  if (!rot || kanoniskJson(rot.innehall) !== kanoniskJson(underlag.forslag.nyttLofte)) {
    throw new Error("Sakprövningen gäller inte förslagets slutform");
  }
}

/** Beredskap att granskas för beslut, aldrig ett bevis för sakriktighet eller mänsklig attest. */
export function sakprovningsBeredskap(provning: Sakprovning, aktuellt: Sakunderlag): { klar: boolean; hinder: string[] } {
  try {
    kontrolleraUnderlag(aktuellt);
    kontrolleraUnderlag(provning.underlag);
    if (provning.version !== "sakprovning/1" || kanoniskJson(provning.underlag) !== kanoniskJson(aktuellt) ||
        Object.keys(provning).sort().join(",") !== "bedomare,bedomningar,underlag,version") {
      throw new Error("Sakprövningen gäller ett annat underlag eller format");
    }
    return sakmomentensBeredskap(provning.bedomare, provning.bedomningar, provning.underlag.referenser);
  } catch (error) {
    return { klar: false, hinder: [error instanceof Error ? error.message : String(error)] };
  }
}
