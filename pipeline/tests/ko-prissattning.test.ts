/**
 * Grinden i kö-prissättningen: modellen får räkna, men inte bestämma.
 *
 * Provet vaktar det fel planen pekade ut innan jobbet byggdes — att en modell
 * som ombeds skriva en uträkning kan lösa uppgiften genom att göra motiveringen
 * bättre i stället för talet rätt. Fästs ett estimat vars uträkning inte landar
 * på sitt eget tal, eller som går förbi en siffra som står i citatet, har
 * grinden ingen verkan.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { provaEstimatet } from "../scripts/ko-prissattning.mts";
import type { CostEstimate } from "../src/cost.ts";

function post(titel: string, citat: string) {
  return {
    candidate: { title: titel, parties: ["m"], person: null, quote: citat,
                 category: "ekonomi", amount_in_text_msek: null },
    articleUrl: "https://moderaterna.se/var-politik/exempel/",
  };
}
function est(over: Partial<CostEstimate> = {}): CostEstimate {
  return {
    type: "utgift", period: "per_ar",
    msek_low: 500, msek_base: 1000, msek_high: 2000,
    basis: "llm_estimat", basis_url: null, confidence: 0.4,
    method_note: "jämförbara löften",
    calculation: "Antag 100 000 berörda × 10 000 kronor = 1 000 miljoner kronor per år.",
    ...over,
  } as CostEstimate;
}

test("ett estimat som håller fästs utan invändning", () => {
  const ut = provaEstimatet(post("Stötta X", "Vi vill stötta X kraftigt."), est());
  assert.deepEqual(ut, []);
});

test("partiets egen siffra i citatet får inte gås förbi", () => {
  const ut = provaEstimatet(
    post("Stöd till Berättarministeriet", "Vi vill förstärka stödet till Berättarministeriet till 30 miljoner kronor."),
    est({ msek_base: 2800, msek_low: 1400, msek_high: 5000 }),
  );
  assert.ok(
    ut.some((i) => i.kontroll === "partiets_siffra_forbigadd"),
    `förväntade partiets_siffra_forbigadd, fick: ${ut.map((i) => i.kontroll).join(", ") || "inget"}`,
  );
});

test("en uträkning som saknas stoppar posten", () => {
  const ut = provaEstimatet(post("Stötta X", "Vi vill stötta X."), est({ calculation: "" }));
  assert.ok(ut.some((i) => i.kontroll === "utrakningen_saknas"));
});

test("en uträkning över takets 800 tecken stoppas här, inte vid godkännandet", () => {
  const ut = provaEstimatet(post("Stötta X", "Vi vill stötta X."), est({ calculation: "a".repeat(801) }));
  assert.ok(ut.some((i) => i.kontroll === "utrakningen_for_lang"));
});

test("en intern beteckning i texten stoppas — den visas publikt", () => {
  const ut = provaEstimatet(
    post("Stötta X", "Vi vill stötta X."),
    est({ calculation: "Samma nivå som p-2026-1212, alltså 1 000 miljoner kronor per år." }),
  );
  assert.ok(ut.some((i) => i.kontroll === "intern_beteckning"));
});
