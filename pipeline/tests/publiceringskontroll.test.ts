import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { bindPubliceringsbas } from "../src/publiceringspaket.ts";
import { valjPubliceringsbas } from "../src/publiceringsbas.ts";
import { bindPubliceringsartefakt } from "../src/publiceringsartefakt.ts";

test("kommandot läser artefakt och GitHub-svar; nätfel och fel försök ger avslag", async () => {
  const dir = mkdtempSync(join(tmpdir(), "publiceringskontroll-"));
  try {
    const fil = resolve(import.meta.dirname, "../../data/promises.json");
    const repo = resolve(import.meta.dirname, "../..");
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    const drift = JSON.parse(readFileSync(new URL("./fixtures/publiceringsdrift.json", import.meta.url), "utf8"))[0];
    drift.commitOid = revision;
    const driftSvar = [{data:{repository:{deployments:{totalCount:1,nodes:[drift],pageInfo:{hasNextPage:false,endCursor:"sista"}}}}}];
    const original = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "pipeline/scripts/publiceringspaket.mts", ".", revision, revision], {
      cwd: repo, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
    }));
    const paket = bindPubliceringsbas(original, valjPubliceringsbas(driftSvar));
    const paketfil = join(dir, "paket.json");
    writeFileSync(paketfil, JSON.stringify(paket));
    const id = { repo: "bambapappa/valflask", revision, korning: "123",
      forsok: 1, artefaktId: "456", pakethash: paket.hash };
    const manifest = await bindPubliceringsartefakt(fil, id);
    const path = join(dir, "manifest.json");
    writeFileSync(path, JSON.stringify(manifest));
    const user = { id: 1234, login: "granskare", type: "User" };
    const svar = {
      "repos/bambapappa/valflask/actions/runs/123": { id: 123, head_sha: id.revision,
        run_attempt: 1, event: "schedule", repository: { full_name: id.repo }, head_branch: "main" },
      "repos/bambapappa/valflask/actions/artifacts/456": { id: 456, name: "github-pages-123-1",
        expired: false, workflow_run: { id: 123, head_sha: id.revision } },
      "repos/bambapappa/valflask/environments/github-pages": { id: 789, name: "github-pages",
        can_admins_bypass: false, protection_rules: [{ type: "required_reviewers",
          reviewers: [{ type: "User", reviewer: user }] }] },
      "repos/bambapappa/valflask/actions/runs/123/approvals": [{ state: "approved", user,
        comment: `Godkänn publiceringspaket ${manifest.hash}`, environments: [{ id: 789 }] }],
    };
    const gh = join(dir, "gh");
    writeFileSync(gh, `#!${process.execPath}\nconst svar=${JSON.stringify(svar)}; if(process.env.PROV_NATFEL)process.exit(1); let s=svar[process.argv[3]]; if(process.argv[3]==='graphql'){s=${JSON.stringify(driftSvar)}; if(process.env.PROV_ANDRAD_BAS)s[0].data.repository.deployments.nodes[0].commitOid='b'.repeat(40);} if(!s)process.exit(2); console.log(JSON.stringify(s));\n`);
    chmodSync(gh, 0o755);
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: id.repo,
      GITHUB_RUN_ID: id.korning, GITHUB_SHA: id.revision, GITHUB_RUN_ATTEMPT: "1", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "schedule" };
    const kor = (extra = {}) => spawnSync(process.execPath, ["--import", "tsx/esm",
      "scripts/publiceringskontroll.mts", fil, path, paketfil], { cwd: resolve(import.meta.dirname, ".."),
      env: { ...env, ...extra }, encoding: "utf8" });
    const ok = kor();
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /github-pages-123-1/);
    assert.equal(kor({ GITHUB_EVENT_NAME: "push" }).status, 1);
    assert.equal(kor({ GITHUB_EVENT_NAME: "workflow_dispatch", PUBLICERA: "false" }).status, 1);
    assert.equal(kor({ GITHUB_RUN_ATTEMPT: "2" }).status, 1);
    const byttBas = kor({ PROV_ANDRAD_BAS: "1" });
    assert.equal(byttBas.status, 1);
    assert.match(byttBas.stderr, /Sajten har fått en annan version/);
    const byttPaket = structuredClone(paket);
    byttPaket.foreRevision = "c".repeat(40);
    writeFileSync(paketfil, JSON.stringify(byttPaket));
    assert.equal(kor().status, 1);
    writeFileSync(paketfil, JSON.stringify(paket));
    assert.equal(kor({ PROV_NATFEL: "1" }).status, 1);
    assert.equal(kor({ GITHUB_REF: "refs/heads/annan" }).status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
