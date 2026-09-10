import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { bindPubliceringsartefakt } from "../src/publiceringsartefakt.ts";

test("kommandot läser artefakt och GitHub-svar; nätfel och fel försök ger avslag", async () => {
  const dir = mkdtempSync(join(tmpdir(), "publiceringskontroll-"));
  try {
    const fil = resolve(import.meta.dirname, "../../data/promises.json");
    const id = { repo: "bambapappa/valflask", revision: "a".repeat(40), korning: "123",
      forsok: 1, artefaktId: "456", pakethash: "b".repeat(64) };
    const manifest = await bindPubliceringsartefakt(fil, id);
    const path = join(dir, "manifest.json");
    writeFileSync(path, JSON.stringify(manifest));
    const user = { id: 1234, login: "granskare", type: "User" };
    const svar = {
      "repos/bambapappa/valflask/actions/runs/123": { id: 123, head_sha: id.revision,
        run_attempt: 1, repository: { full_name: id.repo }, head_branch: "main" },
      "repos/bambapappa/valflask/actions/artifacts/456": { id: 456, name: "github-pages-123-1",
        expired: false, workflow_run: { id: 123, head_sha: id.revision } },
      "repos/bambapappa/valflask/environments/github-pages": { id: 789, name: "github-pages",
        can_admins_bypass: false, protection_rules: [{ type: "required_reviewers",
          reviewers: [{ type: "User", reviewer: user }] }] },
      "repos/bambapappa/valflask/actions/runs/123/approvals": [{ state: "approved", user,
        comment: `Godkänn publiceringspaket ${manifest.hash}`, environments: [{ id: 789 }] }],
    };
    const gh = join(dir, "gh");
    writeFileSync(gh, `#!${process.execPath}\nconst svar=${JSON.stringify(svar)}; if(process.env.PROV_NATFEL)process.exit(1); const s=svar[process.argv[3]]; if(!s)process.exit(2); console.log(JSON.stringify(s));\n`);
    chmodSync(gh, 0o755);
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: id.repo,
      GITHUB_RUN_ID: id.korning, GITHUB_SHA: id.revision, GITHUB_RUN_ATTEMPT: "1", GITHUB_REF: "refs/heads/main" };
    const kor = (extra = {}) => spawnSync(process.execPath, ["--import", "tsx/esm",
      "scripts/publiceringskontroll.mts", fil, path], { cwd: resolve(import.meta.dirname, ".."),
      env: { ...env, ...extra }, encoding: "utf8" });
    const ok = kor();
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /github-pages-123-1/);
    assert.equal(kor({ GITHUB_RUN_ATTEMPT: "2" }).status, 1);
    assert.equal(kor({ PROV_NATFEL: "1" }).status, 1);
    assert.equal(kor({ GITHUB_REF: "refs/heads/annan" }).status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
