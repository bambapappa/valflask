import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync, symlinkSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ANKARFILER, ankarpakethash, forberedAnkarpaket, verkstallAnkarpaket, type Ankarindata, type Ankarpaket } from "../src/ankarpaket.ts";
import { lasFillage } from "../src/datatransaktion.ts";
import type { PromiseEntry } from "../src/loftesforslag.ts";

const verkliga: PromiseEntry[] = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8"));
const mal = structuredClone(verkliga.find((p) => p.status === "aktiv")!);
const ankare = structuredClone(verkliga.find((p) => p.status === "aktiv" && p.id !== mal.id)!);
mal.id = "p-2026-9001"; mal.loftestyp = "inriktning"; mal.group_id = null;
mal.cost = { ...mal.cost, type: "utgift", period: "per_ar", msek_low: 0, msek_base: 0, msek_high: 0, calculation: "", anchor_ids: [] };
ankare.id = "p-2026-9002"; ankare.loftestyp = "reform"; ankare.group_id = null;
ankare.cost = { ...ankare.cost, type: "utgift", period: "per_ar", msek_low: 10, msek_base: 20, msek_high: 30, calculation: "20 gånger 1.", anchor_ids: [] };
const loften = [mal, ankare];
const fore = { "promises.json": JSON.stringify(loften), "rattelser.json": "[]", "changelog.json": "[]" };
const indata: Ankarindata = { rader: [{ id: mal.id, ankare: ankare.id, utrakning: "Beloppet är lånat från ett jämförbart löfte om samma bestämda åtgärd.", skal: "Tekniskt formatprov av ankare och slutform, inte en saklig bedömning." }], material: { [mal.id]: [{ id: "kalla", slag: "kalla", adress: "test:kalla", innehall: "Syntetiskt material, inte sakfacit." }, { id: "regel", slag: "regel", adress: "test:regel", innehall: "Tekniskt formatprov." }] }, varfor: "Tekniskt prov i isolerad kopia.", orsak: "annat" };
function formatprov(p: Ankarpaket): Ankarpaket { const c = structuredClone(p); for (const prov of c.provningar) { prov.bedomare = "Syntetiskt formatprov, ingen mänsklig attest"; for (const b of prov.bedomningar) { b.utfall = "styrkt"; b.motivering = "Tekniskt kontraktsprov, inte sakbedömning."; b.belagg = ["kalla", "regel"]; } } return c; }

it("verklig CLI kräver privat paket, klar prövning och externt beslut", () => {
  const root = mkdtempSync(join(tmpdir(), "ankarcli-")), d = join(root, "data"), pipe = join(root, "pipeline");
  try {
    mkdirSync(d); cpSync(join(import.meta.dirname, "../../data/parties.json"), join(d, "parties.json")); mkdirSync(join(pipe, "scripts"), { recursive: true });
    for (const n of ["src", "schemas", "prompts"]) cpSync(join(import.meta.dirname, "..", n), join(pipe, n), { recursive: true });
    cpSync(join(import.meta.dirname, "../package.json"), join(pipe, "package.json"));
    cpSync(join(import.meta.dirname, "../scripts/ankarsattning.mts"), join(pipe, "scripts/ankarsattning.mts"));
    symlinkSync(join(import.meta.dirname, "../node_modules"), join(pipe, "node_modules"), "dir");
    for (const [n, s] of Object.entries(fore)) writeFileSync(join(d, n), s);
    const input = join(root, "indata.json"), output = join(root, "paket.json"); writeFileSync(input, JSON.stringify(indata));
    const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/ankarsattning.mts", ...args], { cwd: pipe, encoding: "utf8" });
    let r = run("forbered", input, output); assert.equal(r.status, 0, r.stderr); assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.notEqual(run(input, "--skriv", "--varfor", "test").status, 0);
    assert.notEqual(run("kontroll", output).status, 0); assert.deepEqual(lasFillage(d, ANKARFILER), fore);
    const p = formatprov(JSON.parse(readFileSync(output, "utf8")) as Ankarpaket); writeFileSync(output, JSON.stringify(p));
    r = run("kontroll", output); assert.equal(r.status, 0, r.stderr); assert.ok(r.stdout.includes(ankarpakethash(p)));
    assert.notEqual(run("verkstall", output, ankarpakethash(p)).status, 0);
    r = run("verkstall", output, ankarpakethash(p), "--skriv"); assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(lasFillage(d, ANKARFILER), p.filer.efter);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("skriver exakt fullständigt paket först efter sakprövning och extern hash", () => {
  const d = mkdtempSync(join(tmpdir(), "ankarpaket-"));
  try {
    for (const [n, s] of Object.entries(fore)) writeFileSync(join(d, n), s);
    const utkast = forberedAnkarpaket(indata, fore, new Date("2026-09-14T12:00:00Z"));
    assert.throws(() => verkstallAnkarpaket(d, utkast, ankarpakethash(utkast)), /inte klar/u);
    const p = formatprov(utkast), h = ankarpakethash(p);
    assert.throws(() => verkstallAnkarpaket(d, p, "0".repeat(64)), /hela paketet/u);
    const bytt = structuredClone(p); bytt.filer.efter["rattelser.json"] = "[]";
    assert.throws(() => verkstallAnkarpaket(d, bytt, ankarpakethash(bytt)), /slutform/u);
    assert.deepEqual(lasFillage(d, ANKARFILER), fore);
    verkstallAnkarpaket(d, p, h);
    assert.deepEqual(lasFillage(d, ANKARFILER), p.filer.efter);
    assert.throws(() => verkstallAnkarpaket(d, p, h), /föreläge/u);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
