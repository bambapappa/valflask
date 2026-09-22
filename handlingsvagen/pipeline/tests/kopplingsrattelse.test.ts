import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, copyFileSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { lasKopplingsrattelselage, skrivKopplingsrattelse } from "../src/kopplingsrattelse.ts";

const link = { id: "k-2026-0001", promise_id: "p-1", status: "aktiv" };

test("kopplingsändring och rättelse skrivs tillsammans; återspelning stoppas", () => {
  const dir = mkdtempSync(join(tmpdir(), "kopplingsrattelse-"));
  try {
    writeFileSync(join(dir, "kopplingar.json"), JSON.stringify([link]) + "\n");
    const { fore } = lasKopplingsrattelselage(dir);
    const links = [{ ...link, status: "indragen" }] as never[];
    const notes = [{ what: "Publicerat belägg drogs tillbaka" }];
    skrivKopplingsrattelse(dir, fore, links, notes);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "kopplingar.json"), "utf8")), links);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "rattelser.json"), "utf8")), notes);
    assert.equal(existsSync(join(dir, ".datatransaktion")), false);
    assert.throws(() => skrivKopplingsrattelse(dir, fore, links, notes), /föreläge/u);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ändrad kopplingsfil under förberedelse stoppar även rättelseloggen", () => {
  const dir = mkdtempSync(join(tmpdir(), "kopplingsrattelse-race-"));
  try {
    writeFileSync(join(dir, "kopplingar.json"), JSON.stringify([link]) + "\n");
    writeFileSync(join(dir, "rattelser.json"), "[]\n");
    const { fore } = lasKopplingsrattelselage(dir);
    writeFileSync(join(dir, "kopplingar.json"), '[{"id":"k-annan"}]\n');
    assert.throws(() => skrivKopplingsrattelse(dir, fore, [] as never[], [{ what: "nytt" }]), /föreläge/u);
    assert.equal(readFileSync(join(dir, "kopplingar.json"), "utf8"), '[{"id":"k-annan"}]\n');
    assert.equal(readFileSync(join(dir, "rattelser.json"), "utf8"), "[]\n");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("verkligt dra-in-kommando skriver offentlig koppling och rättelselogg tillsammans", () => {
  const root = mkdtempSync(join(tmpdir(), "koppling-dra-in-cli-"));
  try {
    const project = resolve(import.meta.dirname, "../../..");
    const scripts = join(root, "handlingsvagen", "pipeline", "scripts");
    const data = join(root, "handlingsvagen", "data");
    mkdirSync(scripts, { recursive: true });
    mkdirSync(data);
    mkdirSync(join(root, "pipeline"));
    copyFileSync(join(project, "handlingsvagen", "pipeline", "scripts", "koppling-dra-in.mts"), join(scripts, "koppling-dra-in.mts"));
    symlinkSync(join(project, "handlingsvagen", "pipeline", "src"), join(root, "handlingsvagen", "pipeline", "src"), "dir");
    symlinkSync(join(project, "pipeline", "src"), join(root, "pipeline", "src"), "dir");
    writeFileSync(join(data, "kopplingar.json"), JSON.stringify([link]) + "\n");
    const list = join(root, "lista.txt");
    writeFileSync(list, `${link.id}\tVi läste handlingen och fann att den inte bär det publicerade löftet.\n`);
    const run = spawnSync(process.execPath, ["--import", "tsx/esm", join(scripts, "koppling-dra-in.mts"), list, "--skriv"], {
      cwd: join(project, "handlingsvagen", "pipeline"), encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(readFileSync(join(data, "kopplingar.json"), "utf8"))[0].status, "indragen");
    assert.equal(JSON.parse(readFileSync(join(data, "rattelser.json"), "utf8")).length, 1);
    assert.equal(existsSync(join(data, ".datatransaktion")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("verkligt motiveringskommando rättar båda filerna och stoppar trasig rättelselogg", () => {
  const root = mkdtempSync(join(tmpdir(), "koppling-motivering-cli-"));
  try {
    const project = resolve(import.meta.dirname, "../../..");
    const scripts = join(root, "handlingsvagen", "pipeline", "scripts");
    const data = join(root, "handlingsvagen", "data");
    mkdirSync(scripts, { recursive: true });
    mkdirSync(data);
    mkdirSync(join(root, "pipeline"));
    copyFileSync(join(project, "handlingsvagen", "pipeline", "scripts", "koppling-motivering.mts"), join(scripts, "koppling-motivering.mts"));
    symlinkSync(join(project, "handlingsvagen", "pipeline", "src"), join(root, "handlingsvagen", "pipeline", "src"), "dir");
    symlinkSync(join(project, "pipeline", "src"), join(root, "pipeline", "src"), "dir");
    const original = JSON.stringify([{ ...link, bevis: { citat: "Motionen kräver samma åtgärd." }, method_note: "Gammal motivering." }]) + "\n";
    writeFileSync(join(data, "kopplingar.json"), original);
    writeFileSync(join(data, "rattelser.json"), "trasigt\n");
    const list = join(root, "lista.txt");
    writeFileSync(list, `${link.id}\tMotionen föreslår samma åtgärd som löftet beskriver.\tDen äldre motiveringen förklarade inte citatet.\n`);
    const args = ["--import", "tsx/esm", join(scripts, "koppling-motivering.mts"), list, "--skriv", "--varfor", "Motiveringen behövde rättas efter kontroll av motionen."];
    const invalid = spawnSync(process.execPath, args, { cwd: join(project, "handlingsvagen", "pipeline"), encoding: "utf8" });
    assert.notEqual(invalid.status, 0);
    assert.equal(readFileSync(join(data, "kopplingar.json"), "utf8"), original);
    writeFileSync(join(data, "rattelser.json"), "[]\n");
    const valid = spawnSync(process.execPath, args, { cwd: join(project, "handlingsvagen", "pipeline"), encoding: "utf8" });
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(JSON.parse(readFileSync(join(data, "kopplingar.json"), "utf8"))[0].method_note, /samma åtgärd/u);
    assert.equal(JSON.parse(readFileSync(join(data, "rattelser.json"), "utf8")).length, 1);
    assert.equal(existsSync(join(data, ".datatransaktion")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
