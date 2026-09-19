import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { skapaFilpaket, lasFillage, skrivFilpaket, type Fillage, type Filpaket } from "./datatransaktion.ts";
import { forberedAnkarforslag, type FrystAnkarforslag } from "./ankarforslag.ts";
import { byggAnkarunderlag, skapaSakprovning, sakprovningsBeredskap, type Sakprovning, type Sakreferens } from "./sakprovning.ts";
import { rattelsePost, type Ankarrad, type Lofte } from "./ankarsattning.ts";
import { ORSAKKODER, type Orsakkod } from "./orsakkoder.ts";
import { computeDataHash } from "./publish.ts";
import { svenskDag } from "./dagen.ts";
import type { PromiseEntry } from "./loftesforslag.ts";

export const ANKARFILER = ["promises.json", "rattelser.json", "changelog.json"] as const;
export interface Ankarindata { rader: Ankarrad[]; material: Record<string, Sakreferens[]>; varfor: string; orsak: Orsakkod }
export interface Ankarpaket { version: "ankarpaket/1"; tidpunkt: string; indata: Ankarindata; forslag: FrystAnkarforslag[]; provningar: Sakprovning[]; filer: Filpaket }
export function ankarpakethash(p: Ankarpaket): string { return createHash("sha256").update(kanoniskJson(p)).digest("hex"); }
function lista(fore: Fillage, fil: string): unknown[] {
  const text = fore[fil]; if (typeof text !== "string") throw new Error(`Fil saknas: ${fil}`);
  const v: unknown = JSON.parse(text); if (!Array.isArray(v)) throw new Error(`Kräver lista: ${fil}`); return v;
}
type Summerbart = PromiseEntry & { cost: Record<string, unknown> };
function mandat(p: Summerbart): number { return Number(p.cost.msek_base) * (p.cost.period === "per_ar" ? 4 : 1); }
function aktiva(loften: Summerbart[], parti?: string): Summerbart[] {
  const filtrerade = loften.filter((p) => p.status !== "tillbakadragen" && (!parti || p.parties.includes(parti)));
  const grupper = new Map<string, Summerbart>();
  for (const p of filtrerade) if (p.group_id) {
    const gammal = grupper.get(p.group_id);
    if (!gammal || mandat(p) > mandat(gammal) || (mandat(p) === mandat(gammal) && p.id < gammal.id)) grupper.set(p.group_id, p);
  }
  const sedda = new Set<string>();
  const ut: Summerbart[] = [];
  for (const p of filtrerade) {
    if (!p.group_id) ut.push(p);
    else if (!sedda.has(p.group_id)) { sedda.add(p.group_id); ut.push(grupper.get(p.group_id)!); }
  }
  return ut;
}
function rikssumma(loften: Summerbart[]): number {
  return aktiva(loften).filter((p) => p.cost.type === "utgift" || p.cost.type === "intäktsminskning").reduce((s, p) => s + mandat(p), 0);
}
function partisumma(loften: Summerbart[], parti: string): number {
  return aktiva(loften, parti).reduce((s, p) => s + (["besparing", "intäktsökning"].includes(String(p.cost.type)) ? -mandat(p) : mandat(p)), 0);
}
export function forberedAnkarpaket(indata: Ankarindata, fore: Fillage, nu: Date): Ankarpaket {
  if (Object.keys(fore).sort().join() !== [...ANKARFILER].sort().join()) throw new Error("Fel filuppsättning");
  if (!indata.rader.length || new Set(indata.rader.map((r) => r.id)).size !== indata.rader.length) throw new Error("Tom eller dubblerad ändringslista");
  if (!indata.varfor?.trim() || !ORSAKKODER.includes(indata.orsak)) throw new Error("Rättelsen kräver skäl och giltig orsak");
  if (Object.keys(indata.material).some((id) => !indata.rader.some((r) => r.id === id))) throw new Error("Referenser för okänt mål");
  const loften = lista(fore, "promises.json") as PromiseEntry[];
  const forslag = indata.rader.map((r) => forberedAnkarforslag(r, loften, nu));
  const provningar = forslag.map((f) => skapaSakprovning(byggAnkarunderlag(f, loften, indata.material[f.rad.id] ?? [], forslag.filter((a) => a.rad.id !== f.rad.id))));
  const nya = loften.map((p) => forslag.find((f) => f.rad.id === p.id)?.nyttLofte ?? p);
  const partier = new Map<string, number>();
  for (const parti of new Set(forslag.flatMap((f) => f.tidigareLofte.parties))) {
    const diff = partisumma(nya as Summerbart[], parti) - partisumma(loften as Summerbart[], parti);
    if (diff !== 0) partier.set(parti, diff);
  }
  const post = rattelsePost(forslag.map((f) => ({ lofte: f.tidigareLofte as unknown as Lofte, ankare: f.ankare as unknown as Lofte })), svenskDag(nu),
    { partier, riket: rikssumma(nya as Summerbart[]) - rikssumma(loften as Summerbart[]) }, indata.orsak);
  post.why = indata.varfor;
  const rattelser = [...lista(fore, "rattelser.json"), post];
  const changelog = [...lista(fore, "changelog.json"), { run_id: `ankarsattning-${svenskDag(nu)}`, added: [], updated: indata.rader.map((r) => r.id), retracted: [], data_hash: computeDataHash(nya), timestamp: nu.toISOString() }];
  const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
  return { version: "ankarpaket/1", tidpunkt: nu.toISOString(), indata: structuredClone(indata), forslag, provningar,
    filer: skapaFilpaket(fore, { "promises.json": json(nya), "rattelser.json": json(rattelser), "changelog.json": json(changelog) }) };
}
export function kontrolleraAnkarpaket(p: Ankarpaket, aktuellt: Fillage): void {
  if (kanoniskJson(p.filer.fore) !== kanoniskJson(aktuellt)) throw new Error("Paketets föreläge har ändrats");
  const nytt = forberedAnkarpaket(p.indata, aktuellt, new Date(p.tidpunkt));
  if (kanoniskJson({ ...p, provningar: nytt.provningar }) !== kanoniskJson(nytt)) throw new Error("Paketets slutform eller format har ändrats");
  if (p.provningar.length !== nytt.provningar.length) throw new Error("Prövning saknas eller är dubblerad");
  p.provningar.forEach((provning, i) => { const b = sakprovningsBeredskap(provning, nytt.provningar[i]!.underlag); if (!b.klar) throw new Error(`Sakprövningen är inte klar: ${b.hinder.join("; ")}`); });
}
export function verkstallAnkarpaket(dir: string, p: Ankarpaket, beslutetsHash: string): void {
  if (!/^[0-9a-f]{64}$/u.test(beslutetsHash) || ankarpakethash(p) !== beslutetsHash) throw new Error("Beslutet gäller inte hela paketet");
  kontrolleraAnkarpaket(p, lasFillage(dir, ANKARFILER)); skrivFilpaket(dir, p.filer);
}
