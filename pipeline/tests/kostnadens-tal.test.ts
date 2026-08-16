import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCost } from "../src/cost.ts";
import type { LlmClient } from "../src/llm.ts";

/**
 * Kostnadssteget föll när modellen svarade med rätt tal i fel form.
 *
 * `finiteNum` krävde `typeof v === "number"`. Svarade modellen `"1200"` eller
 * `"1 200"` kastades hela svaret, och posten fick `failedCost`: belopp 0 och
 * tom uträkning. **En nolla i datat går inte att skilja från ett omdöme om att
 * löftet är gratis** — kostnadsreglerna nollar ju lagar, förbud och
 * utredningslöften med flit. Nitton av 79 poster i kön 2026-08-16 låg där, och
 * fyra av dem var skatte- och fortbildningslöften.
 *
 * Provet mäter regeln, inte de fyra strängarna: *ett värde som betecknar exakt
 * ett tal ska räknas, och ett värde som betecknar mer än ett tal ska falla.*
 * Det senare är hälften av provet med flit — en tolerant parser som sväljer
 * «100-200» hittar på en siffra åt oss, och det är värre än att falla.
 */

function svarar(payload: Record<string, unknown>): LlmClient {
  return { complete: async () => JSON.stringify(payload) } as unknown as LlmClient;
}

const LOFTE = {
  title: "Ett löfte",
  quote: "Vi vill göra en sak som kostar pengar.",
  category: "välfärd",
  parties: ["kd"],
  person: null,
  amount_in_text_msek: null,
  financing_mentioned: false,
} as never;

const UTRAKNING = "Antag 100 000 mottagare × 12 000 kr ≈ 1 200 mkr.";

async function kor(low: unknown, base: unknown, high: unknown) {
  return estimateCost(
    LOFTE,
    svarar({
      msek_low: low,
      msek_base: base,
      msek_high: high,
      type: "utgift",
      period: "per_ar",
      method_note: "n",
      calculation: UTRAKNING,
      confidence: 0.5,
    }),
    "modell",
  );
}

const HAVERI = /belopp MÅSTE sättas manuellt/u;

test("talet räknas när värdet betecknar exakt ett tal — oavsett form", async () => {
  const fall: Array<[string, unknown, unknown, unknown, number]> = [
    ["rena tal", 800, 1200, 1600, 1200],
    ["numeriska strängar", "800", "1200", "1600", 1200],
    ["tusentalsrymd", "800", "1 200", "1 600", 1200],
    ["hårt blanksteg", "800", "1 200", "1 600", 1200],
    // Estimatorn avrundar till hela mkr sedan tidigare; poängen här är att
    // decimaltecknet inte får kasta hela svaret. 1,5 → 2 är avrundningen,
    // inte ett tappat tal.
    ["svenskt decimaltecken", "0,5", "1,5", "2,5", 2],
    ["decimalpunkt", "800.4", "1200.4", "1600.4", 1200],
    ["ungefärstecken", "~800", "ca 1200", "cirka 1600", 1200],
  ];
  for (const [namn, low, base, high, vantat] of fall) {
    const c = await kor(low, base, high);
    assert.equal(c.msek_base, vantat, `${namn}: fel belopp`);
    assert.doesNotMatch(c.method_note, HAVERI, `${namn}: skulle inte ha havererat`);
    assert.equal(c.calculation, UTRAKNING, `${namn}: uträkningen ska följa med`);
  }
});

test("ett värde som betecknar MER än ett tal ska fortfarande falla", async () => {
  const tvetydiga: Array<[string, unknown]> = [
    ["spann", "100-200"],
    ["övre gräns", "upp till 100"],
    ["undre gräns", "minst 100"],
    ["tom sträng", ""],
    ["ord", "okänt"],
    ["null", null],
    ["lista", [100, 200]],
  ];
  for (const [namn, v] of tvetydiga) {
    const c = await kor("800", v, "1600");
    assert.equal(c.msek_base, 0, `${namn}: ska inte ge ett belopp`);
    assert.match(c.method_note, HAVERI, `${namn}: ska falla synligt`);
  }
});

test("haveriet lämnar uträkningen tom, så godkännandevägen stoppar posten", async () => {
  const c = await kor("800", "okänt", "1600");
  assert.equal((c.calculation ?? "").trim(), "");
});
