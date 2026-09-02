/**
 * Hur mycket av det publicerade som gått genom kvalitetsfiltret.
 *
 * Läser det exporterade indexet `data/provningar.json` — inte granskningsloggen
 * själv, som ligger i ett privat repo. Måttet kan därför köras i bygget, och
 * det är hela poängen: filtret fanns som text i skillarna i ett dygn utan att
 * något mätte det, och täckningen stod på fyra av 1 382.
 *
 *   pnpm provningar:status          # tabellen
 *   pnpm provningar:status --tak    # utfallskod 1 om skulden vuxit
 *
 * `--tak` är spärren mot att det glider tillbaka, och den vaktar **två** tal.
 * Antalet oprövade får aldrig växa — går det upp har något publicerats förbi
 * grinden. Och de gamla prövningarna får aldrig bli fler än de namngivna i
 * `facit/provningsskulden.json` — en prövning som beskriver en annan version
 * än den som står publicerad är ingen prövning av det publicerade.
 *
 * Det andra ledet saknades till 2026-08-23, och luckan var mätbar: 390 saker
 * bar en prövning av en äldre version, 367 av dem löften, utan att något sa
 * ifrån. `provningsGrind()` fäller samma sak — men bara i godkännandevägen,
 * alltså aldrig för det som redan är publicerat.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { lasProvningar } from "../src/provningar.ts";
import { koforslagId, konyckel, reviewNyckel } from "../src/provningar.ts";
import { vantan, domVantan, type Kopost } from "../src/kovantan.ts";
import {
  domSkulden,
  kopplingsSaker,
  loftesSaker,
  rakna,
  standpunktsSaker,
  type Rakning,
  type Skuldfacit,
} from "../src/provningsskulden.ts";

const DATA = join(import.meta.dirname, "../../data");
const HV_DATA = join(import.meta.dirname, "../../handlingsvagen/data");
const TAKFIL = join(DATA, "provningar-tak.json");
const SKULDFACIT = join(import.meta.dirname, "../facit/provningsskulden.json");

function las<T>(sokvag: string): T[] {
  return existsSync(sokvag) ? (JSON.parse(readFileSync(sokvag, "utf-8")) as T[]) : [];
}

// Befolkningarna byggs av `provningsskulden.ts`, så att provet och mätningen
// räknar samma sak. Räknades de på två ställen skulle de glida isär, och det
// har hänt en gång: mätningen i handoff såg 94,6 procent på löftena medan den
// här såg 100, och skillnaden låg i uppslagningen och inte i arbetet.
const provningar = lasProvningar(DATA);
const befolkning: [string, Rakning][] = [
  ["lofte", rakna(loftesSaker(las(join(DATA, "promises.json"))), provningar)],
  ["koppling", rakna(kopplingsSaker(las(join(HV_DATA, "kopplingar.json"))), provningar)],
  ["standpunkt", rakna(standpunktsSaker(las(join(DATA, "stances.json"))), provningar)],
];

const total = befolkning.reduce(
  (a, [, r]) => ({
    aktuell: a.aktuell + r.aktuella,
    gammal: a.gammal + r.gamla.length,
    oprovad: a.oprovad + r.oprovade,
    summa: a.summa + r.summa,
  }),
  { aktuell: 0, gammal: 0, oprovad: 0, summa: 0 },
);

const p = (n: number, av: number) => (av ? ((n / av) * 100).toFixed(1) : "0.0");
console.log(`\n${"".padEnd(14)}${"aktuella".padStart(10)}${"gamla".padStart(8)}${"oprövade".padStart(10)}${"summa".padStart(8)}   täckning`);
console.log("─".repeat(60));
for (const [slag, r] of befolkning) {
  console.log(
    `  ${slag.padEnd(12)}${String(r.aktuella).padStart(10)}${String(r.gamla.length).padStart(8)}` +
      `${String(r.oprovade).padStart(10)}${String(r.summa).padStart(8)}   ${p(r.aktuella, r.summa).padStart(5)} %`,
  );
}
console.log("─".repeat(60));
console.log(
  `  ${"allt".padEnd(12)}${String(total.aktuell).padStart(10)}${String(total.gammal).padStart(8)}` +
    `${String(total.oprovad).padStart(10)}${String(total.summa).padStart(8)}   ${p(total.aktuell, total.summa).padStart(5)} %`,
);
console.log("\n  aktuella = prövade, och saken har inte ändrats sedan dess");
console.log("  gamla    = prövade, men beloppet, citatet eller riktningen har ändrats efteråt");
console.log("  oprövade = har aldrig gått genom filtret\n");

// ── Köerna ────────────────────────────────────────────────────────────────
//
// Tabellen ovan räknar det publicerade. Den svarade 0 oprövade medan 623
// köposter var oprövade och godkännandevägen föll på varenda en — måttet var
// rätt på sin egen fråga och blint för den här. Se `kovantan.ts`.
const kopplingskon: Kopost[] = las<{
  promise_id?: string;
  stance_id?: string;
  handling_id: string;
  skapad?: string;
}>(join(HV_DATA, "kopplingsforslag.json")).map((k) => ({
  nyckel: `ko:${koforslagId(k)}`,
  skapad: k.skapad,
}));
// Granskningskön bär inget datum på posten, så den går att räkna men inte att
// vänta på. Talet skrivs ut ändå — en känd lucka går att lita på, en dold
// gör det inte.
const granskningskon = las<{
  articleUrl?: string;
  articleTitle?: string;
  candidate?: { quote?: string; title?: string };
}>(join(DATA, "needs_review.json")).map((it) => ({
  nyckel: konyckel(it.articleUrl, it.candidate?.quote),
  rubriknyckel: reviewNyckel(it.articleUrl, it.candidate?.title ?? it.articleTitle),
  skapad: null,
}));
const harProvning = (nyckel: string) => provningar.has(nyckel);
const koVantan = vantan(kopplingskon, harProvning, new Date());
// En kö-post i granskningskön hittas under TVÅ nycklar — citatets och
// rubrikens — så uppslaget måste pröva båda. Räknas bara den ena ser femton
// prövade poster ut som noll; det hände i mätningen som inledde det här
// passet, och siffran fick rättas i efterhand.
const granskningsOprovade = granskningskon.filter(
  (post) => !harProvning(post.nyckel) && !harProvning(post.rubriknyckel),
).length;
console.log("  Köerna — det som väntar på ett beslut:");
console.log(
  `    kopplingskön     ${koVantan.summa - koVantan.oprovade} av ${koVantan.summa} prövade` +
    (koVantan.dagar === null ? "" : ` · äldsta oprövade har väntat ${koVantan.dagar} dygn`),
);
console.log(
  `    granskningskön   ${granskningskon.length - granskningsOprovade} av ${granskningskon.length} prövade` +
    " · posterna bär inget datum, så väntan går inte att mäta\n",
);

if (!process.argv.includes("--tak")) process.exit(0);

let rott = false;

// Led 1: oprövade får bli färre, aldrig fler.
const tak = existsSync(TAKFIL)
  ? (JSON.parse(readFileSync(TAKFIL, "utf-8")) as { oprovade: number }).oprovade
  : total.oprovad;

if (total.oprovad > tak) {
  console.error(
    `Fler oprövade än taket: ${total.oprovad} mot ${tak}.\n` +
      "Något har publicerats utan att gå genom kvalitetsfiltret. Pröva det, eller\n" +
      "dra tillbaka det — taket höjs inte för att göra bygget grönt.",
  );
  rott = true;
} else if (total.oprovad < tak) {
  writeFileSync(TAKFIL, JSON.stringify({ oprovade: total.oprovad }, null, 2) + "\n", "utf-8");
  console.log(`Taket sänkt: ${tak} → ${total.oprovad} oprövade. Committa data/provningar-tak.json.`);
}

// Led 2: de gamla får bara krympa, och listan är namngiven.
//
// Ett tal ensamt duger inte: då kan en post rättas medan en annan går sönder,
// och skulden ser oförändrad ut fast den bytt innehåll. Med id i listan måste
// den rättade strykas, och den nya kan inte gömma sig bakom den.
const facit = existsSync(SKULDFACIT)
  ? (JSON.parse(readFileSync(SKULDFACIT, "utf-8")) as Skuldfacit)
  : { count: total.gammal, ids: befolkning.flatMap(([, r]) => r.gamla) };
const dom = domSkulden(
  befolkning.flatMap(([, r]) => r.gamla),
  facit,
);

if (dom.nya.length > 0) {
  console.error(
    `\n${dom.nya.length} sak(er) har fått en prövning som beskriver en annan version:\n` +
      dom.nya.map((id) => `  ${id}`).join("\n") +
      "\n\nBeloppet, citatet eller riktningen har ändrats efter att prövningen skrevs.\n" +
      "Pröva om saken — lägg den INTE i facit/provningsskulden.json. Den filen är\n" +
      "en skuld som ska betalas av, inte ett ställe att gömma nya poster i.",
  );
  rott = true;
}

if (dom.rattade.length > 0) {
  console.log(
    `\n${dom.rattade.length} sak(er) i facit är prövade på nytt och ska strykas ur\n` +
      "facit/provningsskulden.json:\n" +
      dom.rattade.map((id) => `  ${id}`).join("\n"),
  );
}

// Led 3: en köpost får inte ligga oprövad i veckor.
//
// Antalet duger inte som tak — kön fylls på schemalagt, så ett tak på antalet
// hade fällt bygget varje dygn och blivit brus. Väntan är måttet: ett förslag
// som kom i natt ska inte vara prövat i morse, men ett som legat en vecka
// betyder att passet slutat köras.
const komdom = domVantan(koVantan, "kopplingskön");
if (!komdom.ok) {
  console.error(`\n${komdom.skal}`);
  rott = true;
}

if (rott) process.exit(1);
