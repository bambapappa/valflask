import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, readFileSync, writeFileSync, chmodSync, rmSync, existsSync } from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { kontrolleraPubliceringsartefakt } from "../src/publiceringsartefakt.ts";
import { publiceringsvy } from "../src/publiceringsvy.ts";

test("förberedelsen binder verkliga Git-data, vy och godkännandetext; okänd drift stoppar paketet", async () => {
  const dir = mkdtempSync(join(tmpdir(), "publiceringsforbered-"));
  const root = resolve(import.meta.dirname, "../..");
  const repo = join(dir, "repo");
  mkdirSync(repo);
  const git = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const g = (...args: string[]) => execFileSync(git, args, { cwd: repo, encoding: "utf8" });
  const commit = () => {
    g("add", "data", "site", "handlingsvagen");
    g("-c", "user.name=Prov", "-c", "user.email=prov@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Underlag");
    return g("rev-parse", "HEAD").trim();
  };
  try {
    for (const path of ["data/promises.json", "data/parties.json", "data/stances.json", "handlingsvagen/data/handlingar.json", "handlingsvagen/data/kopplingar.json", "site/src/lib/aggregates.ts"]) {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), readFileSync(join(root, path)));
    }
    symlinkSync(join(root, "pipeline"), join(repo, "pipeline"));
    g("init", "-q");
    const fore = commit();
    const partier = JSON.parse(readFileSync(join(repo, "data/parties.json"), "utf8"));
    partier[0].name += " – provändring";
    writeFileSync(join(repo, "data/parties.json"), JSON.stringify(partier));
    const revision = commit();
    // Nätgränsen ersätts; Git läser fortfarande repots riktiga commit och data.
    writeFileSync(join(dir, "git"), `#!${process.execPath}\nconst {spawnSync}=require('node:child_process'); if(process.argv[2]==='fetch')process.exit(0); const r=spawnSync(${JSON.stringify(git)},process.argv.slice(2),{stdio:'inherit'}); process.exit(r.status??1);\n`);
    const drift = JSON.parse(readFileSync(new URL("./fixtures/publiceringsdrift.json", import.meta.url), "utf8"))[0];
    drift.commitOid = fore;
    writeFileSync(join(dir, "gh"), `#!${process.execPath}\nif(process.env.PROV_NATFEL)process.exit(1); if(!process.argv.includes('--paginate')||!process.argv.includes('--slurp'))process.exit(2); const n=${JSON.stringify(drift)}; if(process.env.PROV_INGEN_DRIFT){n.state='INACTIVE';n.latestStatus.state='INACTIVE';} console.log(JSON.stringify([{data:{repository:{deployments:{totalCount:1,nodes:[n],pageInfo:{hasNextPage:false,endCursor:'sista'}}}}}]));\n`);
    for (const name of ["git", "gh"]) chmodSync(join(dir, name), 0o755);
    const fil = join(repo, "data/promises.json");
    const summary = join(dir, "summary.md");
    const outputs = join(dir, "outputs");
    const run = (name: string, extra = {}) => spawnSync(process.execPath,
      ["--experimental-strip-types", "pipeline/scripts/publiceringsforbered.mts", fil, "456", join(dir, name)], {
        cwd: repo, encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`,
          GITHUB_REPOSITORY: "bambapappa/valflask", GITHUB_SHA: revision, GITHUB_RUN_ID: "123",
          GITHUB_RUN_ATTEMPT: "1", GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: outputs,
          GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "schedule", ...extra },
      });
    const ok = run("ok");
    assert.equal(ok.status, 0, ok.stderr);
    const paket = JSON.parse(readFileSync(join(dir, "ok/paket.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(join(dir, "ok/manifest.json"), "utf8"));
    assert.equal(paket.foreRevision, fore);
    assert.equal(paket.driftbas.revision, fore);
    assert.equal(paket.driftbas.deploymentId, String(drift.databaseId));
    assert.equal(paket.efterRevision, revision);
    assert.ok(paket.antalEfter > 0);
    assert.equal(paket.summor.fore.revision, fore);
    assert.equal(paket.summor.efter.revision, revision);
    assert.deepEqual(paket.filer.sokvagar, ["data/parties.json"]);
    assert.equal(readFileSync(outputs, "utf8"), "publicera=true\n");
    assert.equal(readFileSync(join(dir, "ok/andringar.patch"), "utf8"), paket.filer.patch);
    assert.equal(readFileSync(join(dir, "ok/granska.html"), "utf8"), publiceringsvy(paket));
    await kontrolleraPubliceringsartefakt(fil, manifest, { repo: "bambapappa/valflask", revision,
      korning: "123", forsok: 1, artefaktId: "456", pakethash: paket.hash });
    const besked = readFileSync(join(dir, "ok/LAS-MIG.txt"), "utf8");
    assert.ok(besked.includes(`Godkänn publiceringspaket ${manifest.hash}`));
    assert.equal(readFileSync(summary, "utf8"), besked);
    for (const [name, extra] of Object.entries({ saknad: { PROV_INGEN_DRIFT: "1" }, natfel: { PROV_NATFEL: "1" }, forsok: { GITHUB_RUN_ATTEMPT: "0" } })) {
      const result = run(name, extra);
      assert.equal(result.status, 1, result.stderr);
      assert.equal(existsSync(join(dir, name)), false);
      assert.equal(readFileSync(summary, "utf8"), besked);
    }
    for (const [name, extra, text] of [
      ["tomt", { GITHUB_SHA: fore }, "Inga filer har ändrats"],
      ["prov", { GITHUB_EVENT_NAME: "pull_request", GITHUB_REF: "refs/pull/1/merge" }, "provunderlag"],
    ] as const) {
      assert.equal(run(name, extra).status, 0);
      const besked = readFileSync(join(dir, name, "LAS-MIG.txt"), "utf8");
      assert.ok(besked.includes(text));
      assert.ok(!besked.includes("Godkänn publiceringspaket"));
      assert.ok(readFileSync(outputs, "utf8").endsWith("publicera=false\n"));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
