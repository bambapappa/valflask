import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { skapaFilpaket, lasFillage, skrivFilpaket, type Fillage, type Filpaket } from "./datatransaktion.ts";
import { forberedIndragningsforslag, type FrystIndragningsforslag } from "./indragningsforslag.ts";
import { byggIndragningsunderlag, skapaSakprovning, sakprovningsBeredskap, type Sakprovning, type Sakreferens } from "./sakprovning.ts";
import { ORSAKKODER, type Orsakkod } from "./orsakkoder.ts";
import { computeDataHash } from "./publish.ts";
import { svenskDag } from "./dagen.ts";
import { avvisningarForIndragna, grupperSomByterBarare, rattelsePost, type Indragningsrad } from "./indragning.ts";
import { beroendeAv, type Ankarlofte } from "./ankaren.ts";
import { avvisa, type Avvisning } from "./avvisningar.ts";
import { readFileSync } from "node:fs";
const summeringsfil = new URL("../../site/src/lib/aggregates.ts", import.meta.url);
const berakningshash = createHash("sha256").update(readFileSync(summeringsfil)).digest("hex");
const aggregates = await import(summeringsfil.href) as {
  totalFlasket: (p: unknown[]) => number;
  partyTotalMsek: (p: unknown[], parti: string) => number;
  dedupeByGroup: (p: unknown[]) => { id: string; group_id?: string | null }[];
};
import type { PromiseEntry } from "./loftesforslag.ts";

export const INDRAGNINGSFILER = ["promises.json", "rattelser.json", "changelog.json", "avvisade.json"] as const;
export interface Indragningsindata { rader: Indragningsrad[]; material: Record<string, Sakreferens[]>; varfor: string; orsak: Orsakkod }
export interface Indragningspaket {
  version: "indragningspaket/1";
  tidpunkt: string;
  indata: Indragningsindata;
  forslag: FrystIndragningsforslag[];
  provningar: Sakprovning[];
  konsekvenser: { berakningshash: string; partier: [string, number][]; riket: number; grupperSomBytteBarare: string[]; ankrare: ReturnType<typeof beroendeAv>; utanAvvisningsminne: string[] };
  filer: Filpaket;
}
export function indragningspakethash(p: Indragningspaket): string {
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
export function forberedIndragningspaket(indata: Indragningsindata, fore: Fillage, nu: Date): Indragningspaket {
  if (Object.keys(fore).sort().join() !== [...INDRAGNINGSFILER].sort().join()) throw new Error("Fel filuppsättning");
  if (!indata.rader.length || new Set(indata.rader.map((r) => r.id)).size !== indata.rader.length) throw new Error("Tom eller dubblerad ändringslista");
  if (!indata.varfor?.trim() || !ORSAKKODER.includes(indata.orsak)) throw new Error("Rättelsen kräver skäl och giltig orsak");
  if (Object.keys(indata.material).some((id) => !indata.rader.some((r) => r.id === id))) throw new Error("Referenser för okänt mål");
  const loften = lista(fore, "promises.json") as PromiseEntry[];
  const forslag = indata.rader.map((r) => forberedIndragningsforslag(r, loften, nu));
  const provningar = forslag.map((f) => skapaSakprovning(byggIndragningsunderlag(f, loften, indata.material[f.rad.id] ?? [], forslag.filter((andra) => andra.rad.id !== f.rad.id))));
  const nya = loften.map((p) => forslag.find((f) => f.rad.id === p.id)?.nyttLofte ?? p);
  const datum = svenskDag(nu);
  const partier = [...new Set(forslag.flatMap(f => f.tidigareLofte.parties))].sort().map(parti => [parti, aggregates.partyTotalMsek(loften, parti) - aggregates.partyTotalMsek(nya, parti)] as [string, number]).filter(([, delta]) => delta !== 0);
  const riket = aggregates.totalFlasket(loften) - aggregates.totalFlasket(nya);
  if (![riket, ...partier.map(([, delta]) => delta)].every(Number.isFinite)) throw new Error("Summeringen gav ogiltiga belopp");
  const drasIn = new Set(indata.rader.map(r => r.id));
  const barare = new Map(aggregates.dedupeByGroup(loften.filter(p => p.status === "aktiv")).filter(p => p.group_id).map(p => [p.group_id!, p.id]));
  const grupperSomBytteBarare = grupperSomByterBarare(loften, drasIn, barare);
  const minnesposter = avvisningarForIndragna(loften, indata.rader);
  let minne = fore["avvisade.json"] === null ? [] : lista(fore, "avvisade.json") as Avvisning[];
  for (const m of minnesposter) minne = avvisa(minne, m.url, m.citat, m.skal, datum);
  const konsekvenser = { berakningshash, partier, riket, grupperSomBytteBarare, ankrare: beroendeAv(loften as unknown as Ankarlofte[], [...drasIn]), utanAvvisningsminne: forslag.filter(f => !f.tidigareLofte.source.url.trim() || !f.tidigareLofte.quote.trim()).map(f => f.rad.id) };
  const post = rattelsePost(forslag.map(f => ({ lofte: f.tidigareLofte, skal: f.rad.skal })), datum, { partier: new Map(partier), riket, grupperSomBytteBarare }, indata.orsak);
  post.why += " " + indata.varfor;
  const rattelser = [...lista(fore, "rattelser.json"), post];
  const changelog = [...lista(fore, "changelog.json"), {
    run_id: `lofte-dra-in-${datum}`, added: [], updated: [], retracted: indata.rader.map((r) => r.id),
    data_hash: computeDataHash(nya), timestamp: nu.toISOString(),
  }];
  const json = (v: unknown): string => JSON.stringify(v, null, 2) + "\n";
  return { version: "indragningspaket/1", tidpunkt: nu.toISOString(), indata: structuredClone(indata), forslag, provningar, konsekvenser,
    filer: skapaFilpaket(fore, { "promises.json": json(nya), "rattelser.json": json(rattelser), "changelog.json": json(changelog), "avvisade.json": json(minne) }) };
}
/** Strukturell kontroll; styrker varken källornas sanning eller beslutarens identitet. */
export function kontrolleraIndragningspaket(p: Indragningspaket, aktuellt: Fillage): void {
  if (kanoniskJson(p.filer.fore) !== kanoniskJson(aktuellt)) throw new Error("Paketets föreläge har ändrats");
  const nytt = forberedIndragningspaket(p.indata, aktuellt, new Date(p.tidpunkt));
  if (kanoniskJson({ ...p, provningar: nytt.provningar }) !== kanoniskJson(nytt)) throw new Error("Paketets slutform eller format har ändrats");
  if (p.provningar.length !== nytt.provningar.length) throw new Error("Prövning saknas eller är dubblerad");
  p.provningar.forEach((provning, i) => {
    const prov = sakprovningsBeredskap(provning, nytt.provningar[i]!.underlag);
    if (!prov.klar) throw new Error(`Sakprövningen är inte klar: ${prov.hinder.join("; ")}`);
  });
}
export function verkstallIndragningspaket(dir: string, p: Indragningspaket, beslutetsHash: string): void {
  if (!/^[0-9a-f]{64}$/u.test(beslutetsHash) || indragningspakethash(p) !== beslutetsHash) throw new Error("Beslutet gäller inte hela paketet");
  kontrolleraIndragningspaket(p, lasFillage(dir, INDRAGNINGSFILER));
  skrivFilpaket(dir, p.filer);
}
