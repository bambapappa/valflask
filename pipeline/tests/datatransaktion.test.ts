import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { skapaFilpaket, lasFillage, skrivFilpaket, aterstallFilpaket, type Fillage } from "../src/datatransaktion.ts";
import { taLaset, TRANSAKTION } from "../src/datalas.ts";

function data() {
  const dir = mkdtempSync(join(tmpdir(), "filpaket-"));
  const namn = ["promises.json", "needs_review.json", "changelog.json", "rattelser.json", "avvisade.json"];
  for (const n of namn) writeFileSync(join(dir, n), readFileSync(new URL(`../../data/${n}`, import.meta.url)));
  const fore = lasFillage(dir, [...namn, "ny.json"]);
  const efter: Fillage = { ...fore, "needs_review.json": "[]\n", "ny.json": "[]\n", "avvisade.json": null };
  // Riktig publicerad post med ändrad status i isolerad kopia.
  const p = JSON.parse(fore["promises.json"]!);
  p[0].status = "tillbakadragen";
  efter["promises.json"] = JSON.stringify(p);
  return { dir, fore, efter, paket: skapaFilpaket(fore, efter) };
}
function avbrott(dir: string, paket: unknown, typ: "fel" | "avbrott") {
  const input = join(dir, "input.json");
  writeFileSync(input, JSON.stringify(paket));
  const script = `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
    const rename=fs.renameSync; let n=0;
    fs.renameSync=(...args)=>{ if(++n===2) { ${typ === "fel" ? "throw new Error('skrivfel på andra filen');" : "process.exit(91);"} } return rename(...args); };
    syncBuiltinESMExports();
    const {skrivFilpaket}=await import(${JSON.stringify(new URL("../src/datatransaktion.ts", import.meta.url).href)});
    skrivFilpaket(process.argv[1],JSON.parse(fs.readFileSync(process.argv[2],'utf8')));`;
  return spawnSync(process.execPath, ["--import", "tsx/esm", "-e", script, dir, input], { encoding: "utf8" });
}
it("skriver exakt filpaket inklusive nya och borttagna filer, utan kvarvarande journal", () => {
  const { dir, fore, efter, paket } = data();
  try {
    skrivFilpaket(dir, paket);
    assert.deepEqual(lasFillage(dir, Object.keys(fore)), efter);
    assert.equal(existsSync(join(dir, TRANSAKTION)), false);
    assert.throws(() => skrivFilpaket(dir, paket), /föreläge/u);
    assert.deepEqual(lasFillage(dir, Object.keys(fore)), efter);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("fel på andra filen återställer alla ursprungliga byte", () => {
  const { dir, fore, paket } = data();
  try {
    const r = avbrott(dir, paket, "fel");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /skrivfel på andra filen/u);
    assert.deepEqual(lasFillage(dir, Object.keys(fore)), fore);
    assert.equal(existsSync(join(dir, TRANSAKTION)), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("processavbrott lämnar journal och spärr; återställning fungerar efter omstart", () => {
  const { dir, fore, paket } = data();
  try {
    assert.equal(avbrott(dir, paket, "avbrott").status, 91);
    assert.notDeepEqual(lasFillage(dir, Object.keys(fore)), fore);
    assert.ok(existsSync(join(dir, TRANSAKTION)));
    assert.throws(() => taLaset(dir, "nästa"), /oavslutad transaktion/u);
    const kommando = new URL("../scripts/data-aterstall.mts", import.meta.url).pathname;
    const utanSkriv = spawnSync(process.execPath, ["--import", "tsx/esm", kommando, dir], { encoding: "utf8" });
    assert.notEqual(utanSkriv.status, 0);
    assert.ok(existsSync(join(dir, TRANSAKTION)));
    const aterstallning = spawnSync(process.execPath, ["--import", "tsx/esm", kommando, dir, "--skriv"], { encoding: "utf8" });
    assert.equal(aterstallning.status, 0, aterstallning.stderr);
    assert.deepEqual(lasFillage(dir, Object.keys(fore)), fore);
    const slapp = taLaset(dir, "nästa"); slapp();
    skrivFilpaket(dir, paket);
    assert.deepEqual(lasFillage(dir, Object.keys(fore)), paket.efter);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("återställning vägrar skriva över främmande ändring och behåller spärren", () => {
  const { dir, paket } = data();
  try {
    assert.equal(avbrott(dir, paket, "avbrott").status, 91);
    writeFileSync(join(dir, "needs_review.json"), "främmande ändring");
    const innan = lasFillage(dir, Object.keys(paket.fore));
    assert.throws(() => aterstallFilpaket(dir), /utanför transaktionen/u);
    assert.deepEqual(lasFillage(dir, Object.keys(paket.fore)), innan);
    assert.throws(() => taLaset(dir, "nästa"), /oavslutad transaktion/u);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("tomt, ändrat eller otillåtet paket stoppas före skrivning", () => {
  const { dir, fore, paket } = data();
  try {
    assert.throws(() => skapaFilpaket({}, {}), /icke-tomma/u);
    assert.throws(() => skapaFilpaket({ "../a.json": null }, { "../a.json": null }), /filnamn/u);
    assert.throws(() => skrivFilpaket(dir, { ...paket, efter: fore }), /ändrats/u);
    assert.deepEqual(lasFillage(dir, Object.keys(fore)), fore);
    assert.equal(existsSync(join(dir, TRANSAKTION)), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
