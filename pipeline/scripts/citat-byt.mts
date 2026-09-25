/** Förbered, sakpröva och besluta om hela paketet före verkställning. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LiveSource } from "../src/fetch.ts";
import { citatadress, kallbas } from "../src/citatforslag.ts";
import type { PromiseEntry } from "../src/loftesforslag.ts";
import { taLaset } from "../src/datalas.ts";
import { lasFillage } from "../src/datatransaktion.ts";
import { CITATFILER, forberedCitatpaket, kontrolleraCitatpaket, citatpakethash, verkstallCitatpaket, type Citatindata, type Citatpaket } from "../src/citatpaket.ts";
const DATA = join(import.meta.dirname, "../../data");
const [kommando, fil, argument, skriv, ...extra] = process.argv.slice(2);
const las = (f: string): unknown => JSON.parse(readFileSync(f, "utf8"));
if (extra.length || !fil) throw new Error("Använd citat-byt forbered <indata.json> <privat paket.json>, kontroll <paket.json>, eller verkstall <paket.json> <beslutets pakethash> --skriv");
if (kommando === "forbered" && argument && !skriv) {
  const slapp = taLaset(DATA, "förbered citatpaket");
  try {
    const indata = las(fil) as Citatindata, fore = lasFillage(DATA, CITATFILER);
    const loften: PromiseEntry[] = JSON.parse(fore["promises.json"]!);
    const urler = [...new Set(indata.rader.map(rad => {
      const lofte = loften.find(p => p.id === rad.id);
      if (!lofte) throw new Error("Målet saknas");
      return citatadress(rad, lofte);
    }))];
    const source = new LiveSource({ feeds: urler.map((url, i) => ({ id: `cb${i}`, type: "page" as const, url })), limits: { max_articles_per_run: 10000, min_chars: 1 } });
    const texter = new Map<string, string>();
    for (const a of await source.fetch()) {
      const url = kallbas(a.url);
      texter.set(url, `${texter.get(url) ?? ""}\n${a.text}`);
    }
    if (urler.some(url => !texter.get(url)?.trim())) throw new Error("Källan svarade inte. Inget paket skapas.");
    const nu = new Date();
    const kallor = urler.map(url => ({ url, text: texter.get(url)!, hamtad: nu.toISOString() }));
    const p = forberedCitatpaket(indata, fore, nu, kallor);
    writeFileSync(argument, JSON.stringify(p, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log("Privat paket sparat. Alla sakmoment är oavgjorda. Inga publicerade filer ändrade.");
  } finally { slapp(); }
} else if (kommando === "kontroll" && !argument && !skriv) {
  const slapp = taLaset(DATA, "kontrollera citatpaket");
  try {
    const p = las(fil) as Citatpaket;
    kontrolleraCitatpaket(p, lasFillage(DATA, CITATFILER));
    console.log(`Paketets hash: ${citatpakethash(p)}. Kontrollen är inte ett mänskligt godkännande.`);
  } finally { slapp(); }
} else if (kommando === "verkstall" && argument && skriv === "--skriv") {
  verkstallCitatpaket(DATA, las(fil) as Citatpaket, argument);
  console.log("Exakt beslutat paket skrivet med historik, rättelse och körlogg. Commit-hashens separata komplettering återstår.");
} else throw new Error("Äldre direktkommandon verkställs inte. Förbered paket, sakpröva det och ange beslutets hash vid verkställning.");
