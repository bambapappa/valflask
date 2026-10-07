import {createHash} from "node:crypto";
import {kanoniskJson} from "./underlagsversion.ts";
import {byggKostnadsunderlag, sakprovningsBeredskap, type Sakprovning, type Sakreferens} from "./sakprovning.ts";
import {omprovaKostnadsforslag, type FrystKostnadsforslag, type Kostnadsrad} from "./kostnadsforslag.ts";
import type {PromiseEntry} from "./loftesforslag.ts";
export interface Kostnadsbeslutsunderlag {
  forslag: FrystKostnadsforslag; provning: Sakprovning; aktuellaReferenser: Sakreferens[]; provningshash: string;
}
/** Returnerar en kopia efter separat prövningsbindning; verifierar inte identitet eller paketattest och skriver inga filer. */
export function tillampaProvatKostnadsbeslut(rad: Kostnadsrad, loften: PromiseEntry[], underlag: Kostnadsbeslutsunderlag | undefined, beslutetsHash: string | undefined): PromiseEntry[] {
  if (!underlag || !beslutetsHash || !/^[0-9a-f]{64}$/u.test(beslutetsHash)) throw new Error("Kostnadsbeslut kräver separat beslutsunderlag och prövningshash");
  const hash = createHash("sha256").update(kanoniskJson(underlag.provning)).digest("hex");
  if (hash !== underlag.provningshash || hash !== beslutetsHash) throw new Error("Kostnadsprövningen motsvarar inte beslutets referens");
  if (kanoniskJson(rad) !== kanoniskJson(underlag.forslag.rad)) throw new Error("Kostnadsbeslutets argument har ändrats");
  const current = byggKostnadsunderlag(underlag.forslag, loften, underlag.aktuellaReferenser);
  const prov = sakprovningsBeredskap(underlag.provning, current);
  if (!prov.klar) throw new Error(`Kostnadsprövningen är inte klar: ${prov.hinder.join("; ")}`);
  const f = omprovaKostnadsforslag(underlag.forslag, loften, underlag.aktuellaReferenser, underlag.forslag.hash);
  return structuredClone(loften.map(p => p.id === f.nyttLofte.id ? f.nyttLofte : p));
}
