import Ajv from "ajv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getParties, getConstants } from "../src/lib/data.ts";
import type { PromisePost } from "../src/lib/data.ts";
import { runInNewContext } from "node:vm";
import { buildSummary, coalitionAggregates, promiseNetMsek } from "../src/lib/aggregates.ts";
import { formatMsek } from "../src/lib/calc.ts";
import { formatPromiseCost, kostnadsluckor, apiCost, formatPromiseNetCost } from "../src/lib/kostnadsvisning.ts";
import { promiseOgBelopp, summaryOgBelopp } from "./generate-og.mts";
const posts = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8")) as PromisePost[];

test("verkligt bestånd behåller sin befintliga beloppspresentation", () => {
  assert.ok(posts.length > 4000);
  assert.equal(kostnadsluckor(posts).antal, 0);
  for (const p of posts) {
    assert.equal(promiseOgBelopp(p), formatPromiseCost(p).toUpperCase());
    assert.equal(formatPromiseNetCost(p), formatMsek(promiseNetMsek(p), p.cost.basis));
    assert.equal(apiCost(p).msek_base, p.cost.msek_base);
    assert.equal(apiCost(p).msek_low, p.cost.msek_low);
    assert.equal(apiCost(p).msek_high, p.cost.msek_high);
    assert.equal(formatPromiseCost(p), formatMsek(p.cost.msek_base * (p.cost.period === "per_ar" ? 4 : 1), p.cost.basis));
  }
});

test("obestämbart belopp skiljs från metodnolla och indragna luckor", () => {
  const p = posts.find(p => p.id === "p-2026-2944")!;
  assert.ok(p);
  const unknown: PromisePost = {...p, cost: {...p.cost, msek_base: 0, msek_low: 0, msek_high: 0,
    harledning: {version: "harledning/1", led: [], arsprofil: {status: "okand", skal: "Syntetisk testprofil"}, belopp_okant: {skal: "Syntetiskt testunderlag saknas"}}}};
  assert.equal(summaryOgBelopp([unknown], 0), "OKÄNT");
  assert.equal(summaryOgBelopp([], 0), "0 MKR");
  assert.notEqual(summaryOgBelopp([p], p.cost.msek_base), "OKÄNT");
  const summary = buildSummary([unknown, {...unknown, id: "withdrawn-fixture", status: "tillbakadragen"}], getParties(), getConstants(), []);
  assert.equal(summary.ofullstandig_summa, true);
  assert.equal(summary.total_msek_flasket, null);
  assert.equal(summary.financing_gap_msek, null);
  assert.equal(summary.parties.find(x => x.code === "c")!.total_msek, null);
  assert.deepEqual(summary.okanda_loften, [p.id]);
  assert.equal(summary.antal_okanda_belopp, 1);
  assert.equal(summary.parties.find(x => x.code === "c")!.ofullstandig_summa, true);
  assert.equal(summary.parties.find(x => x.code === "c")!.per_vote, null);
  assert.equal(typeof summary.parties.find(x => x.code === "s")!.per_vote, "number");
  assert.equal(summary.parties.find(x => x.code === "s")!.ofullstandig_summa, undefined);
  assert.equal(buildSummary(posts, getParties(), getConstants(), []).ofullstandig_summa, undefined);
  const zero: PromisePost = {...p, cost: {...p.cost, msek_base: 0, msek_low: 0, msek_high: 0}};
  assert.equal(formatPromiseNetCost(unknown), "Kan inte fastställas");
  assert.equal(promiseOgBelopp(unknown), "OKÄNT");
  assert.notEqual(promiseOgBelopp(zero), "OKÄNT");
  const api = apiCost(unknown);
  assert.equal(api.msek_base, null);
  assert.equal(api.msek_low, null);
  assert.equal(api.msek_high, null);
  assert.equal(api.belopp_status, "okant");
  assert.equal(api.belopp_skal, unknown.cost.harledning!.belopp_okant!.skal);
  assert.equal(apiCost(zero).msek_base, 0);
  assert.equal(formatPromiseCost(unknown), "Kan inte fastställas");
  assert.equal(formatPromiseCost(unknown, "grund"), "Kan inte fastställas");
  assert.notEqual(formatPromiseCost(unknown), formatPromiseCost(zero));
  assert.deepEqual(kostnadsluckor([unknown, zero, {...unknown, id: "withdrawn-fixture", status: "tillbakadragen"}]), {antal: 1, ids: [p.id]});
});


test("Byggd kombinator och server varnar för vald okänd post utan falskt gruppspann", async () => {
  const seed = posts.find(p => p.id === "p-2026-2944")!;
  const unknown: PromisePost = {...seed, group_id: "syntetisk-grupp", cost: {...seed.cost, msek_base: 0, msek_low: 0, msek_high: 0,
    harledning: {version: "harledning/1", led: [], arsprofil: {status: "okand", skal: "Test"}, belopp_okant: {skal: "Test"}}}};
  const known = {...seed, id: "syntetisk-kand", group_id: unknown.group_id};
  const fixture = [unknown, known];
  const a = coalitionAggregates(fixture, getParties(), ["c"]);
  assert.deepEqual(a.okanda_loften, [unknown.id]);
  assert.deepEqual(a.groupNotes, []);
  const summary = buildSummary(fixture, getParties(), getConstants(), []);
  const result = {innerHTML: ""};
  const cb = {value: "c", checked: false, addEventListener() {}};
  let init: () => Promise<void>;
  runInNewContext(readFileSync(new URL("../public/kombinator.js", import.meta.url), "utf8"), {
    document: {
      getElementById: (id: string) => id === "kombinator" ? {querySelectorAll: () => [cb]} : result,
      addEventListener: (_event: string, fn: typeof init) => {init = fn;},
    },
    window: {location: {search: "?parties=c"}}, URLSearchParams,
    fetch: async (url: string) => ({json: async () => ({data: url.includes("summary") ? summary : fixture.map(p => ({...p, cost: apiCost(p)}))})}),
  });
  await init!();
  assert.ok(result.innerHTML.includes("Summorna är ofullständiga"));
  assert.ok(result.innerHTML.includes("För 1 löften"));
  assert.ok(!result.innerHTML.includes("partierna har olika prislapp"));
});


test("OpenAPI validerar verkliga kostnader och avvisar falska okänd/noll-kombinationer", () => {
  const spec = JSON.parse(readFileSync(new URL("../public/api/v1/openapi.json", import.meta.url), "utf8"));
  assert.equal(spec.paths["/api/v1/promises.json"].get.responses["200"].content["application/json"].schema.properties.data.items.properties.cost.$ref, "#/components/schemas/PromiseCost");
  const validate = new Ajv({strict: false}).compile(spec.components.schemas.PromiseCost);
  for (const p of posts) assert.ok(validate(apiCost(p)), JSON.stringify(validate.errors));
  const valid = {msek_low: null, msek_base: null, msek_high: null, belopp_status: "okant", belopp_skal: "Underlag saknas"};
  assert.ok(validate(valid));
  assert.ok(validate({msek_low: 0, msek_base: 0, msek_high: 0}));
  for (const bad of [
    {...valid, msek_base: 0}, {...valid, belopp_skal: ""},
    {...valid, belopp_status: "annat"}, {msek_low: null, msek_base: null, msek_high: null},
    {msek_low: 0, msek_base: "0", msek_high: 0},
    {msek_low: 0, msek_high: 0},
  ]) assert.equal(validate(bad), false, JSON.stringify(bad));
});
