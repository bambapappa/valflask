/** Förbered, sakpröva och besluta om hela paketet före verkställning. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { taLaset } from "../src/datalas.ts";
import { lasFillage } from "../src/datatransaktion.ts";
import { GRUPPFILER, forberedGrupppaket, kontrolleraGrupppaket, grupppakethash, verkstallGrupppaket, type Gruppindata, type Grupppaket } from "../src/grupppaket.ts";
const DATA = join(import.meta.dirname, "../../data");
const [kommando, fil, argument, skriv, ...extra] = process.argv.slice(2);
const las = (f: string): unknown => JSON.parse(readFileSync(f, "utf8"));
if (extra.length || !fil) throw new Error("Använd gruppsattning forbered <indata.json> <privat paket.json>, kontroll <paket.json>, eller verkstall <paket.json> <beslutets pakethash> --skriv");
if (kommando === "forbered" && argument && !skriv) {
  const slapp = taLaset(DATA, "förbered grupppaket");
  try {
    const p = forberedGrupppaket(las(fil) as Gruppindata, lasFillage(DATA, GRUPPFILER), new Date());
    writeFileSync(argument, JSON.stringify(p, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log("Privat paket sparat. Alla sakmoment är oavgjorda. Inga publicerade filer ändrade.");
  } finally { slapp(); }
} else if (kommando === "kontroll" && !argument && !skriv) {
  const slapp = taLaset(DATA, "kontrollera grupppaket");
  try {
    const p = las(fil) as Grupppaket;
    kontrolleraGrupppaket(p, lasFillage(DATA, GRUPPFILER));
    console.log(`Paketets hash: ${grupppakethash(p)}. Kontrollen är inte ett mänskligt godkännande.`);
  } finally { slapp(); }
} else if (kommando === "verkstall" && argument && skriv === "--skriv") {
  verkstallGrupppaket(DATA, las(fil) as Grupppaket, argument);
  console.log("Exakt beslutat paket skrivet med historik, rättelse och körlogg. Commit-hashens separata komplettering återstår.");
} else throw new Error("Äldre direktkommandon verkställs inte. Förbered paket, sakpröva det och ange beslutets hash vid verkställning.");
