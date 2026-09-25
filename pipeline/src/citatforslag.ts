import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { svenskDag } from "./dagen.ts";
import { provaByte, bytCitat, type Byte } from "./citatbyte.ts";
import type { PromiseEntry } from "./loftesforslag.ts";

export interface Citatkalla { url: string; text: string; hamtad: string }
export interface FrystCitatforslag {
  version: "citatforslag/1";
  fore: { loften: string };
  tidpunkt: string;
  rad: Byte;
  kalla: Citatkalla;
  tidigareLofte: PromiseEntry;
  nyttLofte: PromiseEntry;
  hash: string;
}
function hash(v: unknown): string { return createHash("sha256").update(kanoniskJson(v)).digest("hex"); }
export const kallbas = (url: string): string => url.replace(/#.*$/u, "");

/** Källbyten får inte byta avsändare; talade källor kräver en separat avskrift. */
export function citatadress(rad: Byte, lofte: PromiseEntry): string {
  const gammal = new URL(lofte.source.url), ny = new URL(rad.kalla ?? lofte.source.url);
  if (rad.kalla && (ny.protocol !== "https:" || ny.hostname.replace(/^www\./u, "") !== gammal.hostname.replace(/^www\./u, ""))) throw new Error("Ny källa måste ha https och samma värdnamn");
  if (!["http:", "https:"].includes(ny.protocol)) throw new Error("Källan måste vara en webbadress");
  if (/(^|\.)(youtube\.com|youtu\.be)$/u.test(ny.hostname) || (/(^|\.)svtplay\.se$/u.test(ny.hostname) && ny.pathname.startsWith("/video"))) throw new Error("Talad källa kräver avskrift med tidsstämpel");
  return kallbas(ny.href);
}
/** Fryser hämtad källtext, citat och historik för separat sakprövning. */
export function forberedCitatforslag(rad: Byte, loften: PromiseEntry[], kalla: Citatkalla, nu: Date): FrystCitatforslag {
  if (!loften.length || new Set(loften.map(p => p.id)).size !== loften.length) throw new Error("Tomt eller dubblerat löftesbestånd");
  const tidigare = loften.find(p => p.id === rad.id);
  if (!tidigare || tidigare.status !== "aktiv") throw new Error("Målet saknas eller är inte aktivt");
  const url = citatadress(rad, tidigare);
  if (kalla.url !== url || !kalla.text.trim() || !Number.isFinite(Date.parse(kalla.hamtad)) || Date.parse(kalla.hamtad) > nu.getTime()) throw new Error("Källtext, adress eller hämtningstid stämmer inte");
  const host = new URL(url).hostname.replace(/^www\./u, "");
  const egen = /^(socialdemokraterna|moderaterna|sverigedemokraterna|centerpartiet|vansterpartiet|kristdemokraterna|liberalerna|mp)\.(se|nu)$/u.test(host);
  const prov = provaByte(rad, tidigare.quote, kalla.text, egen);
  if (!prov.ok) throw new Error(prov.skal.join("; "));
  const nytt = bytCitat(tidigare, rad, svenskDag(nu), nu.toISOString());
  const payload = { version: "citatforslag/1" as const, fore: { loften: hash(loften) }, tidpunkt: nu.toISOString(), rad: structuredClone(rad), kalla: structuredClone(kalla), tidigareLofte: structuredClone(tidigare), nyttLofte: structuredClone(nytt) };
  return { ...payload, hash: hash(payload) };
}
export function tillampaCitatforslag(f: FrystCitatforslag, loften: PromiseEntry[], forvantadHash: string): PromiseEntry[] {
  const { hash: sparad, ...payload } = f;
  if (f.version !== "citatforslag/1" || hash(payload) !== sparad || sparad !== forvantadHash) throw new Error("Citatförslaget har ändrats");
  if (forberedCitatforslag(f.rad, loften, f.kalla, new Date(f.tidpunkt)).hash !== sparad) throw new Error("Citatförslagets föreläge eller slutform har ändrats");
  return structuredClone(loften.map(p => p.id === f.nyttLofte.id ? f.nyttLofte : p));
}
