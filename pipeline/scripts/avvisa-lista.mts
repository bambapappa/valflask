/** Ett avslag binder exakt köpost och minnespost före journalförd verkställning. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { taLaset } from "../src/datalas.ts";
import { lasFillage } from "../src/datatransaktion.ts";
import { AVVISNINGSFILER, avvisningspakethash, forberedAvvisningspaket, kontrolleraAvvisningspaket, verkstallAvvisningspaket, type Avvisningspaket, type Avvisningsrad } from "../src/avvisningspaket.ts";
const DATA = join(import.meta.dirname, "../../data"), [kommando, fil, argument, skriv, ...extra] = process.argv.slice(2);
const las = (f: string): unknown => JSON.parse(readFileSync(f, "utf8"));
if (extra.length || !fil) throw new Error("Använd avvisa-lista forbered <rader.json> <privat paket.json>, kontroll <paket.json>, eller verkstall <paket.json> <beslutets pakethash> --skriv");
if (kommando === "forbered" && argument && !skriv) { const slapp = taLaset(DATA, "förbered avvisningspaket"); try { const p = forberedAvvisningspaket(las(fil) as Avvisningsrad[], lasFillage(DATA, AVVISNINGSFILER), new Date()); writeFileSync(argument, JSON.stringify(p, null, 2) + "\n", { flag: "wx", mode: 0o600 }); console.log("Privat avvisningspaket sparat. Separat mänskligt avslagsbeslut saknas ännu."); } finally { slapp(); } }
else if (kommando === "kontroll" && !argument && !skriv) { const slapp = taLaset(DATA, "kontrollera avvisningspaket"); try { const p = las(fil) as Avvisningspaket; kontrolleraAvvisningspaket(p, lasFillage(DATA, AVVISNINGSFILER)); console.log(`Paketets hash: ${avvisningspakethash(p)}.`); } finally { slapp(); } }
else if (kommando === "verkstall" && argument && skriv === "--skriv") { verkstallAvvisningspaket(DATA, las(fil) as Avvisningspaket, argument); console.log("Exakt beslutat avvisningspaket skrivet till kö och avvisningsminne."); }
else throw new Error("Äldre direktkommandon verkställs inte. Förbered paket, bind ett separat mänskligt beslut och ange hela paketets hash.");
