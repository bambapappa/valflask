import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { skapaFilpaket, lasFillage, skrivFilpaket, type Fillage, type Filpaket } from "./datatransaktion.ts";
import { avvisa, type Avvisning } from "./avvisningar.ts";
import { reviewId, type ReviewCandidate } from "./review.ts";
import { svenskDag } from "./dagen.ts";

export const AVVISNINGSFILER = ["needs_review.json", "avvisade.json"] as const;
export const AVVISNINGSSKAL_MIN_TECKEN = 25;
export interface Avvisningsrad { id: string; skal: string }
export interface Avvisningsbeslut { bedomare: string; utfall: "avvisa"; motivering: string; forslagshash: string; kalla: { system: "github"; association: "OWNER"; actor: string; handelse: string } }
export interface Avvisningspaket { version: "avvisningspaket/1"; tidpunkt: string; rader: Avvisningsrad[]; kandidater: ReviewCandidate[]; beslut: Avvisningsbeslut | null; filer: Filpaket }
export function avvisningspakethash(p: Avvisningspaket): string { return createHash("sha256").update(kanoniskJson(p)).digest("hex"); }
function lista<T>(f: Fillage, n: string): T[] { const t = f[n]; if (typeof t !== "string") throw new Error(`Fil saknas: ${n}`); const v: unknown = JSON.parse(t); if (!Array.isArray(v)) throw new Error(`Kräver lista: ${n}`); return v as T[]; }
function forslagshash(p: Omit<Avvisningspaket, "beslut">): string { return createHash("sha256").update(kanoniskJson(p)).digest("hex"); }
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
  const b = p.beslut, fh = avvisningsforslagshash(p);
  if (!b || Object.keys(b).sort().join(",") !== "bedomare,forslagshash,kalla,motivering,utfall" || b.utfall !== "avvisa" ||
      !b.bedomare?.trim() || b.motivering?.trim().length < AVVISNINGSSKAL_MIN_TECKEN || b.forslagshash !== fh ||
      Object.keys(b.kalla ?? {}).sort().join(",") !== "actor,association,handelse,system" || b.kalla.system !== "github" ||
      b.kalla.association !== "OWNER" || b.kalla.actor !== b.bedomare ||
      !/^https:\/\/github\.com\//u.test(b.kalla.handelse)) {
    throw new Error("Ett separat mänskligt avslagsbeslut saknas eller gäller annat förslag");
  }
}
export function verkstallAvvisningspaket(dir: string, p: Avvisningspaket, h: string): void { if (!/^[0-9a-f]{64}$/u.test(h) || avvisningspakethash(p) !== h) throw new Error("Beslutet gäller inte hela paketet"); kontrolleraAvvisningspaket(p, lasFillage(dir, AVVISNINGSFILER)); skrivFilpaket(dir, p.filer); }
export function avvisningsforslagshash(p: Avvisningspaket): string { return forslagshash({ version: p.version, tidpunkt: p.tidpunkt, rader: p.rader, kandidater: p.kandidater, filer: p.filer }); }

export interface GithubAvvisning {
  repository: string; issue: number; reviewId: string; actor: string; actorType: string;
  association: string; handelse: string; forslagshash: string;
}

/** Bind ett redan fryst privat förslag till ägarens verifierade kommentar. */
export function bindGithubAvvisning(paket: Avvisningspaket, event: GithubAvvisning): Avvisningspaket {
  if (paket.beslut !== null) throw new Error("Paketet har redan ett beslut");
  const url = new URL(event.handelse);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(event.repository) ||
      !Number.isSafeInteger(event.issue) || event.issue < 1 ||
      url.origin !== "https://github.com" || url.username || url.password || url.search ||
      url.pathname !== `/${event.repository}/issues/${event.issue}` ||
      !/^#issuecomment-[1-9][0-9]*$/u.test(url.hash)) {
    throw new Error("Beslutets händelse gäller inte angivet repo och issue");
  }
  if (event.association !== "OWNER" || event.actorType !== "User" ||
      !event.actor || event.actor.toLowerCase() !== event.repository.split("/")[0]!.toLowerCase()) {
    throw new Error("Beslutet måste komma från repots mänskliga ägare");
  }
  if (!/^[0-9a-f]{64}$/u.test(event.forslagshash) || event.forslagshash !== avvisningsforslagshash(paket)) {
    throw new Error("Beslutets hash gäller inte det frysta avslagsförslaget");
  }
  if (!/^[0-9a-f]{12}$/u.test(event.reviewId) || paket.rader.length !== 1 ||
      paket.rader[0]?.id !== event.reviewId) {
    throw new Error("Paketet gäller inte issue-postens stabila review-id");
  }
  const result = structuredClone(paket);
  result.beslut = {
    bedomare: event.actor, utfall: "avvisa", motivering: paket.rader[0]!.skal,
    forslagshash: event.forslagshash,
    kalla: { system: "github", association: "OWNER", actor: event.actor, handelse: event.handelse },
  };
  return result;
}
