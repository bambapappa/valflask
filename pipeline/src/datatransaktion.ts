import { readFileSync, writeFileSync, openSync, closeSync, fsyncSync, lstatSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { taLaset, taAterstallningslas, TRANSAKTION } from "./datalas.ts";

export type Fillage = Record<string, string | null>;
export interface Filpaket { version: "filpaket/1"; fore: Fillage; efter: Fillage; hash: string }
function hash(v: unknown): string { return createHash("sha256").update(kanoniskJson(v)).digest("hex"); }
function kontrolleraNamn(namn: string): void {
  if (!/^[a-z][a-z0-9_-]*\.json$/u.test(namn)) throw new Error("Otillåtet filnamn i filpaket");
}
export function lasFillage(dir: string, namn: readonly string[]): Fillage {
  return Object.fromEntries(namn.map((n) => {
    kontrolleraNamn(n);
    try {
      if (!lstatSync(join(dir, n)).isFile()) throw new Error(`Inte en vanlig fil: ${n}`);
      return [n, readFileSync(join(dir, n), "utf8")];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [n, null];
      throw error;
    }
  }));
}
export function skapaFilpaket(fore: Fillage, efter: Fillage): Filpaket {
  const a = Object.keys(fore).sort(), b = Object.keys(efter).sort();
  if (a.length === 0 || kanoniskJson(a) !== kanoniskJson(b)) throw new Error("Filpaketet kräver samma icke-tomma filuppsättning före och efter");
  for (const n of a) {
    kontrolleraNamn(n);
    for (const v of [fore[n], efter[n]]) if (v !== null && typeof v !== "string") throw new Error("Ogiltigt filinnehåll");
  }
  const payload = { version: "filpaket/1" as const, fore: structuredClone(fore), efter: structuredClone(efter) };
  return { ...payload, hash: hash(payload) };
}
function kontrollera(p: Filpaket): Filpaket {
  const nytt = skapaFilpaket(p.fore, p.efter);
  if (p.version !== nytt.version || p.hash !== nytt.hash || kanoniskJson(p) !== kanoniskJson(nytt)) throw new Error("Filpaketet har ändrats");
  return nytt;
}
function sync(vag: string): void {
  const fd = openSync(vag, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function skriv(dir: string, journal: string, lage: Fillage): void {
  for (const [n, text] of Object.entries(lage)) {
    const mal = join(dir, n);
    if (text === null) rmSync(mal, { force: true });
    else {
      const tmp = join(journal, "skriv.tmp");
      writeFileSync(tmp, text, { mode: 0o600 });
      sync(tmp);
      renameSync(tmp, mal);
    }
    sync(dir);
  }
}
function kontrolleraAterstallning(dir: string, p: Filpaket): void {
  const nu = lasFillage(dir, Object.keys(p.fore));
  for (const n of Object.keys(nu)) {
    if (nu[n] !== p.fore[n] && nu[n] !== p.efter[n]) throw new Error(`Återställning stoppad: ${n} har ändrats utanför transaktionen`);
  }
}
function stada(dir: string, journal: string): void { rmSync(journal, { recursive: true }); sync(dir); }

/** Journalen spärrar nästa skrivare om processen avbryts mellan filerna. */
export function skrivFilpaket(dir: string, indata: Filpaket): void {
  const p = kontrollera(indata);
  const slapp = taLaset(dir, "filpaket");
  const journal = join(dir, TRANSAKTION);
  try {
    if (kanoniskJson(lasFillage(dir, Object.keys(p.fore))) !== kanoniskJson(p.fore)) throw new Error("Filpaketets föreläge har ändrats");
    mkdirSync(journal, { mode: 0o700 });
    const fil = join(journal, "paket.json");
    writeFileSync(fil, JSON.stringify(p), { flag: "wx", mode: 0o600 });
    sync(fil); sync(journal); sync(dir);
    try {
      skriv(dir, journal, p.efter);
    } catch (error) {
      kontrolleraAterstallning(dir, p);
      skriv(dir, journal, p.fore);
      stada(dir, journal);
      throw error;
    }
    stada(dir, journal);
  } finally { slapp(); }
}

/** Återgår till journalens före-version, även efter ett delvis färdigt paket. */
export function aterstallFilpaket(dir: string): void {
  const slapp = taAterstallningslas(dir);
  const journal = join(dir, TRANSAKTION);
  try {
    const p = kontrollera(JSON.parse(readFileSync(join(journal, "paket.json"), "utf8")) as Filpaket);
    kontrolleraAterstallning(dir, p);
    skriv(dir, journal, p.fore);
    stada(dir, journal);
  } finally { slapp(); }
}
