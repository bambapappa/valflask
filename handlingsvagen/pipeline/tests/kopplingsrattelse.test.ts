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

test("ompekning av en verklig koppling skriver synlig rättelse och lämnar inget halvt läge", () => {
  const root = mkdtempSync(join(tmpdir(), "koppling-peka-om-cli-"));
  try {
    const project = resolve(import.meta.dirname, "../../..");
    const scripts = join(root, "handlingsvagen", "pipeline", "scripts");
    const data = join(root, "handlingsvagen", "data");
    mkdirSync(scripts, { recursive: true });
    mkdirSync(data);
    mkdirSync(join(root, "pipeline"));
    mkdirSync(join(root, "data"));
    copyFileSync(join(project, "handlingsvagen", "pipeline", "scripts", "koppling-peka-om.mts"), join(scripts, "koppling-peka-om.mts"));
    symlinkSync(join(project, "handlingsvagen", "pipeline", "src"), join(root, "handlingsvagen", "pipeline", "src"), "dir");
    symlinkSync(join(project, "pipeline", "src"), join(root, "pipeline", "src"), "dir");
    copyFileSync(join(project, "data", "promises.json"), join(root, "data", "promises.json"));
    copyFileSync(join(project, "handlingsvagen", "data", "kopplingar.json"), join(data, "kopplingar.json"));
    const promises = JSON.parse(readFileSync(join(root, "data", "promises.json"), "utf8")) as Array<{ id: string; group_id: string | null; status: string }>;
    const links = JSON.parse(readFileSync(join(data, "kopplingar.json"), "utf8")) as Array<{ id: string; promise_id?: string; handling_id: string; status: string; ompekad?: unknown }>;
    const byId = new Map(promises.map((p) => [p.id, p]));
    const occupied = new Set(links.filter((k) => k.status === "aktiv").map((k) => JSON.stringify([k.handling_id, k.promise_id])));
    let found: { link: (typeof links)[number]; to: string } | undefined;
    for (const link of links) {
      if (link.status !== "aktiv" || link.ompekad) continue;
      const source = byId.get(link.promise_id ?? "");
      if (!source?.group_id) continue;
      const target = promises.find((p) => p.id !== source.id && p.status === "aktiv" && p.group_id === source.group_id && !occupied.has(JSON.stringify([link.handling_id, p.id])));
      if (target) { found = { link, to: target.id }; break; }
    }
    assert.ok(found, "det aktuella beståndet måste ha en giltig ompekning att prova");
    const before = readFileSync(join(data, "kopplingar.json"), "utf8");
    const list = join(root, "lista.txt");
    const row = `${found.link.id}\t${found.to}\tHandlingen gäller samma dokumenterade åtagande och belägget ska följa det kvarvarande löftet.\n`;
    writeFileSync(list, row);
    writeFileSync(join(data, "rattelser.json"), "trasigt\n");
    const args = ["--import", "tsx/esm", join(scripts, "koppling-peka-om.mts"), list, "--skriv"];
    const run = () => spawnSync(process.execPath, args, { cwd: join(project, "handlingsvagen", "pipeline"), encoding: "utf8" });
    assert.notEqual(run().status, 0, "trasig rättelselogg ska stoppa före kopplingsändring");
    assert.equal(readFileSync(join(data, "kopplingar.json"), "utf8"), before);
    writeFileSync(join(data, "rattelser.json"), "[]\n");
    writeFileSync(list, row + row);
    assert.notEqual(run().status, 0, "samma koppling två gånger ska stoppa hela listan");
    assert.equal(readFileSync(join(data, "kopplingar.json"), "utf8"), before);
    writeFileSync(list, row);
    const valid = run();
    assert.equal(valid.status, 0, valid.stderr);
    const after = JSON.parse(readFileSync(join(data, "kopplingar.json"), "utf8")) as typeof links;
    assert.equal(after.find((k) => k.id === found.link.id)?.promise_id, found.to);
    const notes = JSON.parse(readFileSync(join(data, "rattelser.json"), "utf8")) as Array<{ affects: string }>;
    assert.equal(notes.length, 1);
    assert.match(notes[0]!.affects, new RegExp(found.link.promise_id!));
    assert.match(notes[0]!.affects, new RegExp(found.to));
    assert.equal(existsSync(join(data, ".datatransaktion")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
