/** Privat fyrfilsväg: förbered, sakpröva, kontrollera och verkställ exakt paket. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { taLaset } from "../src/datalas.ts";
import { lasAnkarskuldslage } from "../src/ankarskuldtransaktion.ts";
import { ankarpasspakethash, forberedAnkarpasspaket, kontrolleraAnkarpasspaket, verkstallAnkarpasspaket, type Ankarpassindata, type Ankarpasspaket } from "../src/ankarpasspaket.ts";

const DATA = join(import.meta.dirname, "../../data");
const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
const [kommando, fil, argument, skriv, ...extra] = args;
const las = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
if (extra.length || !fil) throw new Error("Använd ankarpass-beslut forbered <indata.json> <privat paket.json>, kontroll <paket.json>, eller verkstall <paket.json> <beslutets pakethash> --skriv");
if (kommando === "forbered" && argument && !skriv) {
  const slapp = taLaset(DATA, "förbered ankarpasspaket");
  try {
    const paket = forberedAnkarpasspaket(las(fil) as Ankarpassindata, lasAnkarskuldslage(DATA), new Date());
    writeFileSync(argument, JSON.stringify(paket, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log("Privat paket sparat med oavgjorda sakmoment. Inga publicerade filer ändrade.");
  } finally { slapp(); }
} else if (kommando === "kontroll" && !argument && !skriv) {
  const slapp = taLaset(DATA, "kontrollera ankarpasspaket");
  try {
    const paket = las(fil) as Ankarpasspaket;
    kontrolleraAnkarpasspaket(paket, lasAnkarskuldslage(DATA));
    console.log(`Paketets hash: ${ankarpasspakethash(paket)}. Detta är en teknisk kontroll, inte ett mänskligt beslut.`);
  } finally { slapp(); }
} else if (kommando === "verkstall" && argument && skriv === "--skriv") {
  verkstallAnkarpasspaket(DATA, las(fil) as Ankarpasspaket, argument);
  console.log("Exakt beslutat paket journalfört över löften, ändringslogg, rättelser och ankarfacit. Commit-hashens komplettering återstår.");
} else throw new Error("Förbered paket, fyll i privat sakprövning, kontrollera och ange beslutets exakta hash vid verkställning.");
