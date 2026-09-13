import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, cpSync, symlinkSync, readFileSync, rmSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { reviewId, type ReviewCandidate } from "../src/review.ts";
import type { PromiseEntry } from "../src/loftesforslag.ts";
import { tillampaKalkylforslag } from "../src/kalkylforslag.ts";
it("verklig kalkylförberedelse sparar privat förslag, skyddar omkörning och lämnar sakdata orörda", () => {
  const root = mkdtempSync(join(tmpdir(), "kalkyl-cli-")), data = join(root, "data"), pipeline = join(root, "pipeline");
  try {
    mkdirSync(data); mkdirSync(join(pipeline, "scripts"), { recursive: true });
    for (const fil of ["promises.json", "needs_review.json"]) cpSync(new URL(`../../data/${fil}`, import.meta.url), join(data, fil));
    for (const d of ["src", "schemas"]) cpSync(join(import.meta.dirname, "..", d), join(pipeline, d), { recursive: true });
    cpSync(join(import.meta.dirname, "../package.json"), join(pipeline, "package.json"));
    cpSync(join(import.meta.dirname, "../scripts/kalkyl-forbered.mts"), join(pipeline, "scripts/kalkyl-forbered.mts"));
    symlinkSync(join(import.meta.dirname, "../node_modules"), join(pipeline, "node_modules"), "dir");
    const before = ["promises.json", "needs_review.json"].map((f) => readFileSync(join(data, f), "utf8"));
    const loften: PromiseEntry[] = JSON.parse(before[0]!), ko: ReviewCandidate[] = JSON.parse(before[1]!);
    const k = ko.find((p) => p.candidate?.quote && !p.candidate.person && p.cost?.calculation && p.cost.calculation.length <= 800)!;
    const mal = loften.find((p) => p.status === "aktiv" && p.loftestyp === "reform" && !p.person && JSON.stringify([...p.parties].sort()) === JSON.stringify([...(k.candidate.parties ?? [])].sort()))!;
    assert.ok(mal);
    const ut = join(root, "forslag.json");
    const run = (id: string, target: string, out: string) => spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/kalkyl-forbered.mts", id, target, "Tekniskt prov; period och kostnadstyp följer den nya kalkylen.", out], { cwd: pipeline, encoding: "utf8" });
    const r = run(reviewId(k), mal.id, ut); assert.equal(r.status, 0, r.stderr);
    const bytes = readFileSync(ut, "utf8"), f = JSON.parse(bytes);
    assert.equal(statSync(ut).mode & 0o777, 0o600);
    assert.deepEqual(tillampaKalkylforslag(f, loften, k, f.hash).find((p) => p.id === mal.id), f.nyttLofte);
    assert.notEqual(run(reviewId(k), mal.id, ut).status, 0);
    assert.equal(readFileSync(ut, "utf8"), bytes);
    const fel = join(root, "fel.json");
    assert.notEqual(run("saknas", mal.id, fel).status, 0); assert.equal(existsSync(fel), false);
    const annan = loften.find((p) => p.status === "aktiv" && p.loftestyp === "reform" && p.parties[0] !== mal.parties[0])!;
    assert.notEqual(run(reviewId(k), annan.id, fel).status, 0); assert.equal(existsSync(fel), false);
    ["promises.json", "needs_review.json"].forEach((n, i) => assert.equal(readFileSync(join(data, n), "utf8"), before[i]));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
