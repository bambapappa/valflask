import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, symlinkSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../..");
const original = JSON.parse(readFileSync(resolve(root, "data/promises.json"), "utf8"));
const seed = original.find((p: any) => p.id === "p-2026-2944");
assert.ok(seed, "Det verkliga källfallet måste finnas");
const unknown = structuredClone(seed);
unknown.cost.msek_low = unknown.cost.msek_base = unknown.cost.msek_high = 0;
unknown.cost.harledning = {version: "harledning/1", led: [], arsprofil: {status: "okand", skal: "Testprofil"}, belopp_okant: {skal: "Syntetiskt saknat underlag"}};

function run(posts: unknown[]) {
  const dir = mkdtempSync(resolve(tmpdir(), "utlovat-faq-okand-"));
  mkdirSync(resolve(dir, "data"));
  mkdirSync(resolve(dir, "site"));
  try {
    for (const file of readdirSync(resolve(root, "data"))) {
      if (file !== "promises.json") symlinkSync(resolve(root, "data", file), resolve(dir, "data", file));
    }
    writeFileSync(resolve(dir, "data/promises.json"), JSON.stringify(posts));
    const url = pathToFileURL(resolve(root, "site/src/lib/faq.ts")).href;
    return JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `import {faqFragor} from ${JSON.stringify(url)}; console.log(JSON.stringify(faqFragor()));`], {cwd: resolve(dir, "site"), encoding: "utf8"}));
  } finally { rmSync(dir, {recursive: true, force: true}); }
}

test("Enbart okända belopp har källor men ingen nollprislapp eller rankning", () => {
  for (const row of run([unknown]).filter((r: any) => ["kostnad-c", "kostnad-totalt"].includes(r.slug))) {
    assert.equal(row.data.total_msek, null);
    assert.equal(row.data.gap_msek, null);
    assert.equal(row.data.ofullstandig_summa, true);
    assert.equal(row.data.antal_okanda_belopp, 1);
    assert.deepEqual(row.data.dyraste_loftena, []);
    assert.ok(row.sources.some((s: any) => s.archive_url));
    assert.ok(row.answer_short.includes("Ingen sammanlagd kostnad kan fastställas"));
  }
  assert.equal(run([unknown]).filter((r: any) => ["kostnad-c", "kostnad-totalt"].includes(r.slug)).length, 2);
});

test("Blandat urval varnar bara för berörda partier och rankar aldrig okänd post", () => {
  // Den isolerade frågan provar en ny lucka, oberoende av andra verkliga luckor.
  const rows = run(original.filter((p: any) => !p.cost.harledning?.belopp_okant).map((p: any) => p.id === unknown.id ? unknown : p));
  for (const slug of ["kostnad-c", "kostnad-totalt"]) {
    const row = rows.find((r: any) => r.slug === slug);
    assert.equal(row.data.ofullstandig_summa, true);
    assert.deepEqual(row.data.okanda_loften, [unknown.id]);
    assert.ok(!row.data.dyraste_loftena.some((p: any) => p.id === unknown.id));
  }
  assert.equal(rows.find((r: any) => r.slug === "kostnad-s").data.ofullstandig_summa, undefined);
  assert.equal(run([]).filter((r: any) => r.typ !== "delfraga").length, 0);
});
