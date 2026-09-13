import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { byggSakunderlag, sakprovningsBeredskap, type Sakprovning, type Sakreferens } from "./sakprovning.ts";
import { tillampaKalkylforslag, type FrystKalkylforslag } from "./kalkylforslag.ts";
import type { PromiseEntry } from "./loftesforslag.ts";
import type { ReviewCandidate } from "./review.ts";
import type { Flyttrad } from "./kalkylflytt.ts";
export interface Kalkylbeslutsunderlag {
  forslag: FrystKalkylforslag;
  provning: Sakprovning;
  aktuellaReferenser: Sakreferens[];
  provningshash: string;
}
/** Kräver prövning av exakt ändring; kontrollerar inte människans identitet. */
export function tillampaProvatKalkylbeslut(rad: Flyttrad, loften: PromiseEntry[], kopost: ReviewCandidate,
  underlag: Kalkylbeslutsunderlag | undefined, beslutetsHash: string | undefined): PromiseEntry[] {
  if (!underlag || !beslutetsHash || !/^[0-9a-f]{64}$/u.test(beslutetsHash)) throw new Error("Kalkylflytt kräver separat beslutsunderlag och beslutets prövningshash");
  const hash = createHash("sha256").update(kanoniskJson(underlag.provning)).digest("hex");
  if (hash !== underlag.provningshash || hash !== beslutetsHash) throw new Error("Kalkylprövningen motsvarar inte beslutets referens");
  if (kanoniskJson(rad) !== kanoniskJson(underlag.forslag.rad)) throw new Error("Kalkylbeslutets argument har ändrats");
  const aktuellt = byggSakunderlag(underlag.forslag, loften, kopost, underlag.aktuellaReferenser);
  const prov = sakprovningsBeredskap(underlag.provning, aktuellt);
  if (!prov.klar) throw new Error(`Kalkylprövningen är inte klar: ${prov.hinder.join("; ")}`);
  return tillampaKalkylforslag(underlag.forslag, loften, kopost, underlag.forslag.hash);
}
