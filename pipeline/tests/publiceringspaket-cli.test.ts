import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const pipeline = resolve(import.meta.dirname, "..");
const repo = resolve(pipeline, "..");
const files = ["data/promises.json", "data/stances.json", "handlingsvagen/data/kopplingar.json", "handlingsvagen/data/handlingar.json"];

test("kommandot binder verkliga commit-versioner och lämnar lokala data orörda", () => {
  const temp = mkdtempSync(join(tmpdir(), "publiceringspaket-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", temp, ...args], { encoding: "utf8" });
  const run = (...refs: string[]) => spawnSync(process.execPath, ["--import", "tsx/esm",
    "scripts/publiceringspaket.mts", temp, ...refs], { cwd: pipeline, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  try {
    for (const file of files) {
      mkdirSync(dirname(join(temp, file)), { recursive: true });
      writeFileSync(join(temp, file), readFileSync(join(repo, file)));
    }
    git("init", "-q");
    const commit = () => {
      git("add", "data", "handlingsvagen");
      git("-c", "user.name=Prov", "-c", "user.email=prov@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Underlag");
      return git("rev-parse", "HEAD").trim();
    };
    const fore = commit();
    const promises = JSON.parse(readFileSync(join(temp, files[0]!), "utf8"));
    const promise = promises.find((p: any) => p.status === "aktiv" && p.cost.anchor_ids?.length);
    assert.ok(promise);
    promises.find((p: any) => p.id === promise.cost.anchor_ids[0]).cost.msek_base += 1;
    writeFileSync(join(temp, files[0]!), JSON.stringify(promises));
    const efter = commit();
    writeFileSync(join(temp, files[0]!), "Avsiktligt trasig lokal JSON");
    const result = run(fore, efter);
    assert.equal(result.status, 0, result.stderr);
    const packet = JSON.parse(result.stdout);
    assert.equal(packet.foreRevision, fore);
    assert.equal(packet.efterRevision, efter);
    assert.equal(packet.andringar.find((p: any) => p.rot === `lofte:${promise.id}`).direkt, false);
    assert.equal(readFileSync(join(temp, files[0]!), "utf8"), "Avsiktligt trasig lokal JSON");
    assert.equal(run(fore, "saknad-revision").status, 1);
    assert.equal(run(fore, "--help").status, 1);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
