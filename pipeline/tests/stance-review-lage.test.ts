import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { lasStanceReview } from "../src/stance-review-lage.ts";

test("befintlig verklig kö bevaras; endast saknad fil betyder tom kö", () => {
  const dir = mkdtempSync(join(tmpdir(), "stance-review-lage-"));
  try {
    assert.deepEqual(lasStanceReview(dir), []);
    const data = readFileSync(resolve(import.meta.dirname, "../../data/stances_review.json"), "utf8");
    writeFileSync(join(dir, "stances_review.json"), data);
    const parsed = lasStanceReview(dir);
    assert.equal(parsed.length, JSON.parse(data).length);
    assert.deepEqual(parsed[0], JSON.parse(data)[0]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("trasigt, felstrukturerat eller länkat köunderlag stoppar innan publicering", () => {
  const dir = mkdtempSync(join(tmpdir(), "stance-review-fel-"));
  const fil = join(dir, "stances_review.json");
  try {
    for (const text of ["{trasigt", "{}", "[{}]", '[{"articleUrl":"https://example.test","failures":[]}]']) {
      writeFileSync(fil, text);
      assert.throws(() => lasStanceReview(dir));
    }
    rmSync(fil);
    const target = join(dir, "kalla.json");
    writeFileSync(target, "[]");
    symlinkSync(target, fil);
    assert.throws(() => lasStanceReview(dir), /vanlig fil/u);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
