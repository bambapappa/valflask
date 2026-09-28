/**
 * Hämtar hem videokopior för de talade källorna.
 *
 * VARFÖR STEGET FINNS
 *
 * Fjorton löften kommer ur sex sändningar på YouTube. Ingen av dem har eller
 * kan få en arkivkopia hos Wayback eller archive.today — en film går inte att
 * spara som text, och det är det permanenta undantaget metodsidan skriver ut.
 * Följden är den metodsidan också skriver ut: försvinner filmen står vi med
 * vår avskrift och inget som läsaren kan öppna.
 *
 * Ghostarchive arkiverar YouTube-video, och är det enda av de tre arkiven som
 * gör det. Sökningen är öppen; INSKICKET ligger bakom en Cloudflare-utmaning
 * och görs därför av en människa, en film i taget. Det här steget gör resten:
 * slår upp vad som finns och skriver in adressen.
 *
 *   pnpm film:arkiv              # torrkörning, alltid först
 *   pnpm film:arkiv -- --skriv
 *
 * VAD EN VIDEOKOPIA BEVISAR, OCH VAD DEN INTE BEVISAR
 *
 * Den skrivs till `source.video_archive_url` och ALDRIG till `archive_url`.
 * Skälet är citatgrinden: en arkivkopia godtas bara om citatet står ordagrant
 * i själva ögonblicksbilden, och en film bär ingen text att pröva mot. En
 * videokopia säger att orden går att höra även om YouTube tar bort filmen —
 * inte att vi kontrollerat citatet mot den. Den kontrollen sker mot
 * avskriften, som förut, och redovisas separat.
 *
 * Blandas de två fälten ihop ser löftet ut att ha ett ordagrant belägg det
 * inte har. Därför prövar `film-arkiv.test.ts` att fältet bara sätts på
 * filmkällor och bara med `/varchive/`-adresser.
 */
import { join } from "node:path";
import { arVideokopia, slaUppGhostarchive } from "../src/archive.ts";
import { arFilm, filmensAdress } from "../src/filmkallan.ts";
import { lasFillage } from "../src/datatransaktion.ts";
import { skrivUnderlagskomplettering } from "../src/underlagskomplettering.ts";
import { svenskDag } from "../src/dagen.ts";

const DATA = join(import.meta.dirname, "../../data");
const SKRIV = process.argv.includes("--skriv");
const sov = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Kalla {
  url: string;
  archive_url: string | null;
  video_archive_url?: string | null;
}
interface Lofte { id: string; status?: string; source: Kalla; history?: { date: string; change: string; commit: string }[] }

const fore = lasFillage(DATA, ["promises.json", "changelog.json"]);
if (typeof fore["promises.json"] !== "string") throw new Error("Saknar promises.json");
const promises = JSON.parse(fore["promises.json"]) as Lofte[];

const perFilm = new Map<string, Lofte[]>();
for (const p of promises) {
  if (p.status !== "aktiv" || !arFilm(p.source.url)) continue;
  if (p.source.video_archive_url) continue;
  const nyckel = filmensAdress(p.source.url);
  perFilm.set(nyckel, [...(perFilm.get(nyckel) ?? []), p]);
}

console.log(
  `${perFilm.size} sändningar utan videokopia, som bär ` +
    `${[...perFilm.values()].reduce((n, l) => n + l.length, 0)} löften.\n`,
);

const funna = new Map<string, string>();
for (const [adress, loften] of perFilm) {
  const kopia = await slaUppGhostarchive(adress);
  if (kopia && arVideokopia(kopia)) {
    funna.set(adress, kopia);
    console.log(`  ✓ ${adress}\n      ${kopia}  (${loften.length} löften)`);
  } else if (kopia) {
    // En sidkopia av YouTube-sidan är inte en videokopia. Den bär sidans
    // text, inte sändningen, och duger inte till det här.
    console.log(`  – ${adress}\n      bara en sidkopia (${kopia}), ingen video`);
  } else {
    console.log(`  – ${adress}\n      ingen kopia — skicka in den på https://ghostarchive.org/`);
  }
  await sov(2000);
}

if (funna.size === 0) {
  console.log("\nInget att skriva. Skicka in sändningarna och kör om.");
  process.exit(0);
}

let rorda = 0;
const andradeId: string[] = [];
const nu = new Date();
for (const [adress, loften] of perFilm) {
  const kopia = funna.get(adress);
  if (!kopia) continue;
  for (const p of loften) {
    p.source.video_archive_url = kopia;
    p.history = [...(p.history ?? []), {
      date: svenskDag(nu),
      change: "En videokopia av källsändningen har lagts till. Den är ett komplement till avskriften och har inte använts som ordagrant citatbelägg. Citat, belopp och bedömning är oförändrade.",
      commit: "0000000",
    }];
    andradeId.push(p.id);
    rorda++;
  }
}

console.log(`\n${funna.size} sändningar → ${rorda} löften får en videokopia.`);
if (!SKRIV) {
  console.log("torrkörning — lägg till --skriv för att verkställa.");
  process.exit(0);
}
skrivUnderlagskomplettering(DATA, fore, promises, andradeId, "film-arkiv", nu);
console.log("skrivet: promises.json och changelog.json i samma paket");
console.log("Kvar att göra: backfilla historikens commit-hash i andra commiten och kontrollera metodsidans rad om videokopior.");
