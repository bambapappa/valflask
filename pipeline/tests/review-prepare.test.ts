import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { prepareToFile, type ReviewCandidate } from "../src/review.ts";
import { tillampaLoftesforslag, type PromiseEntry } from "../src/loftesforslag.ts";
const data = join(import.meta.dirname, "../../data");
const files = ["promises.json", "needs_review.json", "changelog.json", "provningar.json"];
const queue: ReviewCandidate[] = JSON.parse(readFileSync(join(data, "needs_review.json"), "utf8"));
const index = queue.findIndex((p) => p.candidate?.quote && p.cost?.calculation && p.cost.calculation.length <= 800);
assert.ok(index >= 0, "riktig köpost krävs");
const item = queue[index]!;
const promises: PromiseEntry[] = JSON.parse(readFileSync(join(data, "promises.json"), "utf8"));
const target = promises.find((p) => p.status === "aktiv" && !p.group_id)!;
assert.ok(target);

it("prepare-kommandot sparar slutformen utan att ändra data eller kö", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-prepare-cli-"));
  const before = files.map((file) => readFileSync(join(data, file)));
  try {
    const out = join(dir, "forslag.json");
    const result = spawnSync(process.execPath, ["--import", "tsx/esm", "src/review.ts", "prepare", out, String(index), "--group", target.id], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const proposal = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(proposal.nyttLofte.quote, item.candidate.quote);
    assert.equal(proposal.gruppandring.id, target.id);
    assert.match(result.stdout, /Inget godkännande eller publicering/);
    const after = tillampaLoftesforslag(proposal, promises, item, proposal.hash);
    assert.deepEqual(after.find((p) => p.id === proposal.nyttLofte.id), proposal.nyttLofte);
    files.forEach((file, i) => assert.deepEqual(readFileSync(join(data, file)), before[i], file));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("förberedelse kräver ingen prövning och kan inte skriva över tidigare underlag", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-prepare-"));
  try {
    writeFileSync(join(dir, "promises.json"), JSON.stringify(promises));
    writeFileSync(join(dir, "needs_review.json"), JSON.stringify([item]));
    writeFileSync(join(dir, "provningar.json"), JSON.stringify({ poster: [] }));
    const out = join(dir, "forslag.json");
    const result = prepareToFile(["0", "--group", target.id], out, dir);
    assert.equal(result.nyttLofte.quote, item.candidate.quote);
    const saved = readFileSync(out);
    assert.throws(() => prepareToFile(["0", "--group", target.id], out, dir), /EEXIST/);
    assert.deepEqual(readFileSync(out), saved);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "provningar.json"), "utf8")), { poster: [] });
    assert.equal(existsSync(join(dir, "changelog.json")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("källfel eller tom kö stoppar förberedelsen utan utdata", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-prepare-fel-"));
  try {
    writeFileSync(join(dir, "promises.json"), JSON.stringify(promises));
    const wrongSource = structuredClone(item);
    wrongSource.articleUrl = "https://moderaterna.se/var-politik/bolaneskatt/";
    wrongSource.candidate.parties = ["s"];
    for (const [items, expected] of [[[wrongSource], /Källan tillhör ett annat parti/], [[], /Ogiltigt index/]] as const) {
      writeFileSync(join(dir, "needs_review.json"), JSON.stringify(items));
      const out = join(dir, "forslag.json");
      const code = `import {prepareToFile} from './src/review.ts'; prepareToFile(['0'], ${JSON.stringify(out)}, ${JSON.stringify(dir)});`;
      const result = spawnSync(process.execPath, ["--import", "tsx/esm", "-e", code], { encoding: "utf8" });
      assert.notEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, expected);
      assert.equal(existsSync(out), false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
