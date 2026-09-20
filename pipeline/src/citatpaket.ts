import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { skapaFilpaket, lasFillage, skrivFilpaket, type Fillage, type Filpaket } from "./datatransaktion.ts";
import { forberedCitatforslag, type FrystCitatforslag } from "./citatforslag.ts";
import { byggCitatunderlag, skapaSakprovning, sakprovningsBeredskap, type Sakprovning, type Sakreferens } from "./sakprovning.ts";
import { ORSAKKODER, type Orsakkod } from "./orsakkoder.ts";
import { computeDataHash } from "./publish.ts";
import { svenskDag } from "./dagen.ts";
import { rattelsePost, type Byte } from "./citatbyte.ts";
import { normalizeForVerbatim } from "./gates.ts";
import { citatadress, type Citatkalla } from "./citatforslag.ts";
import type { PromiseEntry } from "./loftesforslag.ts";

export const CITATFILER = ["promises.json", "rattelser.json", "changelog.json"] as const;
export interface Citatindata { rader: Byte[]; material: Record<string, Sakreferens[]>; varfor: string; orsak: Orsakkod }
export interface Citatpaket {
  version: "citatpaket/1";
  tidpunkt: string;
  indata: Citatindata;
  kallor: Citatkalla[];
  forslag: FrystCitatforslag[];
  provningar: Sakprovning[];
  filer: Filpaket;
}
export function citatpakethash(p: Citatpaket): string {
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
export function forberedCitatpaket(indata: Citatindata, fore: Fillage, nu: Date, kallor: Citatkalla[]): Citatpaket {
  if (Object.keys(fore).sort().join() !== [...CITATFILER].sort().join()) throw new Error("Fel filuppsättning");
  if (!indata.rader.length || new Set(indata.rader.map((r) => r.id)).size !== indata.rader.length) throw new Error("Tom eller dubblerad ändringslista");
  if (!indata.varfor?.trim() || !ORSAKKODER.includes(indata.orsak)) throw new Error("Rättelsen kräver skäl och giltig orsak");
  if (Object.keys(indata.material).some((id) => !indata.rader.some((r) => r.id === id))) throw new Error("Referenser för okänt mål");
  const loften = lista(fore, "promises.json") as PromiseEntry[];
  if (new Set(kallor.map(k => k.url)).size !== kallor.length) throw new Error("Dubblerad källa");
  const forslag = indata.rader.map(r => {
    const lofte = loften.find(p => p.id === r.id);
    if (!lofte) throw new Error("Målet saknas");
    const kalla = kallor.find(k => k.url === citatadress(r, lofte));
    if (!kalla) throw new Error("Källtext saknas");
    return forberedCitatforslag(r, loften, kalla, nu);
  });
  if (kallor.some(k => !forslag.some(f => f.kalla.url === k.url))) throw new Error("Källa utan mål");
  const provningar = forslag.map((f) => skapaSakprovning(byggCitatunderlag(f, loften, indata.material[f.rad.id] ?? [], forslag.filter((andra) => andra.rad.id !== f.rad.id))));
  const nya = loften.map((p) => forslag.find((f) => f.rad.id === p.id)?.nyttLofte ?? p);
  const datum = svenskDag(nu);
  const post = rattelsePost(forslag.map(f => ({ lofte: f.tidigareLofte, byte: f.rad, gammaltCitatSaknasIKallan: !normalizeForVerbatim(f.kalla.text).includes(normalizeForVerbatim(f.tidigareLofte.quote)) })), datum, indata.orsak);
  post.why += " " + indata.varfor;
  const rattelser = [...lista(fore, "rattelser.json"), post];
  const changelog = [...lista(fore, "changelog.json"), {
    run_id: `citat-byt-${datum}`, added: [], updated: indata.rader.map((r) => r.id), retracted: [],
    data_hash: computeDataHash(nya), timestamp: nu.toISOString(),
  }];
  const json = (v: unknown): string => JSON.stringify(v, null, 2) + "\n";
  return { version: "citatpaket/1", tidpunkt: nu.toISOString(), indata: structuredClone(indata), kallor: structuredClone(kallor), forslag, provningar,
    filer: skapaFilpaket(fore, { "promises.json": json(nya), "rattelser.json": json(rattelser), "changelog.json": json(changelog) }) };
}
/** Strukturell kontroll; styrker varken källornas sanning eller beslutarens identitet. */
export function kontrolleraCitatpaket(p: Citatpaket, aktuellt: Fillage): void {
  if (kanoniskJson(p.filer.fore) !== kanoniskJson(aktuellt)) throw new Error("Paketets föreläge har ändrats");
  const nytt = forberedCitatpaket(p.indata, aktuellt, new Date(p.tidpunkt), p.kallor);
  if (kanoniskJson({ ...p, provningar: nytt.provningar }) !== kanoniskJson(nytt)) throw new Error("Paketets slutform eller format har ändrats");
  if (p.provningar.length !== nytt.provningar.length) throw new Error("Prövning saknas eller är dubblerad");
  p.provningar.forEach((provning, i) => {
    const prov = sakprovningsBeredskap(provning, nytt.provningar[i]!.underlag);
    if (!prov.klar) throw new Error(`Sakprövningen är inte klar: ${prov.hinder.join("; ")}`);
  });
}
export function verkstallCitatpaket(dir: string, p: Citatpaket, beslutetsHash: string): void {
  if (!/^[0-9a-f]{64}$/u.test(beslutetsHash) || citatpakethash(p) !== beslutetsHash) throw new Error("Beslutet gäller inte hela paketet");
  kontrolleraCitatpaket(p, lasFillage(dir, CITATFILER));
  skrivFilpaket(dir, p.filer);
}
