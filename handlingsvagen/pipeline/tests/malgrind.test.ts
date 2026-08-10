/**
 * Två sorters prov i samma fil, med flit.
 *
 * Reglerna prövas mot påhittade poster, som all annan logik här. Sist prövas
 * det INCHECKADE datat mot samma funktion — det är där larmet faktiskt går, och
 * utan den raden är grinden bara en funktion ingen kallar. Samma uppdelning som
 * `domar-aktuell.test.ts`: regeln och verkligheten prövas var för sig.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { KopplingPost } from "../src/granskning.ts";
import { hemlosaBelagg, larmtext, type MalUppgift } from "../src/malgrind.ts";

const ROT = resolve(import.meta.dirname, "..", "..");

function koppling(over: Partial<KopplingPost>): KopplingPost {
  return {
    id: "k-0001",
    promise_id: "p-0001",
    handling_id: "h-0001",
    riktning: "stodjer",
    bevis: { citat: "…" },
    method_note: "…",
    confidence: 0.9,
    extraction: { model: "m", verified_by: "owner", run_id: "r" },
    status: "aktiv",
    ...over,
  };
}

const AKTIVT: MalUppgift[] = [{ id: "p-0001", status: "aktiv" }];

test("ett aktivt belägg mot ett publicerat löfte larmar inte", () => {
  assert.deepEqual(hemlosaBelagg([koppling({})], AKTIVT), []);
});

test("ett aktivt belägg mot ett tillbakadraget löfte larmar", () => {
  const fynd = hemlosaBelagg([koppling({})], [{ id: "p-0001", status: "tillbakadragen" }]);
  assert.deepEqual(fynd, [{ id: "k-0001", mal: "p-0001", slag: "tillbakadraget" }]);
});

test("ett aktivt belägg mot ett löfte som inte finns alls larmar", () => {
  const fynd = hemlosaBelagg([koppling({ promise_id: "p-9999" })], AKTIVT);
  assert.deepEqual(fynd, [{ id: "k-0001", mal: "p-9999", slag: "saknas" }]);
});

test("en indragen koppling larmar inte — den är redan avgjord", () => {
  const k = koppling({ status: "indragen", indragen: { datum: "2026-08-09", skal: "…" } });
  assert.deepEqual(hemlosaBelagg([k], [{ id: "p-0001", status: "tillbakadragen" }]), []);
});

test("en ståndpunktskoppling prövas inte — ståndpunkter lever i ett annat register", () => {
  const { promise_id: _utan, ...k } = koppling({ stance_id: "s-0001" });
  assert.deepEqual(hemlosaBelagg([k], []), []);
});

test("ett löfte utan utskriven status räknas som publicerat", () => {
  assert.deepEqual(hemlosaBelagg([koppling({})], [{ id: "p-0001" }]), []);
});

test("larmtexten samlar beläggen på sitt mål i stället för att radda upp dem", () => {
  const fynd = hemlosaBelagg(
    [koppling({ id: "k-0002" }), koppling({ id: "k-0001" })],
    [{ id: "p-0001", status: "tillbakadragen" }],
  );
  const text = larmtext(fynd);
  assert.match(text, /p-0001 är tillbakadraget men bär 2 aktiva belägg: k-0001, k-0002/u);
  assert.match(text, /peka-om/u);
  assert.match(text, /dra-in/u);
});

test("larmtexten säger ifrån tydligt när ingenting hittats", () => {
  assert.match(larmtext([]), /Inga aktiva belägg/u);
});

test("det incheckade datat har inga belägg mot tillbakadragna eller försvunna löften", () => {
  const kopplingar: KopplingPost[] = JSON.parse(
    readFileSync(resolve(ROT, "data", "kopplingar.json"), "utf8"),
  );
  const loften: MalUppgift[] = JSON.parse(
    readFileSync(resolve(ROT, "..", "data", "promises.json"), "utf8"),
  );
  const fynd = hemlosaBelagg(kopplingar, loften);
  assert.deepEqual(fynd, [], larmtext(fynd));
});
