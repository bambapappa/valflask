import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync, symlinkSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { forberedGrupppaket, kontrolleraGrupppaket, verkstallGrupppaket, grupppakethash, GRUPPFILER, type Gruppindata, type Grupppaket } from "../src/grupppaket.ts";
import { lasFillage } from "../src/datatransaktion.ts";
import { computeDataHash } from "../src/publish.ts";
import type { PromiseEntry } from "../src/loftesforslag.ts";
const loften: PromiseEntry[] = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8"));
const valda = loften.filter(p => p.status === "aktiv" && !p.group_id).slice(0, 2);
const mal = valda[0]!;
assert.equal(valda.length, 2);
const indata: Gruppindata = {
  rader: [{ grupp: "g-tekniskt-kontraktsprov", ids: valda.map(p => p.id), skal: "Tekniskt kontraktsprov av exakt slutform, inte ett sakligt utlåtande." }],
  material: Object.fromEntries(valda.map(p => [p.id, [{ id: "kalla", slag: "kalla", adress: "test:kalla", innehall: "Syntetiskt material, inte sakfacit." }, { id: "regel", slag: "regel", adress: "test:regel", innehall: "Tekniskt formatprov." }]])),
  varfor: "Tekniskt prov i isolerad kopia.", orsak: "annat",
};
const fore = { "promises.json": JSON.stringify(loften), "rattelser.json": "[]", "changelog.json": "[]" };
const nu = new Date("2026-09-14T10:00:00Z");
it("verklig CLI kräver privat paket, klar prövning och externt beslut", () => {
  const root = mkdtempSync(join(tmpdir(), "gruppcli-")), d = join(root, "data"), pipe = join(root, "pipeline");
  try {
    mkdirSync(d); cpSync(join(import.meta.dirname, "../../data/parties.json"), join(d, "parties.json")); mkdirSync(join(pipe, "scripts"), { recursive: true });
    for (const n of ["src", "schemas", "prompts"]) cpSync(join(import.meta.dirname, "..", n), join(pipe, n), { recursive: true });
    cpSync(join(import.meta.dirname, "../package.json"), join(pipe, "package.json"));
    cpSync(join(import.meta.dirname, "../scripts/gruppsattning.mts"), join(pipe, "scripts/gruppsattning.mts"));
    symlinkSync(join(import.meta.dirname, "../node_modules"), join(pipe, "node_modules"), "dir");
    for (const [n, s] of Object.entries(fore)) writeFileSync(join(d, n), s);
    const input = join(root, "indata.json"), output = join(root, "paket.json");
    writeFileSync(input, JSON.stringify(indata));
    const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/gruppsattning.mts", ...args], { cwd: pipe, encoding: "utf8" });
    let r = run("forbered", input, output); assert.equal(r.status, 0, r.stderr);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    const sparat = readFileSync(output, "utf8");
    assert.notEqual(run("forbered", input, output).status, 0);
    assert.equal(readFileSync(output, "utf8"), sparat);
    assert.notEqual(run("kontroll", output).status, 0);
    assert.notEqual(run(input, "--skriv", "--varfor", "test").status, 0);
    assert.deepEqual(lasFillage(d, GRUPPFILER), fore);
    const p = formatprov(JSON.parse(sparat) as Grupppaket);
    writeFileSync(output, JSON.stringify(p));
    r = run("kontroll", output); assert.equal(r.status, 0, r.stderr); assert.ok(r.stdout.includes(grupppakethash(p)));
    assert.notEqual(run("verkstall", output, "0".repeat(64), "--skriv").status, 0);
    assert.notEqual(run("verkstall", output, grupppakethash(p)).status, 0);
    assert.deepEqual(lasFillage(d, GRUPPFILER), fore);
    r = run("verkstall", output, grupppakethash(p), "--skriv"); assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(lasFillage(d, GRUPPFILER), p.filer.efter);
    assert.notEqual(run("verkstall", output, grupppakethash(p), "--skriv").status, 0);
    assert.deepEqual(lasFillage(d, GRUPPFILER), p.filer.efter);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
function formatprov(p: Grupppaket): Grupppaket {
  const c = structuredClone(p);
  for (const prov of c.provningar) {
    prov.bedomare = "Syntetiskt formatprov, ingen mänsklig attest";
    for (const b of prov.bedomningar) { b.utfall = "styrkt"; b.motivering = "Tekniskt kontraktsprov, inte sakbedömning."; b.belagg = ["kalla", "regel"]; }
  }
  return c;
}
it("utkast avstår och exakt komplett paket skrivs först efter prövning och beslutshash", () => {
  const d = mkdtempSync(join(tmpdir(), "grupppaket-"));
  try {
    for (const [n, s] of Object.entries(fore)) writeFileSync(join(d, n), s);
    const utkast = forberedGrupppaket(indata, fore, nu);
    assert.ok(utkast.provningar.every((p) => p.bedomningar.every((b) => b.utfall === "oavgjort")));
    assert.throws(() => verkstallGrupppaket(d, utkast, grupppakethash(utkast)), /inte klar/u);
    const p = formatprov(utkast), h = grupppakethash(p);
    assert.throws(() => verkstallGrupppaket(d, p, ""), /hela paketet/u);
    const fel = structuredClone(p); fel.filer.efter["rattelser.json"] = "[]";
    assert.throws(() => verkstallGrupppaket(d, fel, h), /hela paketet/u);
    assert.throws(() => verkstallGrupppaket(d, fel, grupppakethash(fel)), /slutform/u);
    const bytt = structuredClone(p); bytt.provningar[0]!.bedomningar[0]!.motivering += " ändrad";
    assert.throws(() => verkstallGrupppaket(d, bytt, h), /hela paketet/u);
    assert.deepEqual(lasFillage(d, GRUPPFILER), fore);
    verkstallGrupppaket(d, p, h);
    assert.deepEqual(lasFillage(d, GRUPPFILER), p.filer.efter);
    const nya = JSON.parse(p.filer.efter["promises.json"]!);
    assert.deepEqual(nya.find((x: PromiseEntry) => x.id === mal.id), p.forslag[0]!.nyttLofte);
    assert.equal(JSON.parse(p.filer.efter["changelog.json"]!)[0].data_hash, computeDataHash(nya));
    assert.throws(() => verkstallGrupppaket(d, p, h), /föreläge/u);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
it("tomma och dubblerade rader, saknad fil, trasig logg och saknad prövning stoppas", () => {
  assert.throws(() => forberedGrupppaket({ ...indata, rader: [] }, fore, nu), /Tom/u);
  assert.throws(() => forberedGrupppaket({ ...indata, rader: [...indata.rader, ...indata.rader] }, fore, nu), /dubblerad/u);
  assert.throws(() => forberedGrupppaket(indata, { ...fore, "changelog.json": null }, nu), /saknas/u);
  assert.throws(() => forberedGrupppaket(indata, { ...fore, "changelog.json": "{}" }, nu), /lista/u);
  const p = formatprov(forberedGrupppaket(indata, fore, nu));
  assert.throws(() => kontrolleraGrupppaket(p, { ...fore, "changelog.json": "[{}]" }), /föreläge/u);
  p.provningar = [];
  assert.throws(() => kontrolleraGrupppaket(p, fore), /Prövning saknas/u);
});

it("utökning bevarar befintliga medlemmar och stoppar delade grupprader", () => {
  const gamla = structuredClone(loften);
  gamla.find(p => p.id === valda[0]!.id)!.group_id = indata.rader[0]!.grupp;
  const lage = { ...fore, "promises.json": JSON.stringify(gamla) };
  const p = forberedGrupppaket(indata, lage, nu);
  assert.equal(p.forslag.length, 1);
  const efter: PromiseEntry[] = JSON.parse(p.filer.efter["promises.json"]!);
  assert.deepEqual(efter.find(p => p.id === valda[0]!.id), gamla.find(p => p.id === valda[0]!.id));
  assert.equal(efter.find(p => p.id === valda[1]!.id)!.history.length, valda[1]!.history.length + 1);
  assert.throws(() => forberedGrupppaket({ ...indata, rader: valda.map(p => ({ ...indata.rader[0]!, ids: [p.id] })) }, lage, nu), /dubblerad/u);
  assert.throws(() => forberedGrupppaket(indata, { ...fore, "promises.json": JSON.stringify(efter) }, nu), /oförändrade/u);
});
