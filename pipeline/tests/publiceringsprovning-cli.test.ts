import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { byggPubliceringspaket } from "../src/publiceringspaket.ts";
import { bindPubliceringsartefakt } from "../src/publiceringsartefakt.ts";

test("privat förberedelse börjar oavgjort, vägrar överskrivning och stoppar manipulerat manifest", async () => {
  const dir = mkdtempSync(join(tmpdir(), "publiceringscli-"));
  try {
    const all = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8"));
    const fore = [{ slag: "lofte" as const, id: all[0].id, innehall: all[0], beroenden: [] }];
    const efter = structuredClone(fore); efter[0]!.innehall.title += " syntetiskt prov";
    const p = byggPubliceringspaket("a".repeat(40), "b".repeat(40), fore, efter);
    const pf = join(dir, "paket.json"), mf = join(dir, "manifest.json"), material = join(dir, "material.json"), ut = join(dir, "privat.json");
    writeFileSync(pf, JSON.stringify(p)); writeFileSync(material, "{}");
    const m = await bindPubliceringsartefakt(pf, { repo: "test/repo", revision: p.efterRevision, korning: "1", forsok: 1, artefaktId: "2", pakethash: p.hash });
    writeFileSync(mf, JSON.stringify(m));
    const run = (...args: string[]) => spawnSync(process.execPath, ["--experimental-strip-types", "scripts/publiceringsprovning.mts", ...args], { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8" });
    const ok = run("forbered", pf, mf, material, ut); assert.equal(ok.status, 0, ok.stderr);
    const bytes = readFileSync(ut, "utf8"), prov = JSON.parse(bytes);
    assert.ok(prov.poster.every((r: any) => r.bedomare === null && r.bedomningar.every((b: any) => b.utfall === "oavgjort")));
    assert.equal(statSync(ut).mode & 0o777, 0o600);
    assert.equal(run("kontroll", pf, mf, ut).status, 1);
    assert.equal(run("forbered", pf, mf, material, ut).status, 1);
    assert.equal(readFileSync(ut, "utf8"), bytes);
    const forbidden = resolve(import.meta.dirname, "../privat-prov-ska-inte-skapas.json");
    assert.equal(run("forbered", pf, mf, material, forbidden).status, 1);
    assert.equal(existsSync(forbidden), false);
    writeFileSync(mf, JSON.stringify({ ...m, forsok: 2 }));
    const annat = join(dir, "annat.json");
    assert.equal(run("forbered", pf, mf, material, annat).status, 1);
    assert.equal(existsSync(annat), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
