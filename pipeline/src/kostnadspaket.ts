import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { skapaFilpaket, type Fillage, type Filpaket } from "./datatransaktion.ts";
import { forberedKostnadsforslag, type FrystKostnadsforslag } from "./kostnadsforslag.ts";
import { byggKostnadsunderlag, skapaSakprovning, sakprovningsBeredskap, type Sakprovning, type Sakreferens } from "./sakprovning.ts";
import { ORSAKKODER, type Orsakkod } from "./orsakkoder.ts";
import { computeDataHash } from "./publish.ts";
import { kanon, type Provning } from "./provningar.ts";
import { svenskDag } from "./dagen.ts";
import type { Kostnadsrad } from "./kostnadsforslag.ts";
import type { PromiseEntry } from "./loftesforslag.ts";

export const KOSTNADSVAGAR = {
  "promises.json": "data/promises.json", "rattelser.json": "data/rattelser.json",
  "changelog.json": "data/changelog.json", "provningar.json": "data/provningar.json",
  "provningsskulden.json": "pipeline/facit/provningsskulden.json",
} as const;
export const KOSTNADSFILER = Object.keys(KOSTNADSVAGAR) as (keyof typeof KOSTNADSVAGAR)[];
export interface Kostnadsindata { rader: Kostnadsrad[]; material: Record<string, Sakreferens[]>; varfor: string; orsak: Orsakkod; sakexport?: Provning[] }
export interface Kostnadspaket {
  version: "kostnadspaket/1";
  tidpunkt: string;
  indata: Kostnadsindata;
  forslag: FrystKostnadsforslag[];
  provningar: Sakprovning[];
  filer: Filpaket;
}
export function kostnadspakethash(p: Kostnadspaket): string {
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
export function forberedKostnadspaket(indata: Kostnadsindata, fore: Fillage, nu: Date): Kostnadspaket {
  if (Object.keys(fore).sort().join() !== [...KOSTNADSFILER].sort().join()) throw new Error("Fel filuppsättning");
  if (!indata.rader.length || new Set(indata.rader.map((r) => r.id)).size !== indata.rader.length) throw new Error("Tom eller dubblerad ändringslista");
  if (!indata.varfor?.trim() || !ORSAKKODER.includes(indata.orsak)) throw new Error("Rättelsen kräver skäl och giltig orsak");
  if (Object.keys(indata.material).some((id) => !indata.rader.some((r) => r.id === id))) throw new Error("Referenser för okänt mål");
  const loften = lista(fore, "promises.json") as PromiseEntry[];
  const forslag = indata.rader.map((r) => forberedKostnadsforslag(r, loften, indata.material[r.id] ?? [], nu));
  const provningar = forslag.map((f) => skapaSakprovning(byggKostnadsunderlag(f, loften, indata.material[f.rad.id] ?? [], forslag.filter((andra) => andra.rad.id !== f.rad.id))));
  const nya = loften.map((p) => forslag.find((f) => f.rad.id === p.id)?.nyttLofte ?? p);
  // Exporten bereds separat mot den faktiska slutformen. Den är ett förslag,
  // inte en attest; den tioledade sakgrinden nedan gäller fortfarande.
  const index = JSON.parse(fore["provningar.json"]!);
  const skuld = JSON.parse(fore["provningsskulden.json"]!);
  if (!index || !Array.isArray(index.poster) || new Set(index.poster.map((r: Provning) => r.id)).size !== index.poster.length ||
      !skuld || !Array.isArray(skuld.ids) || skuld.count !== skuld.ids.length || new Set(skuld.ids).size !== skuld.ids.length) throw new Error("Ogiltigt prövningsregister eller skuldfacit");
  const sakexport = indata.sakexport ?? [];
  if (!Array.isArray(sakexport) || new Set(sakexport.map(r => r.id)).size !== sakexport.length) throw new Error("Sakexport är dubblerad eller har ogiltigt format");
  for (const r of sakexport) {
    const f = forslag.find(f => f.rad.id === r.id);
    if (!f || Object.keys(r).sort().join(",") !== "datum,id,slag,underlag_hash,utfall" || r.slag !== "lofte" ||
        !["haller", "haller-med-forbehall"].includes(r.utfall) || !/^\d{4}-\d{2}-\d{2}$/.test(r.datum) || !Number.isFinite(Date.parse(r.datum+"T00:00:00Z")) || new Date(r.datum+"T00:00:00Z").toISOString().slice(0,10)!==r.datum ||
        r.underlag_hash !== kanon("lofte", f.nyttLofte as unknown as Record<string, unknown>)) throw new Error("Sakexport saknas, har fel omfattning eller beskriver en annan slutform");
  }
  const exportIndex = new Map(sakexport.map(r => [r.id, r]));
  const gamlaIds = new Set(index.poster.map((r: Provning) => r.id));
  const nyttIndex = { ...index, poster: [...index.poster.map((r: Provning) => exportIndex.get(r.id) ?? r), ...sakexport.filter(r => !gamlaIds.has(r.id))] };
  const nyaSkuldIds = skuld.ids.filter((id: string) => !sakexport.some(r => id === `lofte:${r.id}`));
  const nySkuld = {...skuld, count: nyaSkuldIds.length, ids: nyaSkuldIds};
  const datum = svenskDag(nu);
  const rattelser = [...lista(fore, "rattelser.json"), {
    date: datum, affects: `Löftessidorna för ${indata.rader.map((r) => r.id).join(", ")}`,
    what: `${forslag.length} löften har fått kostnad och härledning omprövade. ` + forslag.map((f) => (f.nyttLofte.history.at(-1) as {change: string}).change.replace(/\.?$/u, ".")).join(" "),
    why: indata.varfor, orsak: indata.orsak, commit: "0000000",
  }];
  const changelog = [...lista(fore, "changelog.json"), {
    run_id: `kostnad-byt-${datum}`, added: [], updated: indata.rader.map((r) => r.id), retracted: [],
    data_hash: computeDataHash(nya), timestamp: nu.toISOString(),
  }];
  const json = (v: unknown): string => JSON.stringify(v, null, 2) + "\n";
  return { version: "kostnadspaket/1", tidpunkt: nu.toISOString(), indata: structuredClone(indata), forslag, provningar,
    filer: skapaFilpaket(fore, { "promises.json": json(nya), "rattelser.json": json(rattelser), "changelog.json": json(changelog),
      "provningar.json": sakexport.length ? JSON.stringify(nyttIndex, null, 1) + "\n" : fore["provningar.json"]!,
      "provningsskulden.json": nyaSkuldIds.length !== skuld.ids.length ? json(nySkuld) : fore["provningsskulden.json"]!,
    }) };
}
/** Strukturell kontroll; styrker varken källornas sanning eller beslutarens identitet. */
export function kontrolleraKostnadspaket(p: Kostnadspaket, aktuellt: Fillage): void {
  if (kanoniskJson(p.filer.fore) !== kanoniskJson(aktuellt)) throw new Error("Paketets föreläge har ändrats");
  const nytt = forberedKostnadspaket(p.indata, aktuellt, new Date(p.tidpunkt));
  if (kanoniskJson({ ...p, provningar: nytt.provningar }) !== kanoniskJson(nytt)) throw new Error("Paketets slutform eller format har ändrats");
  if (p.provningar.length !== nytt.provningar.length) throw new Error("Prövning saknas eller är dubblerad");
  p.provningar.forEach((provning, i) => {
    const prov = sakprovningsBeredskap(provning, nytt.provningar[i]!.underlag);
    if (!prov.klar) throw new Error(`Sakprövningen är inte klar: ${prov.hinder.join("; ")}`);
  });
  if (p.indata.sakexport?.length !== p.forslag.length) throw new Error("Sakexport saknas för ett eller flera kostnadsförslag");
}
