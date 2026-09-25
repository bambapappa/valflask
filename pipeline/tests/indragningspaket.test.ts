import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync, symlinkSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { forberedIndragningspaket, kontrolleraIndragningspaket, verkstallIndragningspaket, indragningspakethash, INDRAGNINGSFILER, type Indragningsindata, type Indragningspaket } from "../src/indragningspaket.ts";
import { lasFillage } from "../src/datatransaktion.ts";
import { computeDataHash } from "../src/publish.ts";
import type { PromiseEntry } from "../src/loftesforslag.ts";
const loften: PromiseEntry[] = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8"));
const mal = loften.find(p => p.status === "aktiv" && !p.group_id && Number(p.cost.msek_base) > 0 && p.cost.type === "utgift")!;
assert.ok(mal);
const indata: Indragningsindata = {
  rader: [{ id: mal.id, skal: "Tekniskt kontraktsprov av exakt slutform, inte ett sakligt utlåtande." }],
  material: { [mal.id]: [{ id: "kalla", slag: "kalla", adress: "test:kalla", innehall: "Syntetiskt material, inte sakfacit." }, { id: "regel", slag: "regel", adress: "test:regel", innehall: "Tekniskt formatprov." }] },
  varfor: "Tekniskt prov i isolerad kopia.", orsak: "annat",
};
const fore = { "promises.json": JSON.stringify(loften), "rattelser.json": "[]", "changelog.json": "[]", "avvisade.json": "[]" };
const nu = new Date("2026-09-14T10:00:00Z");
it("verklig CLI kräver privat paket, klar prövning och externt beslut", () => {
  const root = mkdtempSync(join(tmpdir(), "indragningscli-")), d = join(root, "data"), pipe = join(root, "pipeline");
  try {
    mkdirSync(d); cpSync(join(import.meta.dirname, "../../data/parties.json"), join(d, "parties.json")); mkdirSync(join(pipe, "scripts"), { recursive: true });
    for (const n of ["src", "schemas", "prompts"]) cpSync(join(import.meta.dirname, "..", n), join(pipe, n), { recursive: true });
    cpSync(join(import.meta.dirname, "../package.json"), join(pipe, "package.json"));
    cpSync(join(import.meta.dirname, "../scripts/lofte-dra-in.mts"), join(pipe, "scripts/lofte-dra-in.mts"));
    symlinkSync(join(import.meta.dirname, "../node_modules"), join(pipe, "node_modules"), "dir");
    for (const [n, s] of Object.entries(fore)) writeFileSync(join(d, n), s);
    cpSync(join(import.meta.dirname, "../../site/src"), join(root, "site/src"), { recursive: true });
    const input = join(root, "indata.json"), output = join(root, "paket.json");
    writeFileSync(input, JSON.stringify(indata));
    const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/lofte-dra-in.mts", ...args], { cwd: pipe, encoding: "utf8" });
    let r = run("forbered", input, output); assert.equal(r.status, 0, r.stderr);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    const sparat = readFileSync(output, "utf8");
    assert.notEqual(run("forbered", input, output).status, 0);
    assert.equal(readFileSync(output, "utf8"), sparat);
    assert.notEqual(run("kontroll", output).status, 0);
    assert.notEqual(run(input, "--skriv", "--varfor", "test").status, 0);
    assert.deepEqual(lasFillage(d, INDRAGNINGSFILER), fore);
    const p = formatprov(JSON.parse(sparat) as Indragningspaket);
    writeFileSync(output, JSON.stringify(p));
    r = run("kontroll", output); assert.equal(r.status, 0, r.stderr); assert.ok(r.stdout.includes(indragningspakethash(p)));
    assert.notEqual(run("verkstall", output, "0".repeat(64), "--skriv").status, 0);
    assert.notEqual(run("verkstall", output, indragningspakethash(p)).status, 0);
    assert.deepEqual(lasFillage(d, INDRAGNINGSFILER), fore);
    r = run("verkstall", output, indragningspakethash(p), "--skriv"); assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(lasFillage(d, INDRAGNINGSFILER), p.filer.efter);
    assert.notEqual(run("verkstall", output, indragningspakethash(p), "--skriv").status, 0);
    assert.deepEqual(lasFillage(d, INDRAGNINGSFILER), p.filer.efter);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
function formatprov(p: Indragningspaket): Indragningspaket {
  const c = structuredClone(p);
  for (const prov of c.provningar) {
    prov.bedomare = "Syntetiskt formatprov, ingen mänsklig attest";
    for (const b of prov.bedomningar) { b.utfall = "styrkt"; b.motivering = "Tekniskt kontraktsprov, inte sakbedömning."; b.belagg = ["kalla", "regel"]; }
  }
  return c;
}
it("utkast avstår och exakt komplett paket skrivs först efter prövning och beslutshash", () => {
  const d = mkdtempSync(join(tmpdir(), "indragningspaket-"));
  try {
    for (const [n, s] of Object.entries(fore)) writeFileSync(join(d, n), s);
    const utkast = forberedIndragningspaket(indata, fore, nu);
    assert.ok(utkast.provningar.every((p) => p.bedomningar.every((b) => b.utfall === "oavgjort")));
    assert.throws(() => verkstallIndragningspaket(d, utkast, indragningspakethash(utkast)), /inte klar/u);
    const p = formatprov(utkast), h = indragningspakethash(p);
    assert.throws(() => verkstallIndragningspaket(d, p, ""), /hela paketet/u);
    const fel = structuredClone(p); fel.filer.efter["rattelser.json"] = "[]";
    assert.throws(() => verkstallIndragningspaket(d, fel, h), /hela paketet/u);
    assert.throws(() => verkstallIndragningspaket(d, fel, indragningspakethash(fel)), /slutform/u);
    const bytt = structuredClone(p); bytt.provningar[0]!.bedomningar[0]!.motivering += " ändrad";
    assert.throws(() => verkstallIndragningspaket(d, bytt, h), /hela paketet/u);
    assert.deepEqual(lasFillage(d, INDRAGNINGSFILER), fore);
    verkstallIndragningspaket(d, p, h);
    assert.deepEqual(lasFillage(d, INDRAGNINGSFILER), p.filer.efter);
    const nya = JSON.parse(p.filer.efter["promises.json"]!);
    assert.deepEqual(nya.find((x: PromiseEntry) => x.id === mal.id), p.forslag[0]!.nyttLofte);
    assert.equal(JSON.parse(p.filer.efter["changelog.json"]!)[0].data_hash, computeDataHash(nya));
    assert.throws(() => verkstallIndragningspaket(d, p, h), /föreläge/u);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
it("tomma och dubblerade rader, saknad fil, trasig logg och saknad prövning stoppas", () => {
  assert.throws(() => forberedIndragningspaket({ ...indata, rader: [] }, fore, nu), /Tom/u);
  assert.throws(() => forberedIndragningspaket({ ...indata, rader: [...indata.rader, ...indata.rader] }, fore, nu), /dubblerad/u);
  assert.throws(() => forberedIndragningspaket(indata, { ...fore, "changelog.json": null }, nu), /saknas/u);
  assert.throws(() => forberedIndragningspaket(indata, { ...fore, "changelog.json": "{}" }, nu), /lista/u);
  const p = formatprov(forberedIndragningspaket(indata, fore, nu));
  assert.throws(() => kontrolleraIndragningspaket(p, { ...fore, "changelog.json": "[{}]" }), /föreläge/u);
  p.provningar = [];
  assert.throws(() => kontrolleraIndragningspaket(p, fore), /Prövning saknas/u);
});

it("binder sajtens summering, avvisningsminne och fullständiga konsekvenser", () => {
  const p = formatprov(forberedIndragningspaket(indata, fore, nu));
  assert.match(p.konsekvenser.berakningshash, /^[a-f0-9]{64}$/u);
  assert.equal(p.konsekvenser.riket, Number(mal.cost.msek_base) * (mal.cost.period === "per_ar" ? 4 : 1));
  assert.equal(p.konsekvenser.partier.length, mal.parties.length);
  const minne = JSON.parse(p.filer.efter["avvisade.json"]!);
  assert.equal(minne.length, 1);
  assert.ok(JSON.stringify(minne).includes(indata.rader[0]!.skal));
  assert.deepEqual(JSON.parse(p.filer.efter["changelog.json"]!)[0].retracted, [mal.id]);
  const fel = structuredClone(p); fel.konsekvenser.riket += 1;
  assert.throws(() => kontrolleraIndragningspaket(fel, fore), /slutform/u);
  fel.konsekvenser = structuredClone(p.konsekvenser); fel.filer.efter["avvisade.json"] = "[]";
  assert.throws(() => kontrolleraIndragningspaket(fel, fore), /slutform/u);
  assert.throws(() => forberedIndragningspaket(indata, { ...fore, "avvisade.json": "trasig json" }, nu));
  const saknat = forberedIndragningspaket(indata, { ...fore, "avvisade.json": null }, nu);
  assert.equal(JSON.parse(saknat.filer.efter["avvisade.json"]!).length, 1);
});
