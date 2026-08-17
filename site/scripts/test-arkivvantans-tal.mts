/**
 * test-arkivvantans-tal.mts — raden om väntan ska faktiskt nå läsaren.
 *
 * VARFÖR PROVET FINNS, OCH VAD DET KOSTADE ATT LÄRA
 *
 * Interimregeln som släpper igenom en arkivlucka över taket vilar på ett
 * löfte till läsaren: så länge vi väntar står det på metodsidan, med antal och
 * sedan när. Utan den raden är undantaget ett tyst undantag, och ett tyst
 * undantag blir permanent.
 *
 * Första versionen av `arkivvantans-tal.ts` räknade fram datakatalogen ur
 * `import.meta.dirname`. Kört direkt med node svarade den `55`. I Astro-bygget
 * svarade den `0` — sökvägen löser sig annorlunda där — och den villkorade
 * raden renderades därför aldrig. **Sidan såg ut att säga att ingen väntade,
 * medan femtiofem källor gjorde det**, och allting annat var grönt: enhetstest,
 * prosagrind, bygge, driftsättning. Felet hittades bara för att någon hämtade
 * den publicerade sidan och letade efter meningen.
 *
 * Prosans ankare kan inte fånga det: de läser sidans KÄLLKOD, och där stod
 * raden hela tiden. Det som saknades var ett prov på att den blir HTML.
 *
 * Provet mäter därför två saker, och det andra är det som biter:
 *
 *   1. att `arkivvantansTal()` säger samma sak som datafilen,
 *   2. att talet den ger är det som faktiskt hamnar i den byggda sidan.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { arkivvantansTal } from "../src/lib/arkivvantans-tal.ts";
import { provaVantan, type Vantan } from "../../pipeline/src/arkivvantan.ts";

const ROT = resolve(import.meta.dirname, "../..");
let fel = 0;
const ok = (villkor: boolean, text: string) => {
  console.log(`  ${villkor ? "OK" : "FEL"}: ${text}`);
  if (!villkor) fel++;
};

console.log("--- Väntan på arkivet: talet stämmer med datat ---");

const vantan = JSON.parse(
  readFileSync(resolve(ROT, "data/arkivvantan.json"), "utf8"),
) as Vantan;
const besked = provaVantan(vantan, new Date().toISOString());
const tal = arkivvantansTal();

ok(
  tal.antal === besked.vantande.length,
  `arkivvantansTal() säger ${tal.antal}, datafilen har ${besked.vantande.length} väntande`,
);

// Sökvägsbuggen gav exakt det här: rätt data i filen, noll ur funktionen.
ok(
  !(besked.vantande.length > 0 && tal.antal === 0),
  "funktionen hittar datat — inte noll när filen har poster",
);

if (besked.vantande.length > 0) {
  ok(tal.sedan !== null, "en pågående väntan bär ett datum att skriva ut");
}

console.log("\n--- Och talet når den byggda sidan ---");

const byggd = resolve(ROT, "site/dist/metod/index.html");
if (!existsSync(byggd)) {
  console.log("  (hoppar: sidan är inte byggd — kör astro build först)");
} else {
  const html = readFileSync(byggd, "utf8");
  const harRaden = html.includes("källor på en arkivkopia");
  if (besked.vantande.length > 0) {
    ok(harRaden, "raden om väntan står i den byggda sidan");
    ok(
      html.includes(`väntar ${tal.antal} källor`),
      `sidan bär samma tal som datat: ${tal.antal}`,
    );
  } else {
    ok(!harRaden, "ingen väntan pågår, och då står raden inte där heller");
  }
}

console.log(fel === 0 ? "\nVäntans tal: grönt." : `\nVäntans tal: ${fel} fel.`);
process.exit(fel === 0 ? 0 : 1);
