import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { skapaFilpaket, lasFillage, skrivFilpaket, type Fillage, type Filpaket } from "./datatransaktion.ts";
import { avvisa, type Avvisning } from "./avvisningar.ts";
import { reviewId, type ReviewCandidate } from "./review.ts";
import { svenskDag } from "./dagen.ts";

export const AVVISNINGSFILER = ["needs_review.json", "avvisade.json"] as const;
export const AVVISNINGSSKAL_MIN_TECKEN = 25;
export interface Avvisningsrad { id: string; skal: string }
export interface Avvisningsbeslut { bedomare: string; utfall: "avvisa"; motivering: string; forslagshash: string; kalla: { system: "github"; association: "OWNER"; handelse: string } }
export interface Avvisningspaket { version: "avvisningspaket/1"; tidpunkt: string; rader: Avvisningsrad[]; kandidater: ReviewCandidate[]; beslut: Avvisningsbeslut | null; filer: Filpaket }
export function avvisningspakethash(p: Avvisningspaket): string { return createHash("sha256").update(kanoniskJson(p)).digest("hex"); }
function lista<T>(f: Fillage, n: string): T[] { const t = f[n]; if (typeof t !== "string") throw new Error(`Fil saknas: ${n}`); const v: unknown = JSON.parse(t); if (!Array.isArray(v)) throw new Error(`Kräver lista: ${n}`); return v as T[]; }
function forslagshash(p: Omit<Avvisningspaket, "beslut" | "filer">): string { return createHash("sha256").update(kanoniskJson(p)).digest("hex"); }
export function forberedAvvisningspaket(rader: Avvisningsrad[], fore: Fillage, nu: Date): Avvisningspaket {
  if (Object.keys(fore).sort().join() !== [...AVVISNINGSFILER].sort().join()) throw new Error("Fel filuppsättning");
  if (!rader.length || new Set(rader.map((r) => r.id)).size !== rader.length ||
      rader.some((r) => Object.keys(r).sort().join(",") !== "id,skal" || r.skal?.trim().length < AVVISNINGSSKAL_MIN_TECKEN)) {
    throw new Error("Tom, dubblerad eller otillräckligt motiverad avvisningslista");
  }
  const ko = lista<ReviewCandidate>(fore, "needs_review.json"), minne = lista<Avvisning>(fore, "avvisade.json");
  const koId = ko.map(reviewId); if (new Set(koId).size !== koId.length) throw new Error("Dubblerad kandidatidentitet i kön");
  const perId = new Map(ko.map((k) => [reviewId(k), k])), kandidater = rader.map((r) => { const k = perId.get(r.id); if (!k) throw new Error(`${r.id} finns inte i kön`); return structuredClone(k); });
  const kvar = ko.filter((k) => !new Set(rader.map((r) => r.id)).has(reviewId(k))); let nyttMinne = minne;
  for (let i = 0; i < rader.length; i++) { const k = kandidater[i]!, r = rader[i]!; const url = k.articleUrl ?? "", citat = k.candidate?.quote ?? ""; if (!url || !citat) throw new Error(`${r.id} saknar källa eller citat och kan inte lämna spår`); nyttMinne = avvisa(nyttMinne, url, citat, r.skal.trim(), svenskDag(nu)); }
  const bas = { version: "avvisningspaket/1" as const, tidpunkt: nu.toISOString(), rader: structuredClone(rader), kandidater };
  const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
  return { ...bas, beslut: null, filer: skapaFilpaket(fore, { "needs_review.json": json(kvar), "avvisade.json": json(nyttMinne) }) };
}
export function kontrolleraAvvisningspaket(p: Avvisningspaket, aktuellt: Fillage): void {
  if (kanoniskJson(p.filer.fore) !== kanoniskJson(aktuellt)) throw new Error("Paketets föreläge har ändrats");
  const nytt = forberedAvvisningspaket(p.rader, aktuellt, new Date(p.tidpunkt));
  if (kanoniskJson({ ...p, beslut: null }) !== kanoniskJson(nytt)) throw new Error("Avvisningens slutform eller kandidater har ändrats");
  const b = p.beslut, fh = forslagshash({ version: p.version, tidpunkt: p.tidpunkt, rader: p.rader, kandidater: p.kandidater });
  if (!b || Object.keys(b).sort().join(",") !== "bedomare,forslagshash,kalla,motivering,utfall" || b.utfall !== "avvisa" ||
      !b.bedomare?.trim() || b.motivering?.trim().length < AVVISNINGSSKAL_MIN_TECKEN || b.forslagshash !== fh ||
      Object.keys(b.kalla ?? {}).sort().join(",") !== "association,handelse,system" || b.kalla.system !== "github" ||
      b.kalla.association !== "OWNER" || !/^https:\/\/github\.com\//u.test(b.kalla.handelse)) {
    throw new Error("Ett separat mänskligt avslagsbeslut saknas eller gäller annat förslag");
  }
}
export function verkstallAvvisningspaket(dir: string, p: Avvisningspaket, h: string): void { if (!/^[0-9a-f]{64}$/u.test(h) || avvisningspakethash(p) !== h) throw new Error("Beslutet gäller inte hela paketet"); kontrolleraAvvisningspaket(p, lasFillage(dir, AVVISNINGSFILER)); skrivFilpaket(dir, p.filer); }
export function avvisningsforslagshash(p: Avvisningspaket): string { return forslagshash({ version: p.version, tidpunkt: p.tidpunkt, rader: p.rader, kandidater: p.kandidater }); }
