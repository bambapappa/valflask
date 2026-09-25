/** Förbereder och verkställer ett exakt, separat beslutat godkännandepaket. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { taLaset } from "../src/datalas.ts";
import {
  forberedGodkannandepaket,
  godkannandepakethash,
  kontrolleraGodkannandepaket,
  verkstallGodkannandepaket,
  type Godkannandepaket,
} from "../src/godkannandepaket.ts";
import type { Listgodkannande } from "../src/godkannandelista.ts";

const DATA = join(import.meta.dirname, "../../data");
const [kommando, fil, argument, skriv, ...extra] = process.argv.slice(2);
const las = <T,>(vag: string): T => JSON.parse(readFileSync(vag, "utf8")) as T;

if (extra.length || !fil) {
  throw new Error("Använd godkann-paket forbered <inbäddade-rader.json> <privat-paket.json>, kontroll <paket.json>, eller verkstall <paket.json> <beslutets pakethash> --skriv");
}

if (kommando === "forbered" && argument && !skriv) {
  const slapp = taLaset(DATA, "förbered godkännandepaket");
  try {
    const paket = forberedGodkannandepaket(las<Listgodkannande[]>(fil), DATA, new Date());
    writeFileSync(argument, JSON.stringify(paket, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log("Privat godkännandepaket sparat. Separat mänskligt beslut av paketets hash saknas ännu.");
  } finally {
    slapp();
  }
} else if (kommando === "kontroll" && !argument && !skriv) {
  const slapp = taLaset(DATA, "kontrollera godkännandepaket");
  try {
    const paket = las<Godkannandepaket>(fil);
    kontrolleraGodkannandepaket(paket, DATA);
    console.log(`Paketets hash: ${godkannandepakethash(paket)}.`);
  } finally {
    slapp();
  }
} else if (kommando === "verkstall" && argument && skriv === "--skriv") {
  verkstallGodkannandepaket(DATA, las<Godkannandepaket>(fil), argument);
  console.log("Exakt beslutat godkännandepaket verkställt.");
} else {
  throw new Error("Äldre direktkommandon verkställs inte. Förbered paket, bind ett separat mänskligt beslut och ange hela paketets hash.");
}
