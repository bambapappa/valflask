import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
it("äldre artefakt kan bara tillföra granskningsförslag och bevarar nuvarande kö", () => {
  const root = mkdtempSync(join(tmpdir(), "kalkylartifact-")), a = join(root, "artifact"), d = join(root, "data");
  try {
    mkdirSync(a); mkdirSync(d);
    for (const n of ["promises.json", "changelog.json", "rattelser.json"]) {
      writeFileSync(join(d, n), "ORIGINAL"); writeFileSync(join(a, n), "GAMMAL ARTEFAKT");
    }
    writeFileSync(join(d, "calculation_review.json"), JSON.stringify([{ id: "befintlig" }]));
    writeFileSync(join(a, "calculation_review.json"), JSON.stringify([{ id: "ny" }]));
    const run = () => spawnSync("python3", [new URL("../scripts/import-calculation-review.py", import.meta.url).pathname, a, join(d, "calculation_review.json")], { encoding: "utf8" });
    assert.equal(run().status, 0); assert.equal(run().status, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(d, "calculation_review.json"), "utf8")), [{ id: "befintlig" }, { id: "ny" }]);
    for (const n of ["promises.json", "changelog.json", "rattelser.json"]) assert.equal(readFileSync(join(d, n), "utf8"), "ORIGINAL");
    const fore = readFileSync(join(d, "calculation_review.json"), "utf8");
    writeFileSync(join(a, "calculation_review.json"), "{}"); assert.notEqual(run().status, 0);
    assert.equal(readFileSync(join(d, "calculation_review.json"), "utf8"), fore);
    const yaml = readFileSync(new URL("../../.github/workflows/calculation-backfill.yml", import.meta.url), "utf8");
    assert.match(yaml, /python3 pipeline\/scripts\/import-calculation-review\.py artifact-data data\/calculation_review\.json/u);
    assert.doesNotMatch(yaml, /data\/(promises|changelog|rattelser)\.json|git add -A data\//u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
