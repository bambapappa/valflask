/** Journalför löften, ändringslogg, rättelser och det frysta ankarfacit tillsammans. */
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { skapaFilpaket, lasFillage, type Fillage, type Filpaket } from "./datatransaktion.ts";
import { taAterstallningslas, taLaset, TRANSAKTION } from "./datalas.ts";

export const ANKARSKULDFILER = ["promises.json", "changelog.json", "rattelser.json"] as const;
export interface Ankarskuldpaket {
  version: "ankarskuldpaket/1";
  data: Filpaket;
  facitFore: string;
  facitEfter: string;
  partierFore: string;
  hash: string;
}

const facitvag = (dataDir: string) => join(dirname(dataDir), "pipeline/facit/ankarskulden.json");
const digest = (value: unknown) => createHash("sha256").update(kanoniskJson(value)).digest("hex");
function synka(path: string): void {
  const fd = openSync(path, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function lasFacit(dataDir: string): string {
  const path = facitvag(dataDir);
  if (!lstatSync(path).isFile()) throw new Error("Ankarfacit är inte en vanlig fil");
  return readFileSync(path, "utf8");
}
function validera(paket: Ankarskuldpaket): void {
  const namn = [...ANKARSKULDFILER].sort().join();
  if (Object.keys(paket.data.fore).sort().join() !== namn || Object.keys(paket.data.efter).sort().join() !== namn) {
    throw new Error("Ankarskuldpaketet kräver exakt tre datafiler");
  }
  const data = skapaFilpaket(paket.data.fore, paket.data.efter);
  if (kanoniskJson(data) !== kanoniskJson(paket.data)) throw new Error("Datadelen har ändrats");
  for (const n of ANKARSKULDFILER) {
    if (typeof paket.data.fore[n] !== "string" || typeof paket.data.efter[n] !== "string") {
      throw new Error(`Ankarfil saknas: ${n}`);
    }
  }
  const fore = JSON.parse(paket.facitFore) as { ids?: unknown; count?: unknown };
  const efter = JSON.parse(paket.facitEfter) as { ids?: unknown; count?: unknown };
  if (!Array.isArray(JSON.parse(paket.partierFore))) throw new Error("Partiregistret kräver en lista");
  for (const facit of [fore, efter]) {
    if (!Array.isArray(facit.ids) || !facit.ids.every((id) => typeof id === "string") || facit.count !== facit.ids.length) {
      throw new Error("Ankarfacit har ogiltig skuldlista");
    }
  }
  const foreIds = fore.ids as string[];
  const efterIds = efter.ids as string[];
  if (efterIds.length > foreIds.length || efterIds.some((id) => !foreIds.includes(id))) {
    throw new Error("Den frysta ankarskulden får bara krympa");
  }
  const { hash, ...payload } = paket;
  if (paket.version !== "ankarskuldpaket/1" || digest(payload) !== hash) throw new Error("Ankarskuldpaketet har ändrats");
}
export function skapaAnkarskuldpaket(fore: Fillage, efter: Fillage, facitFore: string, facitEfter: string, partierFore: string): Ankarskuldpaket {
  const payload = { version: "ankarskuldpaket/1" as const, data: skapaFilpaket(fore, efter), facitFore, facitEfter, partierFore };
  const paket = { ...payload, hash: digest(payload) };
  validera(paket);
  return paket;
}
export function lasAnkarskuldslage(dataDir: string): { data: Fillage; facit: string; partier: string } {
  const partierPath = join(dataDir, "parties.json");
  if (!lstatSync(partierPath).isFile()) throw new Error("Partiregistret är inte en vanlig fil");
  return { data: lasFillage(dataDir, ANKARSKULDFILER), facit: lasFacit(dataDir), partier: readFileSync(partierPath, "utf8") };
}
function samma(a: Fillage, b: Fillage): boolean { return kanoniskJson(a) === kanoniskJson(b); }
function kontrolleraFore(dataDir: string, p: Ankarskuldpaket): void {
  const lage = lasAnkarskuldslage(dataDir);
  if (!samma(lage.data, p.data.fore) || lage.facit !== p.facitFore || lage.partier !== p.partierFore) throw new Error("Ankarskuldpaketets föreläge har ändrats");
}
function kontrolleraAterstallning(dataDir: string, p: Ankarskuldpaket): void {
  const lage = lasAnkarskuldslage(dataDir);
  for (const n of ANKARSKULDFILER) {
    if (lage.data[n] !== p.data.fore[n] && lage.data[n] !== p.data.efter[n]) {
      throw new Error(`Återställning stoppad: ${n} har ändrats utanför transaktionen`);
    }
  }
  if (lage.facit !== p.facitFore && lage.facit !== p.facitEfter) {
    throw new Error("Återställning stoppad: ankarfacit har ändrats utanför transaktionen");
  }
}
function skrivEn(path: string, content: string, journal: string): void {
  const tmp = join(journal, "skriv.tmp");
  writeFileSync(tmp, content, { mode: 0o600 }); synka(tmp);
  renameSync(tmp, path); synka(dirname(path));
}
function skrivLage(dataDir: string, p: Ankarskuldpaket, lage: "fore" | "efter", journal: string): void {
  for (const n of ANKARSKULDFILER) {
    const text = p.data[lage][n];
    if (typeof text !== "string") throw new Error(`Ankarfil saknas: ${n}`);
    skrivEn(join(dataDir, n), text, journal);
  }
  skrivEn(facitvag(dataDir), lage === "fore" ? p.facitFore : p.facitEfter, journal);
}
function stada(dataDir: string, journal: string): void { rmSync(journal, { recursive: true }); synka(dataDir); }

export function skrivAnkarskuldpaket(dataDir: string, p: Ankarskuldpaket): void {
  validera(p);
  const slapp = taLaset(dataDir, "ankarskuldpaket");
  const journal = join(dataDir, TRANSAKTION);
  try {
    kontrolleraFore(dataDir, p);
    mkdirSync(journal, { mode: 0o700 });
    const fil = join(journal, "paket.json");
    writeFileSync(fil, JSON.stringify(p), { flag: "wx", mode: 0o600 });
    synka(fil); synka(journal); synka(dataDir);
    try { skrivLage(dataDir, p, "efter", journal); }
    catch (error) {
      kontrolleraAterstallning(dataDir, p);
      skrivLage(dataDir, p, "fore", journal);
      stada(dataDir, journal);
      throw error;
    }
    stada(dataDir, journal);
  } finally { slapp(); }
}

export function aterstallAnkarskuldpaket(dataDir: string): void {
  const slapp = taAterstallningslas(dataDir);
  const journal = join(dataDir, TRANSAKTION);
  try {
    const p = JSON.parse(readFileSync(join(journal, "paket.json"), "utf8")) as Ankarskuldpaket;
    validera(p);
    kontrolleraAterstallning(dataDir, p);
    skrivLage(dataDir, p, "fore", journal);
    stada(dataDir, journal);
  } finally { slapp(); }
}
