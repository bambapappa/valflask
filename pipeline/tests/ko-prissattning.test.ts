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
import { provaEstimatet, byggSpara } from "../scripts/ko-prissattning.mts";
import type { CostEstimate } from "../src/cost.ts";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lasFillage } from "../src/datatransaktion.ts";

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

test("köprissättningens checkpoint binder kö, anmärkningar och löftesbestånd", () => {
  const dir = mkdtempSync(join(tmpdir(), "ko-prissatt-checkpoint-"));
  try {
    writeFileSync(join(dir, "needs_review.json"), "[]\n");
    writeFileSync(join(dir, "promises.json"), "[]\n");
    const fore = lasFillage(dir, ["needs_review.json", "ko_prissattning_anmarkningar.json", "promises.json"]);
    const poster = [post("Nytt löfte", "Vi vill göra något.")];
    const anmarkningar = [{ titel: "behöver granskas" }];
    const spara = byggSpara(dir, fore, poster, anmarkningar);
    spara();
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8")), poster);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "ko_prissattning_anmarkningar.json"), "utf8")), anmarkningar);
    poster.push(post("Nästa löfte", "Vi vill göra mer."));
    writeFileSync(join(dir, "promises.json"), '[{"id":"annan"}]\n');
    assert.throws(spara, /föreläge har ändrats/u);
    assert.equal(JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8")).length, 1);
    assert.equal(JSON.parse(readFileSync(join(dir, "ko_prissattning_anmarkningar.json"), "utf8")).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
