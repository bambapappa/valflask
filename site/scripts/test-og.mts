/**
 * test-og.mts — delningsbilderna måste visa samma tal som sidorna.
 *
 * Bakgrunden (mätt 2026-08-05): generate-og.mts bar egna kopior av
 * dedupeByGroup, totalFlasket, partyTotalMsek, beloppsformateringen och
 * etiketterna. Kopiorna gled isär från sajten på fem punkter utan att något
 * larmade, eftersom ingen grind läste dem:
 *
 *   1. Belopp under 1 000 mkr skrevs ut med enheten MDKR — tusen gånger för
 *      mycket, på 92 av 490 löftesbilder.
 *   2. totalFlasket saknade filtret för tillbakadragna löften: startsidans
 *      delningsbild låg 217 000 mkr över sajtens egen taxameter.
 *   3. dedupeByGroup valde gruppens FÖRSTA medlem i stället för den som bär
 *      högsta beloppet — felet som rättades i aggregates.ts 2026-07-27.
 *   4. partyTotalMsek lade besparingar PLUS i stället för minus.
 *   5. Etiketterna var den gamla jargongen ("LLM-estimat", "RUT/utredning")
 *      och saknade "granskare" helt.
 *
 * Grindarna nedan prövar två saker: att skriptet inte bär egna kopior, och att
 * talet på bilden är ordagrant det tal sidan visar.
 *
 * Körs i sajtens teststil (node --experimental-strip-types).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { partyTotalMsek, promiseTotalMsek, totalFlasket } from "../src/lib/aggregates.ts";
import { formatMsek } from "../src/lib/calc.ts";
import { rubrikStorlek, rubrikUtrymme, fotStorlek } from "./generate-og.mts";
import { getPromises, getParties } from "../src/lib/data.ts";
import type { PromisePost } from "../src/lib/data";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OG_SCRIPT = resolve(__dirname, "generate-og.mts");

let errors = 0;
function check(label: string, cond: boolean, msg?: string): void {
  if (cond) console.log(`  OK: ${label}`);
  else {
    console.error(`FAIL: ${label}${msg ? ` — ${msg}` : ""}`);
    errors++;
  }
}

const src = readFileSync(OG_SCRIPT, "utf8");
// Kommentarer bort: filen BESKRIVER de gamla kopiorna, och beskrivningen ska
// inte fälla grinden.
const kod = src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

console.log("--- Delningsbilderna bär inga egna kopior ---");
for (const namn of [
  "dedupeByGroup",
  "totalFlasket",
  "partyTotalMsek",
  "promiseTotalMsek",
  "formatBasisLabel",
  "formatMsek",
  "formatMsekBare",
]) {
  check(
    `${namn} definieras inte lokalt`,
    !new RegExp(`function\\s+${namn}\\s*\\(`).test(kod),
    `generate-og.mts definierar en egen ${namn} — importera den ur src/lib i stället`,
  );
}

check(
  "enheten klistras inte på för hand",
  !/`\$\{[^`]*\}\s*MDKR`/.test(kod),
  'bilden skriver "MDKR" själv i stället för att låta formatMsek välja enhet',
);

console.log("\n--- Bilden visar samma tal som sidan ---");
const promises = getPromises() as PromisePost[];
const parties = getParties();

// Startsidan: taxametern och delningsbilden ska vila på samma summa.
check(
  "startsidans bild vilar på totalFlasket",
  /ogBelopp\(flasket\)/.test(kod) && /totalFlasket\(promises\)/.test(kod),
  "startbilden räknar inte längre ur totalFlasket",
);

// Enheten: ett belopp under 1 000 mkr får ALDRIG skrivas i mdkr.
for (const [msek, vantad] of [
  [400, "400 MKR"],
  [600, "600 MKR"],
  [5, "5 MKR"],
  [4600, "4,6 MDKR"],
  [25000, "25 MDKR"],
] as Array<[number, string]>) {
  const fick = formatMsek(msek).toUpperCase();
  check(`${msek} mkr skrivs "${vantad}"`, fick === vantad, `bilden skulle visa "${fick}"`);
}

// En besparing ska dra NED partiets summa. Räknas den plus är felet osynligt
// i en total men syns direkt på ett parti som föreslår besparingar.
for (const p of parties) {
  const total = partyTotalMsek(promises, p.code);
  const brutto = promises
    .filter((q) => q.status !== "tillbakadragen" && q.parties.includes(p.code))
    .reduce((s, q) => s + promiseTotalMsek(q), 0);
  check(
    `${p.code.toUpperCase()}: besparingar dras av, gruppdubbletter räknas en gång`,
    total <= brutto,
    `partisumman (${total}) överstiger bruttot (${brutto}) — tecken eller dedup saknas`,
  );
}

// Inget löfte får hamna i fel storleksordning på sin egen bild.
const felEnhet = promises.filter((p) => {
  const total = promiseTotalMsek(p);
  return total > 0 && total < 1000 && formatMsek(total, p.cost.basis).toUpperCase().includes("MDKR");
});
check(
  "inget löfte under 1 000 mkr märks MDKR",
  felEnhet.length === 0,
  `${felEnhet.length} löften skulle visa mdkr för ett mkr-belopp`,
);

// Tillbakadragna löften får inte räknas in i startsidans summa. Grinden är
// bara meningsfull om det FINNS tillbakadragna löften med kostnad — annars
// säger den ingenting, och det ska den säga ifrån om.
const dragnaMedKostnad = promises.filter(
  (p) =>
    p.status === "tillbakadragen" &&
    (p.cost.type === "utgift" || p.cost.type === "intäktsminskning") &&
    promiseTotalMsek(p) > 0,
);
check(
  "det finns tillbakadragna löften med kostnad att pröva mot",
  dragnaMedKostnad.length > 0,
  "grinden nedan kan inte falla — datat saknar tillbakadragna kostnadslöften",
);
const ofiltrerat = promises
  .filter((p) => p.cost.type === "utgift" || p.cost.type === "intäktsminskning")
  .reduce((s, p) => s + promiseTotalMsek(p), 0);
check(
  "rikssumman utesluter tillbakadragna löften",
  totalFlasket(promises) < ofiltrerat,
  `totalFlasket (${totalFlasket(promises)}) skiljer sig inte från den ofiltrerade summan (${ofiltrerat})`,
);

console.log("\n--- Texten ryms i bilden ---");
// Klampen såg ut att lösa det men gjorde ingenting: satori 0.29 struntar i
// -webkit-line-clamp, så en rubrik på 137 tecken renderades på fyra rader och
// svämmade ut över fotraden. Kommer den tillbaka ska grinden säga ifrån.
check(
  "ingen -webkit-line-clamp (satori struntar i den)",
  !/WebkitLineClamp/.test(kod),
  "klampen ser ut att begränsa rubriken men gör det inte — skala graden i stället",
);

// Grindarna nedan prövar måtten. Men de anropar funktionerna direkt, så de
// märker inte om LAYOUTEN slutar använda dem — därför läses källan också.
// (Upptäckt genom att sätta tillbaka fasta grader: bara klamp-grinden föll.)
check(
  "rubrikens grad kommer ur rubrikStorlek",
  /fontSize:\s*rubrikStorlek\(/.test(kod),
  "layouten har en fast teckengrad igen — långa rubriker svämmar över",
);
check(
  "fotradens grad kommer ur fotStorlek",
  /fontSize:\s*fotStorlek\(/.test(kod),
  "layouten har en fast teckengrad igen — långa källrader krockar med licensraden",
);

const RUBRIK_BREDD = 1088;
const TECKENBREDD = 0.452;
const RAD_HOJD = 1.2;

function rubrikHojd(title: string, bigNumber: string): number {
  const grad = rubrikStorlek(title, bigNumber);
  const teckenPerRad = Math.max(1, Math.floor(RUBRIK_BREDD / (TECKENBREDD * grad)));
  return Math.ceil(title.length / teckenPerRad) * grad * RAD_HOJD;
}

const forLanga = promises.filter((p) => {
  const belopp = formatMsek(promiseTotalMsek(p), p.cost.basis).toUpperCase();
  return rubrikHojd(p.title, belopp) > rubrikUtrymme(belopp);
});
check(
  "varje löftesrubrik ryms ovanför fotraden",
  forLanga.length === 0,
  `${forLanga.length} rubriker svämmar över, längst: ${forLanga[0]?.id} (${forLanga[0]?.title.length} tecken)`,
);

const ETIKETT: Record<string, string> = {
  rut: "Riksdagens utredningstjänst",
  myndighet: "Myndighet",
  parti: "Partiets egen siffra",
  media: "Nyhetsmedier",
  llm_estimat: "Datoruppskattning",
  granskare: "Satt för hand vid granskningen",
};
const krockande = promises.filter((p) => {
  const fot = `Källa: ${ETIKETT[p.cost.basis] ?? p.cost.basis} · Hämtad ${p.source.fetched_at.slice(0, 10)} · utlovat.se`;
  const grad = fotStorlek(fot, "CC BY 4.0");
  return (fot.length + "CC BY 4.0".length) * 0.6 * grad + 24 > RUBRIK_BREDD;
});
check(
  "fotradens två texter krockar aldrig",
  krockande.length === 0,
  `${krockande.length} bilder där källraden skriver över licensraden`,
);

check(
  "en lång rubrik får en mindre grad än en kort",
  rubrikStorlek("x".repeat(140), "25 MDKR") < rubrikStorlek("x".repeat(30), "25 MDKR"),
  "skalningen gör ingen skillnad — då är den inte inkopplad",
);

if (errors > 0) {
  console.error(`\ntest-og: ${errors} grind(ar) föll`);
  process.exit(1);
}
console.log("\ntest-og: alla grindar gröna");
