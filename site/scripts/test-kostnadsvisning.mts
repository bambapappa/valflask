import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { PromisePost } from "../src/lib/data.ts";
import { formatMsek } from "../src/lib/calc.ts";
import { formatPromiseCost, kostnadsluckor } from "../src/lib/kostnadsvisning.ts";
const posts = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8")) as PromisePost[];

test("verkligt bestånd behåller sin befintliga beloppspresentation", () => {
  assert.ok(posts.length > 4000);
  assert.equal(kostnadsluckor(posts).antal, 0);
  for (const p of posts) {
    assert.equal(formatPromiseCost(p), formatMsek(p.cost.msek_base * (p.cost.period === "per_ar" ? 4 : 1), p.cost.basis));
  }
});

test("obestämbart belopp skiljs från metodnolla och indragna luckor", () => {
  const p = posts.find(p => p.id === "p-2026-2944")!;
  assert.ok(p);
  const unknown: PromisePost = {...p, cost: {...p.cost, msek_base: 0, msek_low: 0, msek_high: 0,
    harledning: {version: "harledning/1", led: [], arsprofil: {status: "okand", skal: "Syntetisk testprofil"}, belopp_okant: {skal: "Syntetiskt testunderlag saknas"}}}};
  const zero: PromisePost = {...p, cost: {...p.cost, msek_base: 0, msek_low: 0, msek_high: 0}};
  assert.equal(formatPromiseCost(unknown), "Kan inte fastställas");
  assert.equal(formatPromiseCost(unknown, "grund"), "Kan inte fastställas");
  assert.notEqual(formatPromiseCost(unknown), formatPromiseCost(zero));
  assert.deepEqual(kostnadsluckor([unknown, zero, {...unknown, id: "withdrawn-fixture", status: "tillbakadragen"}]), {antal: 1, ids: [p.id]});
});
