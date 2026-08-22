/**
 * Vaktar att läslistan över motiveringar som inte talar om sitt eget citat
 * bara krymper.
 *
 * Bevisbytet 7–8 augusti 2026 bytte citatet men inte förklaringen. Skulden
 * mättes 2026-08-22 och betas av i pass; taket finns för att den ska krympa
 * och inte växa tyst när nya kopplingar godkänns.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { egnaOrd, laslistan, tackning, GLAPPTROSKEL } from "../src/motiveringsglappet.ts";
import type { KopplingPost } from "../src/granskning.ts";

const ROT = resolve(import.meta.dirname, "../..");

const koppling = (method_note: string, citat: string): KopplingPost =>
  ({ id: "k-1", status: "aktiv", method_note, bevis: { citat } }) as KopplingPost;

test("verktygens egna noter räknas inte som motiveringens ord", () => {
  assert.equal(egnaOrd("Motionen yrkar på saken. Beviset byttes 2026-08-07 mot handlingens egen lydelse.").trim(), "Motionen yrkar på saken.");
  assert.equal(egnaOrd("Motionen yrkar. Motionens anslagsyrkande anvisar anslagen enligt tabellen.").trim(), "Motionen yrkar.");
  assert.equal(egnaOrd(undefined), "");
});

test("böjningsformer räknas som samma ord", () => {
  // Den första mätningen saknade stamning och räknade «punktmarkering» och
  // «punktmarkera» som skilda ord. Måttet ska följa registrets egna regler.
  const t = tackning(
    koppling(
      "Motionen föreslår punktmarkering av unga som riskerar kriminalitet.",
      "Riksdagen ställer sig bakom det som anförs i motionen om att punktmarkera unga på väg in i kriminalitet.",
    ),
  );
  assert.ok(t !== null && t >= GLAPPTROSKEL, `täckningen blev ${t} — böjningen slår igenom`);
});

test("en motivering som talar om något annat hamnar på listan", () => {
  const t = tackning(
    koppling(
      "Motionen föreslår grundlagsskydd för public service.",
      "Riksdagen ställer sig bakom det som anförs i motionen om ett nytt säkerhetspolitiskt läge och behovet av tryggad finansiering.",
    ),
  );
  assert.ok(t !== null && t < GLAPPTROSKEL, `täckningen blev ${t}`);
});

test("en för kort motivering mäts inte i stället för att mätas fel", () => {
  assert.equal(tackning(koppling("Samma sak.", "Ett citat om något helt annat och längre.")), null);
});

test("läslistan växer inte", () => {
  const tak = JSON.parse(readFileSync(resolve(ROT, "data/motiveringsglappet.json"), "utf8"));
  const kopplingar: KopplingPost[] = JSON.parse(readFileSync(resolve(ROT, "data/kopplingar.json"), "utf8"));
  const nu = laslistan(kopplingar);
  assert.ok(
    nu.length <= tak.laslistan,
    `${nu.length} motiveringar talar inte om sitt eget citat — taket är ${tak.laslistan}, mätt ` +
      `${tak.matt}. Betas listan av med \`npm run motivering\` ska taket sänkas i samma körning; ` +
      "växer den ska den nya posten läsas om, inte taket höjas.",
  );
  // Blankprovet: en tom lista över ett tomt register intygar ingenting.
  assert.ok(
    kopplingar.filter((k) => k.status === "aktiv").length > 500,
    "för få aktiva kopplingar lästa — provet mäter då ingenting",
  );
});
