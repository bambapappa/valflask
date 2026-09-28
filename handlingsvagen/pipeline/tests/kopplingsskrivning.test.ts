import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, copyFileSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { lasKopplingslage, skrivKopplingsbeslut } from "../src/kopplingsskrivning.ts";
import { kopplingId, type KoPost } from "../src/granskning.ts";

for (const oldLinks of [null, "[]\n"]) {
  test(`avslag bevarar orörda kopplingar (${oldLinks === null ? "saknad" : "befintlig"} fil)`, () => {
    const dir = mkdtempSync(join(tmpdir(), "kopplingsskrivning-"));
    try {
      writeFileSync(join(dir, "kopplingsforslag.json"), '[{"handling_id":"h1"}]\n');
      if (oldLinks !== null) writeFileSync(join(dir, "kopplingar.json"), oldLinks);
      const { fore } = lasKopplingslage(dir);
      skrivKopplingsbeslut(dir, fore, [] as never[], [] as never[]);
      assert.equal(readFileSync(join(dir, "kopplingsforslag.json"), "utf8"), "[]\n");
      assert.equal(existsSync(join(dir, "kopplingar.json")), oldLinks !== null);
      if (oldLinks !== null) assert.equal(readFileSync(join(dir, "kopplingar.json"), "utf8"), oldLinks);
      assert.equal(existsSync(join(dir, ".datatransaktion")), false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test("ändrat föreläge stoppar hela kopplingsbeslutet utan att skriva över någon fil", () => {
  const dir = mkdtempSync(join(tmpdir(), "kopplingsskrivning-race-"));
  try {
    writeFileSync(join(dir, "kopplingsforslag.json"), '[{"handling_id":"h1"}]\n');
    writeFileSync(join(dir, "kopplingar.json"), "[]\n");
    const { fore } = lasKopplingslage(dir);
    writeFileSync(join(dir, "kopplingsforslag.json"), '[{"handling_id":"h2"}]\n');
    assert.throws(() => skrivKopplingsbeslut(dir, fore, [] as never[], [{ id: "k-2026-0001" }] as never[]), /föreläge/u);
    assert.equal(readFileSync(join(dir, "kopplingsforslag.json"), "utf8"), '[{"handling_id":"h2"}]\n');
    assert.equal(readFileSync(join(dir, "kopplingar.json"), "utf8"), "[]\n");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("godkännande skriver kön och kopplingarna tillsammans och kan inte spelas om", () => {
  const dir = mkdtempSync(join(tmpdir(), "kopplingsskrivning-godkann-"));
  try {
    writeFileSync(join(dir, "kopplingsforslag.json"), '[{"handling_id":"h1"}]\n');
    writeFileSync(join(dir, "kopplingar.json"), "[]\n");
    const { fore } = lasKopplingslage(dir);
    const links = [{ id: "k-2026-0001" }] as never[];
    skrivKopplingsbeslut(dir, fore, [] as never[], links);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "kopplingsforslag.json"), "utf8")), []);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "kopplingar.json"), "utf8")), links);
    assert.throws(() => skrivKopplingsbeslut(dir, fore, [] as never[], links), /föreläge/u);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("verkligt granska-kommando avvisar en kopierad köpost med gemensam transaktion", () => {
  const root = mkdtempSync(join(tmpdir(), "kopplingsgranska-cli-"));
  try {
    const project = resolve(import.meta.dirname, "../../..");
    const hvPipeline = join(root, "handlingsvagen", "pipeline");
    const scripts = join(hvPipeline, "scripts");
    const data = join(root, "handlingsvagen", "data");
    mkdirSync(scripts, { recursive: true });
    mkdirSync(data);
    mkdirSync(join(root, "pipeline"));
    for (const name of ["koppling-granska.mts", "kallcache.mts"]) copyFileSync(join(project, "handlingsvagen", "pipeline", "scripts", name), join(scripts, name));
    symlinkSync(join(project, "handlingsvagen", "pipeline", "src"), join(hvPipeline, "src"), "dir");
    symlinkSync(join(project, "pipeline", "src"), join(root, "pipeline", "src"), "dir");
    const post = { promise_id: "p-1", handling_id: "h-1", bevis: { citat: "Exempelcitat" } };
    const id = createHash("sha256").update("p-1::h-1").digest("hex").slice(0, 12);
    writeFileSync(join(data, "kopplingsforslag.json"), JSON.stringify([post]) + "\n");
    writeFileSync(join(data, "kopplingar.json"), "[]\n");
    writeFileSync(join(data, "handlingar.json"), "[]\n");
    const run = spawnSync(process.execPath, ["--import", "tsx/esm", join(scripts, "koppling-granska.mts"), "avvisa", id, "Källan stödjer inte förslaget"], { cwd: join(project, "handlingsvagen", "pipeline"), encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(data, "kopplingsforslag.json"), "utf8")), []);
    assert.equal(readFileSync(join(data, "kopplingar.json"), "utf8"), "[]\n");
    assert.equal(existsSync(join(data, ".datatransaktion")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("verklig issue-kommentar lämnar inte kvar en avvisad köpost", () => {
  const root = mkdtempSync(join(tmpdir(), "kopplingskommentar-cli-"));
  try {
    const project = resolve(import.meta.dirname, "../../..");
    const hvPipeline = join(root, "handlingsvagen", "pipeline");
    const scripts = join(hvPipeline, "scripts");
    const data = join(root, "handlingsvagen", "data");
    mkdirSync(scripts, { recursive: true });
    mkdirSync(data);
    mkdirSync(join(root, "pipeline"));
    copyFileSync(join(project, "handlingsvagen", "pipeline", "scripts", "koppling-kommentar.mts"), join(scripts, "koppling-kommentar.mts"));
    symlinkSync(join(project, "handlingsvagen", "pipeline", "src"), join(hvPipeline, "src"), "dir");
    symlinkSync(join(project, "pipeline", "src"), join(root, "pipeline", "src"), "dir");
    const post = { promise_id: "p-1", handling_id: "h-1", bevis: { citat: "Exempelcitat" } };
    const id = createHash("sha256").update("p-1::h-1").digest("hex").slice(0, 12);
    writeFileSync(join(data, "kopplingsforslag.json"), JSON.stringify([post]) + "\n");
    writeFileSync(join(data, "kopplingar.json"), "[]\n");
    const output = join(root, "output");
    writeFileSync(output, "");
    const run = spawnSync(process.execPath, ["--import", "tsx/esm", join(scripts, "koppling-kommentar.mts")], {
      cwd: join(project, "handlingsvagen", "pipeline"), encoding: "utf8",
      env: { ...process.env, ISSUE_TITLE: `[koppling ${id}] Exempel`, COMMENT_BODY: "/avvisa Källan stödjer inte förslaget", GITHUB_OUTPUT: output },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(readFileSync(output, "utf8"), /result=rejected/u);
    assert.deepEqual(JSON.parse(readFileSync(join(data, "kopplingsforslag.json"), "utf8")), []);
    assert.equal(readFileSync(join(data, "kopplingar.json"), "utf8"), "[]\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("avvisa-lista stoppar trasiga kopplingar före köskrivning och bevarar orörda filer", () => {
  const root = mkdtempSync(join(tmpdir(), "kopplingsavvisa-lista-"));
  try {
    const project = resolve(import.meta.dirname, "../../..");
    const hvPipeline = join(root, "handlingsvagen", "pipeline");
    const scripts = join(hvPipeline, "scripts");
    const data = join(root, "handlingsvagen", "data");
    mkdirSync(scripts, { recursive: true });
    mkdirSync(data);
    mkdirSync(join(root, "pipeline"));
    copyFileSync(join(project, "handlingsvagen", "pipeline", "scripts", "koppling-avvisa-lista.mts"), join(scripts, "koppling-avvisa-lista.mts"));
    symlinkSync(join(project, "handlingsvagen", "pipeline", "src"), join(hvPipeline, "src"), "dir");
    symlinkSync(join(project, "pipeline", "src"), join(root, "pipeline", "src"), "dir");
    const aktuella = JSON.parse(readFileSync(join(project, "handlingsvagen", "data", "kopplingsforslag.json"), "utf8")) as KoPost[];
    const post = aktuella.find((p) => p.promise_id || p.stance_id);
    assert.ok(post, "provet behöver ett verkligt köförslag");
    const fore = JSON.stringify([post], null, 2) + "\n";
    writeFileSync(join(data, "kopplingsforslag.json"), fore);
    const lista = join(root, "lista.tsv");
    writeFileSync(lista, `${kopplingId(post)}\tKällan stödjer inte förslaget\n`);
    const kor = () => spawnSync(process.execPath, ["--import", "tsx/esm", join(scripts, "koppling-avvisa-lista.mts"), lista, "--skriv"], {
      cwd: join(project, "handlingsvagen", "pipeline"), encoding: "utf8",
    });
    writeFileSync(join(data, "kopplingar.json"), "{trasigt\n");
    const stopp = kor();
    assert.notEqual(stopp.status, 0);
    assert.equal(readFileSync(join(data, "kopplingsforslag.json"), "utf8"), fore);
    const links = "[]\n";
    writeFileSync(join(data, "kopplingar.json"), links);
    const klar = kor();
    assert.equal(klar.status, 0, klar.stderr);
    assert.equal(readFileSync(join(data, "kopplingsforslag.json"), "utf8"), "[]\n");
    assert.equal(readFileSync(join(data, "kopplingar.json"), "utf8"), links);
    assert.equal(existsSync(join(data, ".datatransaktion")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
