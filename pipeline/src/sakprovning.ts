import { createHash } from "node:crypto";
import { bindUnderlag, kanoniskJson, sammaUnderlag, type BundetUnderlag } from "./underlagsversion.ts";
import { byggUnderlagsregister } from "./underlagsregister.ts";
import { tillampaLoftesforslag, type FrystLoftesforslag, type PromiseEntry } from "./loftesforslag.ts";
import type { ReviewCandidate } from "./review.ts";

export interface Sakreferens {
  id: string;
  slag: "kalla" | "regel";
  adress: string;
  innehall: string;
}
export interface Sakunderlag {
  version: "sakunderlag/1";
  forslag: FrystLoftesforslag;
  poster: BundetUnderlag;
  referenser: Sakreferens[];
  hash: string;
}

export const SAKMOMENT = {
  teknik: "Är format, identiteter och beräkningar tekniskt giltiga?",
  kallstod: "Står citatet i källan och bär sammanhanget påståendet?",
  loftesregel: "Är detta ett löfte enligt den angivna metodversionen?",
  aktor: "Är rätt parti eller person ansvarig för påståendet?",
  grupper: "Är grupp, ankare och hantering av överlappningar riktiga?",
  ekonomi: "Prissätts rätt åtgärd, används partiets belopp där det finns och är nollor rätt klassade?",
  period: "Avser varje belopp rätt år, period, enhet och jämförelsegrund?",
  journalisten: "Vilken invändning skulle en journalist resa och vad besvarar den?",
  sakkunnig: "Vilken invändning skulle en sakkunnig resa och vad besvarar den?",
  partiet: "Vilken invändning skulle det granskade partiet resa och vad besvarar den?",
} as const;
export type Sakmoment = keyof typeof SAKMOMENT;
export interface Sakbedomning {
  moment: Sakmoment;
  utfall: "styrkt" | "motsagt" | "oavgjort";
  motivering: string;
  belagg: string[];
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
function referenser(referenser: readonly Sakreferens[]): Sakreferens[] {
  const ids = new Set<string>();
  for (const r of referenser) {
    if (!r || !r.id?.trim() || ids.has(r.id) || !["kalla", "regel"].includes(r.slag) ||
        !r.adress?.trim() || !r.innehall?.trim() ||
        Object.keys(r).sort().join(",") !== "adress,id,innehall,slag") {
      throw new Error("Referensmaterial saknas, är dubblerat eller har okänt format");
    }
    ids.add(r.id);
  }
  return structuredClone([...referenser].sort((a, b) => a.id.localeCompare(b.id)));
}

/** Binder sparad slutform och rekursiva grupp-/ankarberoenden; hämtar inga källor. */
export function byggSakunderlag(
  forslag: FrystLoftesforslag,
  loften: PromiseEntry[],
  kopost: ReviewCandidate,
  material: readonly Sakreferens[],
): Sakunderlag {
  const efter = tillampaLoftesforslag(forslag, loften, kopost, forslag.hash);
  const register = byggUnderlagsregister({
    loften: efter as unknown as Record<string, unknown>[],
    handlingar: [], kopplingar: [], standpunkter: [],
  });
  const payload = {
    version: "sakunderlag/1" as const,
    forslag: structuredClone(forslag),
    poster: bindUnderlag(`lofte:${forslag.nyttLofte.id}`, register),
    referenser: referenser(material),
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
      kanoniskJson(referenser(underlag.referenser)) !== kanoniskJson(underlag.referenser)) {
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
    const hinder: string[] = [];
    if (!provning.bedomare?.trim()) hinder.push("Bedömare saknas");
    const refs = provning.underlag.referenser;
    for (const slag of ["kalla", "regel"] as const) {
      if (!refs.some((r) => r.slag === slag)) hinder.push(`Referensmaterial saknas: ${slag}`);
    }
    const ids = new Set(refs.map((r) => r.id));
    const moment = Object.keys(SAKMOMENT) as Sakmoment[];
    if (!Array.isArray(provning.bedomningar) || provning.bedomningar.length !== moment.length ||
        new Set(provning.bedomningar.map((b) => b.moment)).size !== moment.length) {
      throw new Error("Sakprövningen måste redovisa varje moment exakt en gång");
    }
    for (const b of provning.bedomningar) {
      if (!moment.includes(b.moment) || !["styrkt", "motsagt", "oavgjort"].includes(b.utfall) ||
          Object.keys(b).sort().join(",") !== "belagg,moment,motivering,utfall") {
        throw new Error("Okänt bedömningsformat");
      }
      if (b.utfall !== "styrkt") hinder.push(`${b.moment}: ${b.utfall}`);
      if (!b.motivering?.trim() || !Array.isArray(b.belagg) || !b.belagg.length ||
          b.belagg.some((id) => !ids.has(id))) hinder.push(`${b.moment}: motivering eller spårbara belägg saknas`);
    }
    return { klar: hinder.length === 0, hinder };
  } catch (error) {
    return { klar: false, hinder: [error instanceof Error ? error.message : String(error)] };
  }
}
