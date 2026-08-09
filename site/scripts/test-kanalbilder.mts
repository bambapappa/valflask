/**
 * test-kanalbilder.mts — grindar för de lodräta kanalbilderna.
 *
 * Bilderna säger "över 3 500 miljarder" där datat säger 3 816,8. Det är en
 * medveten avrundning nedåt för hållbarhet, och därmed också det enda stället
 * på hela sajten där ett tal på en bild INTE är talet i datat. Just därför
 * behöver den ha en grind: ett golv som råkar hamna ÖVER sin egen mätning är
 * inte en avrundning, det är ett falskt påstående, och det syns inte i bilden.
 *
 * Grindarna nedan prövar tre saker:
 *   1. att `golvtal` alltid ligger under mätningen, och inte för långt under,
 *   2. att varje golv som står på en bild har en mätning registrerad bakom sig,
 *   3. att ramen faktiskt blir 1080×1920 med källrad och allt.
 *
 * Körs i sajtens teststil (node --experimental-strip-types).
 */
import { byggBilder, golvtal, avTio, mätUnderlaget, type Bild } from "./kanalbilder.mts";

let errors = 0;
function check(label: string, cond: boolean, msg?: string): void {
  if (cond) console.log(`  OK: ${label}`);
  else {
    console.error(`FAIL: ${label}${msg ? ` — ${msg}` : ""}`);
    errors++;
  }
}

console.log("--- Golvet ligger under mätningen, men inte långt under ---");
const prov = [
  1, 7, 12, 47, 68, 99, 100, 195.9, 216, 269.5, 349, 425, 554, 826, 1017.6, 2576, 3816.8, 23645, 999999,
];
let underOchNara = true;
for (const v of prov) {
  const g = golvtal(v);
  if (g > v || g < v * 0.8) underOchNara = false;
}
check("varje provvärde får ett golv i spannet [80 %, 100 %]", underOchNara);
check("3 816,8 → 3 500", golvtal(3816.8) === 3500, `blev ${golvtal(3816.8)}`);
check("554 → 500", golvtal(554) === 500, `blev ${golvtal(554)}`);
check("23 645 → 20 000", golvtal(23645) === 20000, `blev ${golvtal(23645)}`);
check("golvet är aldrig noll för ett positivt tal", prov.every((v) => golvtal(v) > 0));
check("noll och negativa tal ger noll", golvtal(0) === 0 && golvtal(-5) === 0);
check("andelar rundas nedåt: 0,953 → 9", avTio(0.953) === 9);
check("andelar rundas nedåt: 0,727 → 7", avTio(0.727) === 7);
check("en hel andel ger 10", avTio(1) === 10);

console.log("\n--- Bilderna ---");
const underlag = mätUnderlaget();
const bilder = byggBilder(underlag);

check("bilderna har unika filnamn", new Set(bilder.map((b) => b.fil)).size === bilder.length);
check(
  "varje bild bär en källrad",
  bilder.every((b) => b.kallrad.trim().length > 0),
);
check(
  "varje bild bär ett förslag på bildtext",
  bilder.every((b) => b.bildtext.trim().length > 0),
);
check(
  "varje bild har en rubrik eller ett jättetal",
  bilder.every((b) => b.block.some((bl) => bl.typ === "rubrik" || bl.typ === "jattetal")),
);

let golvUnderMatning = true;
for (const bild of bilder) {
  for (const m of bild.matningar) {
    if (m.visatVarde > m.mattVarde) {
      golvUnderMatning = false;
      console.error(`   ${bild.fil}: "${m.pastaende}" visar ${m.visatVarde} men mätningen är ${m.mattVarde}`);
    }
  }
}
check("inget golv ligger över sin egen mätning", golvUnderMatning);

/**
 * Varje "över N" och "mer än N" på en bild måste ha en mätning bakom sig.
 *
 * Grinden finns för att fånga det billiga misstaget: att skriva in ett hedgat
 * tal direkt i en rubrik utan att registrera vad det vilar på. Då står talet
 * på bilden men inte i `TEXTER.md`, och nästa person kan varken kontrollera
 * eller veta när bilden behöver byggas om.
 */
function texterUr(bild: Bild): string[] {
  const ut: string[] = [];
  for (const b of bild.block) {
    if (b.typ === "kicker" || b.typ === "rubrik" || b.typ === "brodtext") ut.push(b.text);
    if (b.typ === "jattetal") ut.push(`${b.over ?? ""} ${b.tal} ${b.enhet} ${b.underrad}`);
    if (b.typ === "faktarad") ut.push(...b.delar);
    if (b.typ === "punkter") for (const p of b.poster) ut.push(p.rubrik, p.text);
    if (b.typ === "statrader") for (const p of b.poster) ut.push(`${p.tal} ${p.etikett}`);
    if (b.typ === "staplar") {
      for (const r of b.rader) ut.push(`${r.etikett} ${r.varde}`);
      ut.push(b.not);
    }
    if (b.typ === "rutnat") ut.push(b.not);
  }
  return ut;
}

const HEDGE = /(över|mer än)\s+([\d  ]+\d)/giu;
let allaHedgarBelagda = true;
for (const bild of bilder) {
  const belagg = bild.matningar.map((m) => m.pastaende.toLowerCase());
  for (const t of texterUr(bild)) {
    for (const träff of t.toLowerCase().matchAll(HEDGE)) {
      const fras = `${träff[1]} ${träff[2]}`.trim();
      if (!belagg.some((b) => b.includes(fras))) {
        allaHedgarBelagda = false;
        console.error(`   ${bild.fil}: "${fras}" står på bilden men saknar mätning`);
      }
    }
  }
}
check("varje avrundat tal på en bild har en mätning bakom sig", allaHedgarBelagda);

/** Ett tal skrivet som "800+" är samma sorts påstående och måste också beläggas. */
let allaPlusBelagda = true;
for (const bild of bilder) {
  for (const b of bild.block) {
    if (b.typ !== "statrader") continue;
    for (const post of b.poster) {
      if (!post.tal.endsWith("+")) continue;
      const värde = Number(post.tal.replace(/[^\d]/gu, ""));
      if (!bild.matningar.some((m) => m.visatVarde === värde)) {
        allaPlusBelagda = false;
        console.error(`   ${bild.fil}: "${post.tal}" saknar mätning`);
      }
    }
  }
}
check('varje tal skrivet som "N+" har en mätning bakom sig', allaPlusBelagda);

console.log("\n--- Ramen ---");
const { ritaEnBild } = await import("./generate-kanalbilder.mts");
const png = await ritaEnBild(bilder[0]);
// PNG:ns IHDR: bredd och höjd ligger som 32-bitars heltal från byte 16.
const bredd = png.readUInt32BE(16);
const hojd = png.readUInt32BE(20);
check("bilden är 1080×1920", bredd === 1080 && hojd === 1920, `blev ${bredd}×${hojd}`);

if (errors > 0) {
  console.error(`\ntest-kanalbilder: ${errors} grind(ar) föll`);
  process.exit(1);
}
console.log("\ntest-kanalbilder: alla grindar gröna");
