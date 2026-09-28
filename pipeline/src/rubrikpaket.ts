import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { skapaFilpaket, lasFillage, skrivFilpaket, type Fillage, type Filpaket } from "./datatransaktion.ts";
import { forberedRubrikforslag, type FrystRubrikforslag } from "./rubrikforslag.ts";
import { byggRubrikunderlag, skapaSakprovning, sakprovningsBeredskap, type Sakprovning, type Sakreferens } from "./sakprovning.ts";
import { ORSAKKODER, type Orsakkod } from "./orsakkoder.ts";
import { computeDataHash } from "./publish.ts";
import { svenskDag } from "./dagen.ts";
import type { Rubrikrad } from "./rubrikbyte.ts";
import type { PromiseEntry } from "./loftesforslag.ts";

export const RUBRIKFILER = ["promises.json", "rattelser.json", "changelog.json"] as const;
export interface Rubrikindata { rader: Rubrikrad[]; material: Record<string, Sakreferens[]>; varfor: string; orsak: Orsakkod }
export interface Rubrikpaket {
  version: "rubrikpaket/1";
  tidpunkt: string;
  indata: Rubrikindata;
  forslag: FrystRubrikforslag[];
  provningar: Sakprovning[];
  filer: Filpaket;
}
export function rubrikpakethash(p: Rubrikpaket): string {
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
export function forberedRubrikpaket(indata: Rubrikindata, fore: Fillage, nu: Date): Rubrikpaket {
  if (Object.keys(fore).sort().join() !== [...RUBRIKFILER].sort().join()) throw new Error("Fel filuppsättning");
  if (!indata.rader.length || new Set(indata.rader.map((r) => r.id)).size !== indata.rader.length) throw new Error("Tom eller dubblerad ändringslista");
  if (!indata.varfor?.trim() || !ORSAKKODER.includes(indata.orsak)) throw new Error("Rättelsen kräver skäl och giltig orsak");
  if (Object.keys(indata.material).some((id) => !indata.rader.some((r) => r.id === id))) throw new Error("Referenser för okänt mål");
  const loften = lista(fore, "promises.json") as PromiseEntry[];
  const forslag = indata.rader.map((r) => forberedRubrikforslag(r, loften, nu));
  const provningar = forslag.map((f) => skapaSakprovning(byggRubrikunderlag(f, loften, indata.material[f.rad.id] ?? [], forslag.filter((andra) => andra.rad.id !== f.rad.id))));
  const nya = loften.map((p) => forslag.find((f) => f.rad.id === p.id)?.nyttLofte ?? p);
  const datum = svenskDag(nu);
  const rattelser = [...lista(fore, "rattelser.json"), {
    date: datum, affects: `Löftessidorna för ${indata.rader.map((r) => r.id).join(", ")}`,
    what: forslag.map((f) => `Rubriken «${f.tidigareLofte.title}» är utbytt mot «${f.nyttLofte.title}» — ${f.rad.skal.replace(/\.?$/u, ".")}`).join(" "),
    why: indata.varfor, orsak: indata.orsak, commit: "0000000",
  }];
  const changelog = [...lista(fore, "changelog.json"), {
    run_id: `rubrik-byt-${datum}`, added: [], updated: indata.rader.map((r) => r.id), retracted: [],
    data_hash: computeDataHash(nya), timestamp: nu.toISOString(),
  }];
  const json = (v: unknown): string => JSON.stringify(v, null, 2) + "\n";
  return { version: "rubrikpaket/1", tidpunkt: nu.toISOString(), indata: structuredClone(indata), forslag, provningar,
    filer: skapaFilpaket(fore, { "promises.json": json(nya), "rattelser.json": json(rattelser), "changelog.json": json(changelog) }) };
}
/** Strukturell kontroll; styrker varken källornas sanning eller beslutarens identitet. */
export function kontrolleraRubrikpaket(p: Rubrikpaket, aktuellt: Fillage): void {
  if (kanoniskJson(p.filer.fore) !== kanoniskJson(aktuellt)) throw new Error("Paketets föreläge har ändrats");
  const nytt = forberedRubrikpaket(p.indata, aktuellt, new Date(p.tidpunkt));
  if (kanoniskJson({ ...p, provningar: nytt.provningar }) !== kanoniskJson(nytt)) throw new Error("Paketets slutform eller format har ändrats");
  if (p.provningar.length !== nytt.provningar.length) throw new Error("Prövning saknas eller är dubblerad");
  p.provningar.forEach((provning, i) => {
    const prov = sakprovningsBeredskap(provning, nytt.provningar[i]!.underlag);
    if (!prov.klar) throw new Error(`Sakprövningen är inte klar: ${prov.hinder.join("; ")}`);
  });
}
export function verkstallRubrikpaket(dir: string, p: Rubrikpaket, beslutetsHash: string): void {
  if (!/^[0-9a-f]{64}$/u.test(beslutetsHash) || rubrikpakethash(p) !== beslutetsHash) throw new Error("Beslutet gäller inte hela paketet");
  kontrolleraRubrikpaket(p, lasFillage(dir, RUBRIKFILER));
  skrivFilpaket(dir, p.filer);
}
