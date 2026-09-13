import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { flytta, provaFlytt, type Flyttrad } from "./kalkylflytt.ts";
import type { PromiseEntry } from "./loftesforslag.ts";
import { reviewId, type ReviewCandidate } from "./review.ts";
import { svenskDag } from "./dagen.ts";

export interface FrystKalkylforslag {
  version: "kalkylforslag/1";
  fore: { loften: string; kopost: string };
  tidpunkt: string;
  rad: Flyttrad;
  kopost: ReviewCandidate;
  tidigareLofte: PromiseEntry;
  nyttLofte: PromiseEntry;
  hash: string;
}
function hash(v: unknown): string { return createHash("sha256").update(kanoniskJson(v)).digest("hex"); }

/** Förbereder en kostnadsändring; fattar inget sakligt eller mänskligt beslut. */
export function forberedKalkylforslag(rad: Flyttrad, loften: PromiseEntry[], kopost: ReviewCandidate, nu: Date): FrystKalkylforslag {
  if (!loften.length || new Set(loften.map((p) => p.id)).size !== loften.length) throw new Error("Tomt eller dubblerat löftesbestånd");
  if (rad.fran !== reviewId(kopost)) throw new Error("Kalkylflytten avser en annan köpost");
  if (hash(rad.kostnad) !== hash(kopost.cost)) throw new Error("Kostnaden skiljer sig från den bundna kandidatens kostnad");
  const mal = loften.find((p) => p.id === rad.till);
  if (!mal) throw new Error("Kalkylflyttens mål saknas");
  if (!["reform", "inriktning"].includes(mal.loftestyp ?? "")) throw new Error("Målet saknar prövad löftestyp");
  const parter = kopost.candidate.parties ?? [];
  if (!parter.length || kanoniskJson([...parter].sort()) !== kanoniskJson([...mal.parties].sort()) ||
      kanoniskJson(kopost.candidate.person ?? null) !== kanoniskJson(mal.person ?? null)) {
    throw new Error("Kalkylflytten byter parti, person eller aktörsnivå");
  }
  const prov = provaFlytt(rad, mal as unknown as Parameters<typeof provaFlytt>[1]);
  if (!prov.ok) throw new Error(prov.fel.join("; "));
  if (prov.hoppas) throw new Error("Kalkylen är redan flyttad");
  const tal = [rad.kostnad.msek_low ?? rad.kostnad.msek_base, rad.kostnad.msek_base, rad.kostnad.msek_high ?? rad.kostnad.msek_base];
  if (!tal.every((v) => typeof v === "number" && Number.isFinite(v))) throw new Error("Kalkylen saknar ändliga belopp");
  if (mal.loftestyp === "inriktning" && tal.some((v) => v !== 0)) {
    throw new Error("En inriktning ska vara nollad; ett belopp bevisar inte att löftet är en reform");
  }
  const efter = flytta(mal as unknown as Parameters<typeof flytta>[0], rad, svenskDag(nu)) as unknown as PromiseEntry;
  // Kostnadens källhänvisning hör till den nya uträkningen, inte den ersatta.
  efter.cost.basis_url = rad.kostnad.basis_url ?? null;
  const payload = { version: "kalkylforslag/1" as const, fore: { loften: hash(loften), kopost: hash(kopost) },
    tidpunkt: nu.toISOString(), rad: structuredClone(rad), kopost: structuredClone(kopost), tidigareLofte: structuredClone(mal), nyttLofte: efter };
  return structuredClone({ ...payload, hash: hash(payload) });
}

/** Konsumerar exakt sparad slutform efter kontroll av både föreläge och förslag. */
export function tillampaKalkylforslag(forslag: FrystKalkylforslag, loften: PromiseEntry[], kopost: ReviewCandidate, forvantadHash: string): PromiseEntry[] {
  const { hash: sparad, ...payload } = forslag;
  if (forslag.version !== "kalkylforslag/1" || hash(payload) !== sparad || sparad !== forvantadHash) throw new Error("Kalkylförslaget har ändrats");
  const aktuellt = forberedKalkylforslag(forslag.rad, loften, kopost, new Date(forslag.tidpunkt));
  if (aktuellt.hash !== sparad) throw new Error("Kalkylförslagets föreläge eller slutform har ändrats");
  return structuredClone(loften.map((p) => p.id === forslag.nyttLofte.id ? forslag.nyttLofte : p));
}
