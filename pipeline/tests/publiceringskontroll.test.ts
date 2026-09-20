import { createHash } from "node:crypto";
import { forberedPubliceringsprovning, publiceringsprovningshash } from "../src/publiceringsprovning.ts";
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
    const provning = forberedPubliceringsprovning(paket, manifest.hash, {});
    const provningshash = publiceringsprovningshash(provning);
    const privatfil = join(dir, "privat.json");
    writeFileSync(privatfil, JSON.stringify(provning));
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
        comment: `Godkänn publiceringspaket ${manifest.hash} med sakprövning ${provningshash}`, environments: [{ id: 789 }] }],
    };
    const zipfil = join(dir, "provning.zip");
    execFileSync("python3", ["-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w'); z.write(sys.argv[2],'paket.json'); z.close()", zipfil, privatfil]);
    const zip = readFileSync(zipfil), privateRepo = "syntetiskt-testkonto/privat";
    const artifact = { id: 7, name: `publiceringsprovning-${manifest.hash}`, expired: false, size_in_bytes: zip.length, digest: `sha256:${createHash("sha256").update(zip).digest("hex")}`, workflow_run: { id: 8, head_branch: "main", head_sha: "c".repeat(40), repository_id: 9, head_repository_id: 9 } };
    const privateRun = { id: 8, path: ".github/workflows/publiceringsprovning.yml", event: "workflow_dispatch", status: "completed", conclusion: "success", head_branch: "main", head_sha: "c".repeat(40), repository: { id: 9 }, head_repository: { id: 9 } };
    Object.assign(svar, { [`repos/${privateRepo}/actions/artifacts?name=${artifact.name}&per_page=100`]: [{ artifacts: [artifact] }], [`repos/${privateRepo}/actions/runs/8`]: privateRun });
    const gh = join(dir, "gh");
    writeFileSync(gh, `#!${process.execPath}\nconst svar=${JSON.stringify(svar)}; if(process.env.PROV_NATFEL)process.exit(1); if(process.argv[3]===${JSON.stringify(`repos/${privateRepo}/actions/artifacts/7/zip`)}){const z=Buffer.from(${JSON.stringify(zip.toString("base64"))},"base64");if(process.env.PROV_TRASIGZIP)z[0]^=1;process.stdout.write(z);process.exit(0);} let s=svar[process.argv[3]]; if(process.argv[3]==='graphql'){s=${JSON.stringify(driftSvar)}; if(process.env.PROV_ANDRAD_BAS)s[0].data.repository.deployments.nodes[0].commitOid='b'.repeat(40);} if(!s)process.exit(2); console.log(JSON.stringify(s));\n`);
    chmodSync(gh, 0o755);
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: id.repo,
      GITHUB_RUN_ID: id.korning, GITHUB_SHA: id.revision, GITHUB_RUN_ATTEMPT: "1", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "schedule", PUBLICERINGSPROVNING_FIL: privatfil };
    const kor = (extra = {}) => spawnSync(process.execPath, ["--experimental-strip-types",
      "scripts/publiceringskontroll.mts", fil, path, paketfil], { cwd: resolve(import.meta.dirname, ".."),
      env: { ...env, ...extra }, encoding: "utf8" });
    assert.equal(kor({ PUBLICERINGSPROVNING_FIL: "" }).status, 1);
    writeFileSync(privatfil, '{"Privat resonemang som inte får läcka":');
    const trasigt = kor(); assert.equal(trasigt.status, 1); assert.doesNotMatch(trasigt.stderr, /Privat resonemang/);
    writeFileSync(privatfil, JSON.stringify(provning));
    const outputs = join(dir, "private-output");
    const hamta = (extra = {}) => spawnSync(process.execPath, ["--experimental-strip-types", "scripts/hamta-publiceringsprovning.mts"], { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8", env: { ...env, RUNNER_TEMP: dir, GITHUB_OUTPUT: outputs, GRANSKNINGSREPO: privateRepo, PUBLICERINGSMANIFEST_FIL: path, PUBLICERINGSPAKET_FIL: paketfil, ...extra } });
    assert.equal(hamta({ PROV_TRASIGZIP: "1" }).status, 1);
    const transport = hamta(); assert.equal(transport.status, 0, transport.stderr);
    const transporterad = readFileSync(outputs, "utf8").trim().split("=")[1]!;
    assert.deepEqual(JSON.parse(readFileSync(transporterad, "utf8")), provning);
    const ok = kor({ PUBLICERINGSPROVNING_FIL: transporterad });
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
