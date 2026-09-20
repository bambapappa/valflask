import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { skapaFilpaket, lasFillage, skrivFilpaket, type Fillage, type Filpaket } from "./datatransaktion.ts";
import { forberedGruppforslag, type FrystGruppforslag } from "./gruppforslag.ts";
import { byggGruppunderlag, skapaSakprovning, sakprovningsBeredskap, type Sakprovning, type Sakreferens } from "./sakprovning.ts";
import { ORSAKKODER, type Orsakkod } from "./orsakkoder.ts";
import { computeDataHash } from "./publish.ts";
import { svenskDag } from "./dagen.ts";
import { provaGrupprad, sankningsdelta, type Grupprad, type Grupplofte } from "./gruppsattning.ts";
import type { PromiseEntry } from "./loftesforslag.ts";

export const GRUPPFILER = ["promises.json", "rattelser.json", "changelog.json"] as const;
export interface Gruppindata { rader: Grupprad[]; material: Record<string, Sakreferens[]>; varfor: string; orsak: Orsakkod }
export interface Grupppaket {
  version: "grupppaket/1";
  tidpunkt: string;
  indata: Gruppindata;
  forslag: FrystGruppforslag[];
  provningar: Sakprovning[];
  filer: Filpaket;
}
export function grupppakethash(p: Grupppaket): string {
  return createHash("sha256").update(kanoniskJson(p)).digest("hex");
}
function lista(fore: Fillage, fil: string): unknown[] {
  const text = fore[fil];
  if (typeof text !== "string") throw new Error(`Fil saknas: ${fil}`);
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error(`Kräver lista: ${fil}`);
  return value;
}
/** Fryser offentliga loggar tillsammans med förslagen; inga bedömningar fylls i. */
export function forberedGrupppaket(indata: Gruppindata, fore: Fillage, nu: Date): Grupppaket {
  if (Object.keys(fore).sort().join() !== [...GRUPPFILER].sort().join()) throw new Error("Fel filuppsättning");
  const ids = indata.rader.flatMap(r => r.ids);
  if (!indata.rader.length || !ids.length || new Set(ids).size !== ids.length || new Set(indata.rader.map(r => r.grupp)).size !== indata.rader.length) throw new Error("Tom eller dubblerad ändringslista");
  if (!indata.varfor?.trim() || !ORSAKKODER.includes(indata.orsak)) throw new Error("Rättelsen kräver skäl och giltig orsak");
  if (Object.keys(indata.material).some((id) => !ids.includes(id))) throw new Error("Referenser för okänt mål");
  const loften = lista(fore, "promises.json") as PromiseEntry[];
  const byId = new Map((loften as unknown as Grupplofte[]).map(p => [p.id, p]));
  for (const rad of indata.rader) {
    const prov = provaGrupprad(rad, byId);
    if (!prov.ok) throw new Error(prov.fel.join("; "));
    if (rad.ids.every(id => byId.get(id)?.group_id === rad.grupp)) throw new Error("Alla gruppmedlemskap i raden är oförändrade");
  }
  const forslag = indata.rader.flatMap(r => r.ids.filter(id => loften.find(p => p.id === id)?.group_id !== r.grupp).map(id => forberedGruppforslag({ ...r, id }, loften, nu)));
  if (!forslag.length) throw new Error("Alla gruppmedlemskap är oförändrade");
  const provningar = forslag.map((f) => skapaSakprovning(byggGruppunderlag(f, loften, indata.material[f.rad.id] ?? [], forslag.filter((andra) => andra.rad.id !== f.rad.id))));
  const nya = loften.map((p) => forslag.find((f) => f.rad.id === p.id)?.nyttLofte ?? p);
  const datum = svenskDag(nu);
  const rattelser = [...lista(fore, "rattelser.json"), {
    date: datum, affects: `Löftessidorna för ${forslag.map(f => f.rad.id).join(", ")}`,
    what: `${indata.rader.length} grupper har bildats eller utökats. Samma politik räknas en gång. Rikssumman minskar med ${indata.rader.reduce((sum, r) => sum + sankningsdelta(r, loften as unknown as Grupplofte[]), 0).toLocaleString("sv-SE")} miljoner kronor för mandatperioden. ` + indata.rader.map(r => r.skal).join(" "),
    why: indata.varfor, orsak: indata.orsak, commit: "0000000",
  }];
  const changelog = [...lista(fore, "changelog.json"), {
    run_id: `gruppsattning-${datum}`, added: [], updated: forslag.map(f => f.rad.id), retracted: [],
    data_hash: computeDataHash(nya), timestamp: nu.toISOString(),
  }];
  const json = (v: unknown): string => JSON.stringify(v, null, 2) + "\n";
  return { version: "grupppaket/1", tidpunkt: nu.toISOString(), indata: structuredClone(indata), forslag, provningar,
    filer: skapaFilpaket(fore, { "promises.json": json(nya), "rattelser.json": json(rattelser), "changelog.json": json(changelog) }) };
}
/** Strukturell kontroll; styrker varken källornas sanning eller beslutarens identitet. */
export function kontrolleraGrupppaket(p: Grupppaket, aktuellt: Fillage): void {
  if (kanoniskJson(p.filer.fore) !== kanoniskJson(aktuellt)) throw new Error("Paketets föreläge har ändrats");
  const nytt = forberedGrupppaket(p.indata, aktuellt, new Date(p.tidpunkt));
  if (kanoniskJson({ ...p, provningar: nytt.provningar }) !== kanoniskJson(nytt)) throw new Error("Paketets slutform eller format har ändrats");
  if (p.provningar.length !== nytt.provningar.length) throw new Error("Prövning saknas eller är dubblerad");
  p.provningar.forEach((provning, i) => {
    const prov = sakprovningsBeredskap(provning, nytt.provningar[i]!.underlag);
    if (!prov.klar) throw new Error(`Sakprövningen är inte klar: ${prov.hinder.join("; ")}`);
  });
}
export function verkstallGrupppaket(dir: string, p: Grupppaket, beslutetsHash: string): void {
  if (!/^[0-9a-f]{64}$/u.test(beslutetsHash) || grupppakethash(p) !== beslutetsHash) throw new Error("Beslutet gäller inte hela paketet");
  kontrolleraGrupppaket(p, lasFillage(dir, GRUPPFILER));
  skrivFilpaket(dir, p.filer);
}
