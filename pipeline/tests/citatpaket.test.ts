import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync, symlinkSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { forberedCitatpaket, kontrolleraCitatpaket, verkstallCitatpaket, citatpakethash, CITATFILER, type Citatindata, type Citatpaket } from "../src/citatpaket.ts";
import { lasFillage } from "../src/datatransaktion.ts";
import { computeDataHash } from "../src/publish.ts";
import type { PromiseEntry } from "../src/loftesforslag.ts";
const loften: PromiseEntry[] = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8"));
const mal = loften.find(p => p.status === "aktiv" && p.source.url.startsWith("https://") && !/youtube|youtu.be|svtplay/.test(p.source.url))!;
assert.ok(mal);
const citat = "Detta är en syntetisk testmening om en möjlig åtgärd och dess tydligt angivna omfattning.";
const indata: Citatindata = {
  rader: [{ id: mal.id, citat }],
  material: { [mal.id]: [{ id: "kalla", slag: "kalla", adress: "test:kalla", innehall: "Syntetiskt material, inte sakfacit." }, { id: "regel", slag: "regel", adress: "test:regel", innehall: "Tekniskt formatprov." }] },
  varfor: "Tekniskt prov i isolerad kopia.", orsak: "annat",
};
const kallor = [{ url: mal.source.url.replace(/#.*$/u, ""), text: citat, hamtad: "2026-09-14T09:00:00Z" }];
const fore = { "promises.json": JSON.stringify(loften), "rattelser.json": "[]", "changelog.json": "[]" };
const nu = new Date("2026-09-14T10:00:00Z");
it("verklig CLI kräver privat paket, klar prövning och externt beslut", () => {
  const root = mkdtempSync(join(tmpdir(), "citatcli-")), d = join(root, "data"), pipe = join(root, "pipeline");
  try {
    mkdirSync(d); cpSync(join(import.meta.dirname, "../../data/parties.json"), join(d, "parties.json")); mkdirSync(join(pipe, "scripts"), { recursive: true });
    for (const n of ["src", "schemas", "prompts"]) cpSync(join(import.meta.dirname, "..", n), join(pipe, n), { recursive: true });
    cpSync(join(import.meta.dirname, "../package.json"), join(pipe, "package.json"));
    cpSync(join(import.meta.dirname, "../scripts/citat-byt.mts"), join(pipe, "scripts/citat-byt.mts"));
    symlinkSync(join(import.meta.dirname, "../node_modules"), join(pipe, "node_modules"), "dir");
    for (const [n, s] of Object.entries(fore)) writeFileSync(join(d, n), s);
    const input = join(root, "indata.json"), output = join(root, "paket.json");
    writeFileSync(input, JSON.stringify(indata));
    const preload = join(root, "fetch.mjs");
    writeFileSync(preload, `globalThis.fetch = async () => new Response(${JSON.stringify("<html><body><p>"+citat+"</p></body></html>")}, {status: 200, headers: {"content-type": "text/html"}});`);
    const run = (...args: string[]) => spawnSync(process.execPath, ["--import", preload, "--import", "tsx/esm", "scripts/citat-byt.mts", ...args], { cwd: pipe, encoding: "utf8" });
    let r = run("forbered", input, output); assert.equal(r.status, 0, r.stderr);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    const sparat = readFileSync(output, "utf8");
    assert.notEqual(run("forbered", input, output).status, 0);
    assert.equal(readFileSync(output, "utf8"), sparat);
    assert.notEqual(run("kontroll", output).status, 0);
    assert.notEqual(run(input, "--skriv", "--varfor", "test").status, 0);
    assert.deepEqual(lasFillage(d, CITATFILER), fore);
    const p = formatprov(JSON.parse(sparat) as Citatpaket);
    writeFileSync(output, JSON.stringify(p));
    r = run("kontroll", output); assert.equal(r.status, 0, r.stderr); assert.ok(r.stdout.includes(citatpakethash(p)));
    assert.notEqual(run("verkstall", output, "0".repeat(64), "--skriv").status, 0);
    assert.notEqual(run("verkstall", output, citatpakethash(p)).status, 0);
    assert.deepEqual(lasFillage(d, CITATFILER), fore);
    r = run("verkstall", output, citatpakethash(p), "--skriv"); assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(lasFillage(d, CITATFILER), p.filer.efter);
    assert.notEqual(run("verkstall", output, citatpakethash(p), "--skriv").status, 0);
    assert.deepEqual(lasFillage(d, CITATFILER), p.filer.efter);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
function formatprov(p: Citatpaket): Citatpaket {
  const c = structuredClone(p);
  for (const prov of c.provningar) {
    prov.bedomare = "Syntetiskt formatprov, ingen mänsklig attest";
    for (const b of prov.bedomningar) { b.utfall = "styrkt"; b.motivering = "Tekniskt kontraktsprov, inte sakbedömning."; b.belagg = ["kalla", "regel"]; }
  }
  return c;
}
it("utkast avstår och exakt komplett paket skrivs först efter prövning och beslutshash", () => {
  const d = mkdtempSync(join(tmpdir(), "citatpaket-"));
  try {
    for (const [n, s] of Object.entries(fore)) writeFileSync(join(d, n), s);
    const utkast = forberedCitatpaket(indata, fore, nu, kallor);
    assert.ok(utkast.provningar.every((p) => p.bedomningar.every((b) => b.utfall === "oavgjort")));
    assert.throws(() => verkstallCitatpaket(d, utkast, citatpakethash(utkast)), /inte klar/u);
    const p = formatprov(utkast), h = citatpakethash(p);
    assert.throws(() => verkstallCitatpaket(d, p, ""), /hela paketet/u);
    const fel = structuredClone(p); fel.filer.efter["rattelser.json"] = "[]";
    assert.throws(() => verkstallCitatpaket(d, fel, h), /hela paketet/u);
    assert.throws(() => verkstallCitatpaket(d, fel, citatpakethash(fel)), /slutform/u);
    const bytt = structuredClone(p); bytt.provningar[0]!.bedomningar[0]!.motivering += " ändrad";
    assert.throws(() => verkstallCitatpaket(d, bytt, h), /hela paketet/u);
    assert.deepEqual(lasFillage(d, CITATFILER), fore);
    verkstallCitatpaket(d, p, h);
    assert.deepEqual(lasFillage(d, CITATFILER), p.filer.efter);
    const nya = JSON.parse(p.filer.efter["promises.json"]!);
    assert.deepEqual(nya.find((x: PromiseEntry) => x.id === mal.id), p.forslag[0]!.nyttLofte);
    assert.equal(JSON.parse(p.filer.efter["changelog.json"]!)[0].data_hash, computeDataHash(nya));
    assert.throws(() => verkstallCitatpaket(d, p, h), /föreläge/u);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
it("tomma och dubblerade rader, saknad fil, trasig logg och saknad prövning stoppas", () => {
  assert.throws(() => forberedCitatpaket({ ...indata, rader: [] }, fore, nu, kallor), /Tom/u);
  assert.throws(() => forberedCitatpaket({ ...indata, rader: [...indata.rader, ...indata.rader] }, fore, nu, kallor), /dubblerad/u);
  assert.throws(() => forberedCitatpaket(indata, { ...fore, "changelog.json": null }, nu, kallor), /saknas/u);
  assert.throws(() => forberedCitatpaket(indata, { ...fore, "changelog.json": "{}" }, nu, kallor), /lista/u);
  const p = formatprov(forberedCitatpaket(indata, fore, nu, kallor));
  assert.throws(() => kontrolleraCitatpaket(p, { ...fore, "changelog.json": "[{}]" }), /föreläge/u);
  p.provningar = [];
  assert.throws(() => kontrolleraCitatpaket(p, fore), /Prövning saknas/u);
});

it("saknad eller manipulerad källtext kan inte ersättas av gammal prövning", () => {
  assert.throws(() => forberedCitatpaket(indata, fore, nu, []), /Källtext saknas/u);
  assert.throws(() => forberedCitatpaket(indata, fore, nu, [...kallor, ...kallor]), /Dubblerad källa/u);
  const p = formatprov(forberedCitatpaket(indata, fore, nu, kallor));
  const gammalHash = citatpakethash(p);
  p.kallor[0]!.text += " Ändrat sammanhang.";
  assert.notEqual(citatpakethash(p), gammalHash);
  assert.throws(() => kontrolleraCitatpaket(p, fore), /slutform/u);
});
