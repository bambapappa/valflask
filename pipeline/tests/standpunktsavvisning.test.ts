import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, copyFileSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { lasFillage, skrivFilpaket } from "../src/datatransaktion.ts";
import { forberedStandpunktsavvisning, stanceReviewId, STANDPUNKTSAVVISNINGSFILER } from "../src/standpunktsavvisning.ts";
import type { StanceCandidate, StanceReviewEntry } from "../src/stance-pipeline.ts";

const verkligKo = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../data/stances_review.json"), "utf8")) as StanceReviewEntry[];
const post = verkligKo[0]!;
const kandidat = post.candidate as StanceCandidate;
assert.ok(post?.sourceUrl && kandidat?.quote);
const datum = new Date("2026-09-21T12:00:00Z");
const skal = "Sakfrågan täcks inte av citatets egen lydelse.";

test("avvisning av verklig kopierad köpost skriver kö och minne i ett journalfört paket", () => {
  const dir = mkdtempSync(join(tmpdir(), "standpunkt-avvisning-"));
  try {
    writeFileSync(join(dir, "stances_review.json"), JSON.stringify([post], null, 2) + "\n");
    writeFileSync(join(dir, "avvisade.json"), "[]\n");
    const fore = lasFillage(dir, STANDPUNKTSAVVISNINGSFILER);
    const paket = forberedStandpunktsavvisning(stanceReviewId(post), skal, fore, datum);
    assert.deepEqual(lasFillage(dir, STANDPUNKTSAVVISNINGSFILER), fore);
    skrivFilpaket(dir, paket);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "stances_review.json"), "utf8")), []);
    const minne = JSON.parse(readFileSync(join(dir, "avvisade.json"), "utf8"));
    assert.equal(minne.length, 1);
    assert.equal(minne[0].url, post.sourceUrl);
    assert.equal(minne[0].citat, kandidat.quote);
    assert.equal(minne[0].skal, skal);
    assert.equal(existsSync(join(dir, ".datatransaktion")), false);
    assert.throws(() => skrivFilpaket(dir, paket), /föreläge/u);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("trasigt minne, saknat citat och kort skäl lämnar kö och minne orörda", () => {
  const dir = mkdtempSync(join(tmpdir(), "standpunkt-avvisning-fel-"));
  try {
    const ko = JSON.stringify([post], null, 2) + "\n";
    writeFileSync(join(dir, "stances_review.json"), ko);
    writeFileSync(join(dir, "avvisade.json"), "{trasigt\n");
    const id = stanceReviewId(post);
    let fore = lasFillage(dir, STANDPUNKTSAVVISNINGSFILER);
    assert.throws(() => forberedStandpunktsavvisning(id, skal, fore, datum));
    assert.deepEqual(lasFillage(dir, STANDPUNKTSAVVISNINGSFILER), fore);
    writeFileSync(join(dir, "avvisade.json"), "[]\n");
    fore = lasFillage(dir, STANDPUNKTSAVVISNINGSFILER);
    assert.throws(() => forberedStandpunktsavvisning(id, "nej", fore, datum), /25/u);
    const utanCitat = structuredClone(post);
    (utanCitat.candidate as StanceCandidate).quote = "";
    writeFileSync(join(dir, "stances_review.json"), JSON.stringify([utanCitat]));
    fore = lasFillage(dir, STANDPUNKTSAVVISNINGSFILER);
    assert.throws(() => forberedStandpunktsavvisning(stanceReviewId(utanCitat), skal, fore, datum), /Citat|citat/u);
    assert.equal(readFileSync(join(dir, "stances_review.json"), "utf8"), fore["stances_review.json"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("verkligt stances:review-kommando stoppar trasigt minne före köändring", () => {
  const root = mkdtempSync(join(tmpdir(), "standpunkt-cli-"));
  try {
    const pipeline = resolve(import.meta.dirname, "..");
    const scripts = join(root, "pipeline", "scripts"), data = join(root, "data");
    mkdirSync(scripts, { recursive: true }); mkdirSync(data);
    copyFileSync(join(pipeline, "scripts", "stances-review.mts"), join(scripts, "stances-review.mts"));
    symlinkSync(join(pipeline, "src"), join(root, "pipeline", "src"), "dir");
    for (const name of ["issues.json", "stances.json"]) copyFileSync(resolve(pipeline, "..", "data", name), join(data, name));
    const ko = JSON.stringify([post], null, 2) + "\n";
    writeFileSync(join(data, "stances_review.json"), ko);
    writeFileSync(join(data, "avvisade.json"), "{trasigt\n");
    const run = () => spawnSync(process.execPath, ["--import", "tsx/esm", join(scripts, "stances-review.mts"), "reject", stanceReviewId(post), skal], { cwd: pipeline, encoding: "utf8" });
    assert.notEqual(run().status, 0);
    assert.equal(readFileSync(join(data, "stances_review.json"), "utf8"), ko);
    assert.equal(readFileSync(join(data, "avvisade.json"), "utf8"), "{trasigt\n");
    writeFileSync(join(data, "avvisade.json"), "[]\n");
    const ok = run(); assert.equal(ok.status, 0, ok.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(data, "stances_review.json"), "utf8")), []);
    assert.equal(JSON.parse(readFileSync(join(data, "avvisade.json"), "utf8"))[0].citat, kandidat.quote);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
