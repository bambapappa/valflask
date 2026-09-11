import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, existsSync } from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { kontrolleraPubliceringsartefakt } from "../src/publiceringsartefakt.ts";
import { publiceringsvy } from "../src/publiceringsvy.ts";

test("förberedelsen binder verkliga Git-data, vy och godkännandetext; okänd drift stoppar paketet", async () => {
  const dir = mkdtempSync(join(tmpdir(), "publiceringsforbered-"));
  const repo = resolve(import.meta.dirname, "../..");
  const git = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const revision = execFileSync(git, ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  try {
    // Nätgränsen ersätts; Git läser fortfarande repots riktiga commit och data.
    writeFileSync(join(dir, "git"), `#!${process.execPath}\nconst {spawnSync}=require('node:child_process'); if(process.argv[2]==='fetch')process.exit(0); const r=spawnSync(${JSON.stringify(git)},process.argv.slice(2),{stdio:'inherit'}); process.exit(r.status??1);\n`);
    writeFileSync(join(dir, "gh"), `#!${process.execPath}\nif(process.env.PROV_NATFEL)process.exit(1); const path=process.argv[3]; let svar; if(path.includes('/statuses?'))svar=process.env.PROV_INGEN_DRIFT?[]:[{state:'success'}]; else svar=[{id:123,sha:${JSON.stringify(revision)}}]; console.log(JSON.stringify(svar));\n`);
    for (const name of ["git", "gh"]) chmodSync(join(dir, name), 0o755);
    const fil = join(repo, "data/promises.json");
    const summary = join(dir, "summary.md");
    const run = (name: string, extra = {}) => spawnSync(process.execPath,
      ["--experimental-strip-types", "pipeline/scripts/publiceringsforbered.mts", fil, "456", join(dir, name)], {
        cwd: repo, encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`,
          GITHUB_REPOSITORY: "bambapappa/valflask", GITHUB_SHA: revision, GITHUB_RUN_ID: "123",
          GITHUB_RUN_ATTEMPT: "1", GITHUB_STEP_SUMMARY: summary, ...extra },
      });
    const ok = run("ok");
    assert.equal(ok.status, 0, ok.stderr);
    const paket = JSON.parse(readFileSync(join(dir, "ok/paket.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(join(dir, "ok/manifest.json"), "utf8"));
    assert.equal(paket.foreRevision, revision);
    assert.equal(paket.efterRevision, revision);
    assert.ok(paket.antalEfter > 0);
    assert.equal(paket.summor.fore.revision, revision);
    assert.equal(paket.summor.efter.revision, revision);
    assert.deepEqual(paket.filer, { sokvagar: [], patch: "" });
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
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
