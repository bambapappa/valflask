import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const pipeline = resolve(import.meta.dirname, "..");
const repo = resolve(pipeline, "..");
const files = ["data/promises.json", "data/stances.json", "handlingsvagen/data/kopplingar.json", "handlingsvagen/data/handlingar.json"];
const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/bundet-underlag.mts", ...args], { cwd: pipeline, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });

test("kommandot upptäcker ett ändrat verkligt kalkylankare utan att skriva i datat", () => {
  const temp = mkdtempSync(join(tmpdir(), "bundet-underlag-"));
  try {
    const promises = JSON.parse(readFileSync(join(repo, files[0]!), "utf8"));
    const promise = promises.find((p: any) => p.status === "aktiv" && p.cost.anchor_ids?.length);
    assert.ok(promise?.id);
    const created = run("skapa", repo, `lofte:${promise.id}`);
    assert.equal(created.status, 0, created.stderr);
    const packet = join(temp, "paket.json");
    writeFileSync(packet, created.stdout);
    const unchanged = run("kontrollera", repo, packet);
    assert.equal(unchanged.status, 0, unchanged.stderr);
    for (const file of files) {
      mkdirSync(dirname(join(temp, file)), { recursive: true });
      writeFileSync(join(temp, file), readFileSync(join(repo, file)));
    }
    const anchor = promises.find((p: any) => p.id === promise.cost.anchor_ids[0]);
    anchor.cost.msek_base += 1;
    writeFileSync(join(temp, files[0]!), JSON.stringify(promises));
    const before = files.map((file) => readFileSync(join(temp, file), "utf8"));
    const changed = run("kontrollera", temp, packet);
    assert.equal(changed.status, 1, changed.stdout);
    assert.match(changed.stderr, /ny prövning krävs/u);
    assert.deepEqual(files.map((file) => readFileSync(join(temp, file), "utf8")), before);
    assert.equal(run("skapa", temp, "lofte:saknas").status, 1);
    writeFileSync(packet, "{}");
    assert.equal(run("kontrollera", temp, packet).status, 1);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
