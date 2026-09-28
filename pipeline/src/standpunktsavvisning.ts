import { createHash } from "node:crypto";
import { avvisa, type Avvisning } from "./avvisningar.ts";
import { skapaFilpaket, type Fillage, type Filpaket } from "./datatransaktion.ts";
import { svenskDag } from "./dagen.ts";
import type { StanceCandidate, StanceReviewEntry } from "./stance-pipeline.ts";

export const STANDPUNKTSAVVISNINGSFILER = ["stances_review.json", "avvisade.json"] as const;

export function stanceReviewId(e: StanceReviewEntry): string {
  const c = e.candidate as Partial<StanceCandidate> | null | undefined;
  return createHash("sha256")
    .update(`${e.articleUrl}::${c?.subquestion_id ?? ""}::${c?.party ?? ""}::${c?.quote ?? ""}`)
    .digest("hex")
    .slice(0, 12);
}

/** Beräknar båda efterfilerna innan någon köpost kan tas bort. */
export function forberedStandpunktsavvisning(id: string, skal: string, fore: Fillage, nu: Date): Filpaket {
  if (Object.keys(fore).sort().join() !== [...STANDPUNKTSAVVISNINGSFILER].sort().join()) throw new Error("Fel filuppsättning");
  if (!id || skal.trim().length < 25) throw new Error("Ange id och ett tydligt avvisningsskäl på minst 25 tecken");
  if (!fore["stances_review.json"]) throw new Error("Ståndpunktskön saknas");
  const ko: unknown = JSON.parse(fore["stances_review.json"]);
  const minne: unknown = fore["avvisade.json"] === null ? [] : JSON.parse(fore["avvisade.json"]!);
  if (!Array.isArray(ko) || !Array.isArray(minne) ||
      minne.some((r) => !r || typeof r.nyckel !== "string" || typeof r.url !== "string" ||
        typeof r.citat !== "string" || typeof r.skal !== "string" || typeof r.datum !== "string")) {
    throw new Error("Ståndpunktskö eller avvisningsminne är ogiltigt");
  }
  const ids = ko.map((e) => stanceReviewId(e as StanceReviewEntry));
  if (new Set(ids).size !== ids.length) throw new Error("Dubblerade identiteter i ståndpunktskön");
  const index = ids.indexOf(id);
  if (index < 0) throw new Error("Ståndpunkten finns inte längre i kön");
  const entry = ko[index] as StanceReviewEntry;
  const url = entry.sourceUrl ?? entry.articleUrl;
  const citat = (entry.candidate as Partial<StanceCandidate> | null | undefined)?.quote;
  if (!url?.trim() || !citat?.trim()) throw new Error("Källa eller citat saknas; avvisningen kan inte spåras");
  const kvar = [...ko.slice(0, index), ...ko.slice(index + 1)];
  const nyttMinne = avvisa(minne as Avvisning[], url, citat, skal.trim(), svenskDag(nu));
  const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
  return skapaFilpaket(fore, { "stances_review.json": json(kvar), "avvisade.json": json(nyttMinne) });
}
