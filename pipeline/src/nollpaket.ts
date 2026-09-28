import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { skapaFilpaket, lasFillage, skrivFilpaket, type Fillage, type Filpaket } from "./datatransaktion.ts";
import { forberedNollforslag, type FrystNollforslag } from "./nollforslag.ts";
import { byggNollunderlag, skapaSakprovning, sakprovningsBeredskap, type Sakprovning, type Sakreferens } from "./sakprovning.ts";
import { rattelsePost, type Lofte, type Nollrad } from "./regelnollning.ts";
import { ORSAKKODER, type Orsakkod } from "./orsakkoder.ts";
import { computeDataHash } from "./publish.ts";
import { svenskDag } from "./dagen.ts";
import type { PromiseEntry } from "./loftesforslag.ts";

export const NOLLFILER = ["promises.json", "rattelser.json", "changelog.json"] as const;
export interface Nollindata { rader: Nollrad[]; material: Record<string, Sakreferens[]>; varfor: string; orsak: Orsakkod }
export interface Nollpaket { version: "nollpaket/1"; tidpunkt: string; indata: Nollindata; forslag: FrystNollforslag[]; provningar: Sakprovning[]; filer: Filpaket }
export function nollpakethash(p: Nollpaket): string { return createHash("sha256").update(kanoniskJson(p)).digest("hex"); }
function lista(f: Fillage, n: string): unknown[] { const t = f[n]; if (typeof t !== "string") throw new Error(`Fil saknas: ${n}`); const v: unknown = JSON.parse(t); if (!Array.isArray(v)) throw new Error(`Kräver lista: ${n}`); return v; }
type S = PromiseEntry & { cost: Record<string, unknown> };
const mandat = (p: S) => Number(p.cost.msek_base) * (p.cost.period === "per_ar" ? 4 : 1);
function aktiva(ls: S[], parti?: string): S[] { const f = ls.filter((p) => p.status !== "tillbakadragen" && (!parti || p.parties.includes(parti))), g = new Map<string, S>(); for (const p of f) if (p.group_id) { const a = g.get(p.group_id); if (!a || mandat(p) > mandat(a) || (mandat(p) === mandat(a) && p.id < a.id)) g.set(p.group_id, p); } const sedda = new Set<string>(), ut: S[] = []; for (const p of f) if (!p.group_id) ut.push(p); else if (!sedda.has(p.group_id)) { sedda.add(p.group_id); ut.push(g.get(p.group_id)!); } return ut; }
const riket = (ls: S[]) => aktiva(ls).filter((p) => p.cost.type === "utgift" || p.cost.type === "intäktsminskning").reduce((s, p) => s + mandat(p), 0);
const parti = (ls: S[], kod: string) => aktiva(ls, kod).reduce((s, p) => s + (["besparing", "intäktsökning"].includes(String(p.cost.type)) ? -mandat(p) : mandat(p)), 0);
export function forberedNollpaket(indata: Nollindata, fore: Fillage, nu: Date): Nollpaket {
  if (Object.keys(fore).sort().join() !== [...NOLLFILER].sort().join()) throw new Error("Fel filuppsättning");
  if (!indata.rader.length || new Set(indata.rader.map((r) => r.id)).size !== indata.rader.length) throw new Error("Tom eller dubblerad ändringslista");
  if (!indata.varfor?.trim() || !ORSAKKODER.includes(indata.orsak)) throw new Error("Rättelsen kräver skäl och giltig orsak");
  if (Object.keys(indata.material).some((id) => !indata.rader.some((r) => r.id === id))) throw new Error("Referenser för okänt mål");
  const loften = lista(fore, "promises.json") as PromiseEntry[], forslag = indata.rader.map((r) => forberedNollforslag(r, loften, nu));
  const provningar = forslag.map((f) => skapaSakprovning(byggNollunderlag(f, loften, indata.material[f.rad.id] ?? [], forslag.filter((a) => a.rad.id !== f.rad.id))));
  const nya = loften.map((p) => forslag.find((f) => f.rad.id === p.id)?.nyttLofte ?? p), partier = new Map<string, number>();
  for (const kod of new Set(forslag.flatMap((f) => f.tidigareLofte.parties))) { const d = parti(loften as S[], kod) - parti(nya as S[], kod); if (d !== 0) partier.set(kod, d); }
  const post = rattelsePost(forslag.map((f) => ({ lofte: f.tidigareLofte as unknown as Lofte, rad: f.rad })), svenskDag(nu), { partier, riket: riket(loften as S[]) - riket(nya as S[]) }, indata.orsak); post.why = indata.varfor;
  const rattelser = [...lista(fore, "rattelser.json"), post], changelog = [...lista(fore, "changelog.json"), { run_id: `regelnollning-${svenskDag(nu)}`, added: [], updated: indata.rader.map((r) => r.id), retracted: [], data_hash: computeDataHash(nya), timestamp: nu.toISOString() }];
  const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
  return { version: "nollpaket/1", tidpunkt: nu.toISOString(), indata: structuredClone(indata), forslag, provningar, filer: skapaFilpaket(fore, { "promises.json": json(nya), "rattelser.json": json(rattelser), "changelog.json": json(changelog) }) };
}
export function kontrolleraNollpaket(p: Nollpaket, aktuellt: Fillage): void { if (kanoniskJson(p.filer.fore) !== kanoniskJson(aktuellt)) throw new Error("Paketets föreläge har ändrats"); const nytt = forberedNollpaket(p.indata, aktuellt, new Date(p.tidpunkt)); if (kanoniskJson({ ...p, provningar: nytt.provningar }) !== kanoniskJson(nytt)) throw new Error("Paketets slutform eller format har ändrats"); if (p.provningar.length !== nytt.provningar.length) throw new Error("Prövning saknas eller är dubblerad"); p.provningar.forEach((x, i) => { const b = sakprovningsBeredskap(x, nytt.provningar[i]!.underlag); if (!b.klar) throw new Error(`Sakprövningen är inte klar: ${b.hinder.join("; ")}`); }); }
export function verkstallNollpaket(dir: string, p: Nollpaket, h: string): void { if (!/^[0-9a-f]{64}$/u.test(h) || nollpakethash(p) !== h) throw new Error("Beslutet gäller inte hela paketet"); kontrolleraNollpaket(p, lasFillage(dir, NOLLFILER)); skrivFilpaket(dir, p.filer); }
