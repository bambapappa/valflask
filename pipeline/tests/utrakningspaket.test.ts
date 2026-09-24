import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync, symlinkSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { forberedUtrakningspaket, kontrolleraUtrakningspaket, verkstallUtrakningspaket, utrakningspakethash, UTRAKNINGSFILER, type Utrakningsindata, type Utrakningspaket } from "../src/utrakningspaket.ts";
import { lasFillage } from "../src/datatransaktion.ts";
import { computeDataHash } from "../src/publish.ts";
import type { PromiseEntry } from "../src/loftesforslag.ts";
const loften: PromiseEntry[] = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8"));
const mal = loften.find((p) => p.status === "aktiv" && p.cost.msek_base === 0)!;
assert.ok(mal);
const indata: Utrakningsindata = {
  rader: [{ id: mal.id, utrakning: "Tekniskt paketprov. Bas 0 miljoner kronor.", skal: "Tekniskt kontraktsprov av exakt slutform, inte ett sakligt utlåtande." }],
  material: { [mal.id]: [{ id: "kalla", slag: "kalla", adress: "test:kalla", innehall: "Syntetiskt material, inte sakfacit." }, { id: "regel", slag: "regel", adress: "test:regel", innehall: "Tekniskt formatprov." }] },
  varfor: "Tekniskt prov i isolerad kopia.", orsak: "annat",
};
const fore = { "promises.json": JSON.stringify(loften), "rattelser.json": "[]", "changelog.json": "[]" };
const nu = new Date("2026-09-14T10:00:00Z");
it("verklig CLI kräver privat paket, klar prövning och externt beslut", () => {
  const root = mkdtempSync(join(tmpdir(), "utrakningscli-")), d = join(root, "data"), pipe = join(root, "pipeline");
  try {
    mkdirSync(d); cpSync(join(import.meta.dirname, "../../data/parties.json"), join(d, "parties.json")); mkdirSync(join(pipe, "scripts"), { recursive: true });
    for (const n of ["src", "schemas", "prompts"]) cpSync(join(import.meta.dirname, "..", n), join(pipe, n), { recursive: true });
    cpSync(join(import.meta.dirname, "../package.json"), join(pipe, "package.json"));
    cpSync(join(import.meta.dirname, "../scripts/utrakning-byt.mts"), join(pipe, "scripts/utrakning-byt.mts"));
    symlinkSync(join(import.meta.dirname, "../node_modules"), join(pipe, "node_modules"), "dir");
    for (const [n, s] of Object.entries(fore)) writeFileSync(join(d, n), s);
    const input = join(root, "indata.json"), output = join(root, "paket.json");
    writeFileSync(input, JSON.stringify(indata));
    const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/utrakning-byt.mts", ...args], { cwd: pipe, encoding: "utf8" });
    let r = run("forbered", input, output); assert.equal(r.status, 0, r.stderr);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    const sparat = readFileSync(output, "utf8");
    assert.notEqual(run("forbered", input, output).status, 0);
    assert.equal(readFileSync(output, "utf8"), sparat);
    assert.notEqual(run("kontroll", output).status, 0);
    assert.notEqual(run(input, "--skriv", "--varfor", "test").status, 0);
    assert.deepEqual(lasFillage(d, UTRAKNINGSFILER), fore);
    const p = formatprov(JSON.parse(sparat) as Utrakningspaket);
    writeFileSync(output, JSON.stringify(p));
    r = run("kontroll", output); assert.equal(r.status, 0, r.stderr); assert.ok(r.stdout.includes(utrakningspakethash(p)));
    assert.notEqual(run("verkstall", output, "0".repeat(64), "--skriv").status, 0);
    assert.notEqual(run("verkstall", output, utrakningspakethash(p)).status, 0);
    assert.deepEqual(lasFillage(d, UTRAKNINGSFILER), fore);
    r = run("verkstall", output, utrakningspakethash(p), "--skriv"); assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(lasFillage(d, UTRAKNINGSFILER), p.filer.efter);
    assert.notEqual(run("verkstall", output, utrakningspakethash(p), "--skriv").status, 0);
    assert.deepEqual(lasFillage(d, UTRAKNINGSFILER), p.filer.efter);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
function formatprov(p: Utrakningspaket): Utrakningspaket {
  const c = structuredClone(p);
  for (const prov of c.provningar) {
    prov.bedomare = "Syntetiskt formatprov, ingen mänsklig attest";
    for (const b of prov.bedomningar) { b.utfall = "styrkt"; b.motivering = "Tekniskt kontraktsprov, inte sakbedömning."; b.belagg = ["kalla", "regel"]; }
  }
  return c;
}
it("utkast avstår och exakt komplett paket skrivs först efter prövning och beslutshash", () => {
  const d = mkdtempSync(join(tmpdir(), "utrakningspaket-"));
  try {
    for (const [n, s] of Object.entries(fore)) writeFileSync(join(d, n), s);
    const utkast = forberedUtrakningspaket(indata, fore, nu);
    assert.ok(utkast.provningar.every((p) => p.bedomningar.every((b) => b.utfall === "oavgjort")));
    assert.throws(() => verkstallUtrakningspaket(d, utkast, utrakningspakethash(utkast)), /inte klar/u);
    const p = formatprov(utkast), h = utrakningspakethash(p);
    assert.throws(() => verkstallUtrakningspaket(d, p, ""), /hela paketet/u);
    const fel = structuredClone(p); fel.filer.efter["rattelser.json"] = "[]";
    assert.throws(() => verkstallUtrakningspaket(d, fel, h), /hela paketet/u);
    assert.throws(() => verkstallUtrakningspaket(d, fel, utrakningspakethash(fel)), /slutform/u);
    const bytt = structuredClone(p); bytt.provningar[0]!.bedomningar[0]!.motivering += " ändrad";
    assert.throws(() => verkstallUtrakningspaket(d, bytt, h), /hela paketet/u);
    assert.deepEqual(lasFillage(d, UTRAKNINGSFILER), fore);
    verkstallUtrakningspaket(d, p, h);
    assert.deepEqual(lasFillage(d, UTRAKNINGSFILER), p.filer.efter);
    const nya = JSON.parse(p.filer.efter["promises.json"]!);
    assert.deepEqual(nya.find((x: PromiseEntry) => x.id === mal.id), p.forslag[0]!.nyttLofte);
    assert.equal(JSON.parse(p.filer.efter["changelog.json"]!)[0].data_hash, computeDataHash(nya));
    assert.throws(() => verkstallUtrakningspaket(d, p, h), /föreläge/u);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
it("tomma och dubblerade rader, saknad fil, trasig logg och saknad prövning stoppas", () => {
  assert.throws(() => forberedUtrakningspaket({ ...indata, rader: [] }, fore, nu), /Tom/u);
  assert.throws(() => forberedUtrakningspaket({ ...indata, rader: [...indata.rader, ...indata.rader] }, fore, nu), /dubblerad/u);
  assert.throws(() => forberedUtrakningspaket(indata, { ...fore, "changelog.json": null }, nu), /saknas/u);
  assert.throws(() => forberedUtrakningspaket(indata, { ...fore, "changelog.json": "{}" }, nu), /lista/u);
  const p = formatprov(forberedUtrakningspaket(indata, fore, nu));
  assert.throws(() => kontrolleraUtrakningspaket(p, { ...fore, "changelog.json": "[{}]" }), /föreläge/u);
  p.provningar = [];
  assert.throws(() => kontrolleraUtrakningspaket(p, fore), /Prövning saknas/u);
});
