import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { skapaAnkarskuldpaket, lasAnkarskuldslage, skrivAnkarskuldpaket, type Ankarskuldpaket } from "../src/ankarskuldtransaktion.ts";
import { taLaset, TRANSAKTION } from "../src/datalas.ts";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ankarskuldpaket-"));
  const dataDir = join(root, "data");
  const facitDir = join(root, "pipeline", "facit");
  mkdirSync(dataDir);
  mkdirSync(facitDir, { recursive: true });
  const fore = {
    "promises.json": "[{\"id\":\"a\"}]\n",
    "changelog.json": "[]\n",
    "rattelser.json": "[]\n",
  };
  for (const [name, content] of Object.entries(fore)) writeFileSync(join(dataDir, name), content);
  const partier = "[]\n";
  writeFileSync(join(dataDir, "parties.json"), partier);
  const facitFore = JSON.stringify({ frozen: "test", count: 2, ids: ["a", "b"] }) + "\n";
  writeFileSync(join(facitDir, "ankarskulden.json"), facitFore);
  const efter = {
    "promises.json": "[{\"id\":\"a\",\"cost\":{\"anchor_ids\":[\"b\"]}]\n",
    "changelog.json": "[{\"updated\":[\"a\"]}]\n",
    "rattelser.json": "[{\"affects\":\"a\"}]\n",
  };
  const facitEfter = JSON.stringify({ frozen: "test", count: 1, ids: ["b"] }) + "\n";
  const paket = skapaAnkarskuldpaket(fore, efter, facitFore, facitEfter, partier);
  return { root, dataDir, fore: { data: fore, facit: facitFore, partier }, efter: { data: efter, facit: facitEfter, partier }, paket };
}
function avbrott(dataDir: string, paket: Ankarskuldpaket, typ: "fel" | "avbrott") {
  const input = join(dataDir, "input.json");
  writeFileSync(input, JSON.stringify(paket));
  const script = `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
    const rename=fs.renameSync; let n=0;
    fs.renameSync=(...args)=>{ if(++n===4) { ${typ === "fel" ? "throw new Error('facitskrivning misslyckades');" : "process.exit(91);"} } return rename(...args); };
    syncBuiltinESMExports();
    const {skrivAnkarskuldpaket}=await import(${JSON.stringify(new URL("../src/ankarskuldtransaktion.ts", import.meta.url).href)});
    skrivAnkarskuldpaket(process.argv[1],JSON.parse(fs.readFileSync(process.argv[2],'utf8')));`;
  return spawnSync(process.execPath, ["--import", "tsx/esm", "-e", script, dataDir, input], { encoding: "utf8" });
}

test("fyrfilsbeslut skriver alla filer och lämnar ingen journal", () => {
  const f = fixture();
  try {
    skrivAnkarskuldpaket(f.dataDir, f.paket);
    assert.deepEqual(lasAnkarskuldslage(f.dataDir), f.efter);
    assert.equal(existsSync(join(f.dataDir, TRANSAKTION)), false);
    assert.throws(() => skrivAnkarskuldpaket(f.dataDir, f.paket), /föreläge/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("fel på facit återställer alla tre redan skrivna datafiler", () => {
  const f = fixture();
  try {
    const run = avbrott(f.dataDir, f.paket, "fel");
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /facitskrivning misslyckades/u);
    assert.deepEqual(lasAnkarskuldslage(f.dataDir), f.fore);
    assert.equal(existsSync(join(f.dataDir, TRANSAKTION)), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("avbrott behåller journal och data-aterstall återställer även facit", () => {
  const f = fixture();
  try {
    assert.equal(avbrott(f.dataDir, f.paket, "avbrott").status, 91);
    assert.ok(existsSync(join(f.dataDir, TRANSAKTION)));
    assert.throws(() => taLaset(f.dataDir, "nästa"), /oavslutad transaktion/u);
    const script = new URL("../scripts/data-aterstall.mts", import.meta.url).pathname;
    const run = spawnSync(process.execPath, ["--import", "tsx/esm", script, f.dataDir, "--skriv"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(lasAnkarskuldslage(f.dataDir), f.fore);
    assert.equal(existsSync(join(f.dataDir, TRANSAKTION)), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("främmande ändring efter avbrott stoppar återställning och behåller spärren", () => {
  const f = fixture();
  try {
    assert.equal(avbrott(f.dataDir, f.paket, "avbrott").status, 91);
    writeFileSync(join(f.root, "pipeline/facit/ankarskulden.json"), "främmande");
    const script = new URL("../scripts/data-aterstall.mts", import.meta.url).pathname;
    const run = spawnSync(process.execPath, ["--import", "tsx/esm", script, f.dataDir, "--skriv"], { encoding: "utf8" });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /utanför transaktionen/u);
    assert.equal(readFileSync(join(f.root, "pipeline/facit/ankarskulden.json"), "utf8"), "främmande");
    assert.ok(existsSync(join(f.dataDir, TRANSAKTION)));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ändrat paket och växande fryst skuld stoppas före skrivning", () => {
  const f = fixture();
  try {
    assert.throws(() => skrivAnkarskuldpaket(f.dataDir, { ...f.paket, facitEfter: f.paket.facitFore }), /ändrats/u);
    assert.throws(() => skapaAnkarskuldpaket(f.paket.data.fore, f.paket.data.efter, f.paket.facitFore,
      JSON.stringify({ count: 3, ids: ["a", "b", "c"] }), f.paket.partierFore), /bara krympa/u);
    assert.deepEqual(lasAnkarskuldslage(f.dataDir), f.fore);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
