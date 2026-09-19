import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
it("nära backfill blir förslag, publicerade filer bevaras och omkörning ger ingen dubblett", () => {
  const root = mkdtempSync(join(tmpdir(), "backfill-cli-")), d = join(root, "data"), p = join(root, "pipeline");
  try {
    mkdirSync(d); mkdirSync(join(p, "scripts"), { recursive: true });
    for (const n of ["src", "schemas", "prompts"]) cpSync(join(import.meta.dirname, "..", n), join(p, n), { recursive: true });
    cpSync(join(import.meta.dirname, "../package.json"), join(p, "package.json"));
    cpSync(join(import.meta.dirname, "../scripts/calculation-backfill.mts"), join(p, "scripts/calculation-backfill.mts"));
    symlinkSync(join(import.meta.dirname, "../node_modules"), join(p, "node_modules"), "dir");
    const all = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8"));
    const post = all.find((x: { cost: { basis: string; msek_base: number }; status: string }) => x.status === "aktiv" && x.cost.basis === "llm_estimat" && x.cost.msek_base > 0);
    assert.ok(post); delete post.cost.calculation;
    writeFileSync(join(d, "promises.json"), JSON.stringify([post]));
    for (const n of ["changelog.json", "rattelser.json"]) writeFileSync(join(d, n), "[]");
    writeFileSync(join(d, "calculation_review.json"), JSON.stringify([{ id: "tidigare" }]));
    const files = ["promises.json", "changelog.json", "rattelser.json"];
    const fore = files.map((n) => readFileSync(join(d, n), "utf8"));
    const run = (dry = false) => spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/calculation-backfill.mts", "--stub", "--all", "--rounds=1", "--factor=1000000000000", ...(dry ? ["--dry-run"] : [])], { cwd: p, encoding: "utf8" });
    let r = run(true); assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(d, "calculation_review.json"), "utf8")), [{ id: "tidigare" }]);
    r = run(); assert.equal(r.status, 0, r.stderr);
    const queue = JSON.parse(readFileSync(join(d, "calculation_review.json"), "utf8"));
    assert.equal(queue.length, 2, r.stdout); assert.equal(queue[1].near, true); assert.equal(queue[1].status, "needs_review");
    assert.deepEqual(queue[1].published, post); assert.ok(queue[1].reestimated.calculation);
    r = run(); assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(d, "calculation_review.json"), "utf8")), queue);
    files.forEach((n, i) => assert.equal(readFileSync(join(d, n), "utf8"), fore[i]));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
