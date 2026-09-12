import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const pipeline = resolve(import.meta.dirname, "..");
const repo = resolve(pipeline, "..");
const files = ["data/promises.json", "data/parties.json", "site/src/lib/aggregates.ts", "data/stances.json", "handlingsvagen/data/kopplingar.json", "handlingsvagen/data/handlingar.json"];

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
      git("add", "data", "handlingsvagen", "site");
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
    assert.deepEqual(packet.filer.sokvagar, ["data/promises.json"]);
    assert.ok(packet.filer.patch.includes("diff --git a/data/promises.json"));
    assert.equal(packet.efterRevision, efter);
    assert.equal(packet.summor.fore.revision, fore);
    assert.equal(packet.summor.efter.revision, efter);
    assert.ok(Number.isFinite(packet.summor.efter.utgifter));
    assert.equal(packet.andringar.find((p: any) => p.rot === `lofte:${promise.id}`).direkt, false);
    assert.equal(readFileSync(join(temp, files[0]!), "utf8"), "Avsiktligt trasig lokal JSON");
    // En ändring utanför postregistren får aldrig se ut som ett tomt publiceringspaket.
    writeFileSync(join(temp, files[0]!), JSON.stringify(promises));
    const partiesPath = join(temp, "data/parties.json");
    const parties = JSON.parse(readFileSync(partiesPath, "utf8"));
    assert.ok(parties.length > 0);
    parties[0].name = "Ändrat partinamn";
    writeFileSync(partiesPath, JSON.stringify(parties));
    const tredje = commit();
    const onlyFile = run(efter, tredje);
    assert.equal(onlyFile.status, 0, onlyFile.stderr);
    const filePacket = JSON.parse(onlyFile.stdout);
    assert.equal(filePacket.andringar.length, 0);
    assert.deepEqual(filePacket.filer.sokvagar, ["data/parties.json"]);
    assert.ok(filePacket.filer.patch.includes("Ändrat partinamn"));
    assert.equal(filePacket.summor.efter.partier[0].namn, "Ändrat partinamn");
    const html = run(efter, tredje, "--html");
    assert.equal(html.status, 0, html.stderr);
    assert.ok(html.stdout.includes("Summor för mandatperioden"));
    assert.ok(html.stdout.includes("Ändrat partinamn: finansieringsgap"));
    assert.notEqual(filePacket.hash, JSON.parse(run(efter, efter).stdout).hash);
    assert.equal(run(fore, "saknad-revision").status, 1);
    assert.equal(run(fore, "--help").status, 1);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
