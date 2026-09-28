import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const skydd = resolve(import.meta.dirname, "../scripts/arkiv-pushskydd.sh");

test("arkivjobbet får ta med orelaterad main-ändring men stoppar en nyare verifiering", () => {
  const rot = mkdtempSync(join(tmpdir(), "arkiv-pushskydd-"));
  const cwd = join(rot, "handlingsvagen");
  const git = (...args: string[]) => {
    const run = spawnSync("git", args, { cwd: rot, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout.trim();
  };
  try {
    mkdirSync(join(cwd, "data"), { recursive: true });
    writeFileSync(join(cwd, "data/arkiv.json"), "[]\n");
    writeFileSync(join(rot, "README.md"), "start\n");
    git("init", "-q");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.invalid");
    git("add", ".");
    git("commit", "-qm", "start");
    const start = git("rev-parse", "HEAD");
    writeFileSync(join(rot, "README.md"), "annan kod\n");
    git("add", ".");
    git("commit", "-qm", "annan kod");
    const safe = spawnSync("bash", [skydd, start, "HEAD"], { cwd, encoding: "utf8" });
    assert.equal(safe.status, 0, safe.stderr);

    writeFileSync(join(cwd, "data/arkiv.json"), '[{"id":"nyare","verifierad":true}]\n');
    git("add", ".");
    git("commit", "-qm", "nyare verifiering");
    const stale = spawnSync("bash", [skydd, start, "HEAD"], { cwd, encoding: "utf8" });
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /Arkivfilen ändrades/);
  } finally {
    rmSync(rot, { recursive: true, force: true });
  }
});
