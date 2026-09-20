import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { byggUnderlagsregister } from "../src/underlagsregister.ts";
import { bindUnderlag } from "../src/underlagsversion.ts";
import { byggPubliceringspaket } from "../src/publiceringspaket.ts";
import { forberedPubliceringsprovning, kontrolleraPubliceringsprovning, publiceringsprovningshash, type Publiceringsprovning } from "../src/publiceringsprovning.ts";
import type { Sakreferens } from "../src/sakprovning.ts";
const root = resolve(import.meta.dirname, "../..");
const read = (file: string) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const register = byggUnderlagsregister({ loften: read("data/promises.json"), standpunkter: read("data/stances.json"), kopplingar: read("handlingsvagen/data/kopplingar.json"), handlingar: read("handlingsvagen/data/handlingar.json") });
const post = register.find(p => p.slag === "lofte" && p.beroenden.length)!;
assert.ok(post);
const fore = bindUnderlag(`lofte:${post.id}`, register).poster;
const efter = structuredClone(fore), anchor = efter.find(p => `lofte:${p.id}` === post.beroenden[0])!;
assert.ok(anchor);
(anchor.innehall.cost as Record<string, any>).msek_base += 1;
const paket = byggPubliceringspaket("a".repeat(40), "b".repeat(40), fore, efter);
const manifest = "c".repeat(64);
const refs: Sakreferens[] = [{ id: "kalla", slag: "kalla", adress: "test:kalla", innehall: "Syntetiskt formatprov, inte sakfacit." }, { id: "regel", slag: "regel", adress: "test:regel", innehall: "Syntetisk prövning av tekniskt kontrakt." }];
const material = Object.fromEntries(paket.andringar.map(a => [a.rot, refs]));
function klart(p: Publiceringsprovning): Publiceringsprovning {
  const ny = structuredClone(p);
  for (const rad of ny.poster) {
    rad.bedomare = "Syntetiskt formatprov, ingen mänsklig attest";
    for (const b of rad.bedomningar) { b.utfall = "styrkt"; b.motivering = "Tekniskt kontraktsprov, inte sakbedömning."; b.belagg = ["kalla", "regel"]; }
  }
  return ny;
}
const utkast = () => forberedPubliceringsprovning(paket, manifest, material);
test("verklig beroendeändring kräver separat prövning för varje direkt och indirekt ändrad rot", () => {
  assert.ok(paket.andringar.some(a => !a.direkt));
  const p = utkast();
  assert.deepEqual(p.poster.map(p => p.andring), paket.andringar);
  assert.ok(p.poster.every(p => p.bedomare === null && p.bedomningar.every(b => b.utfall === "oavgjort")));
  assert.throws(() => kontrolleraPubliceringsprovning(p, paket, manifest, publiceringsprovningshash(p)), /moment/u);
  const f = klart(p), hash = publiceringsprovningshash(f);
  kontrolleraPubliceringsprovning(f, paket, manifest, hash);
  assert.ok(p.poster.every(p => p.bedomare === null));
  assert.throws(() => kontrolleraPubliceringsprovning(f, paket, manifest, "0".repeat(64)), /Beslutet/u);
});
test("ändrad period, parti, källtext, metod eller manifest återanvänder aldrig gammal prövning", () => {
  const p = klart(utkast()), hash = publiceringsprovningshash(p);
  for (const andring of ["period", "parti"] as const) {
    const nu = structuredClone(efter), rad = nu.find(x => x.id === anchor.id)!;
    if (andring === "period") (rad.innehall.cost as Record<string, unknown>).period = "per_ar_eller_annan_period";
    else rad.innehall.parties = ["annat-parti"];
    const ny = byggPubliceringspaket("a".repeat(40), "b".repeat(40), fore, nu);
    assert.throws(() => kontrolleraPubliceringsprovning(p, ny, manifest, hash));
  }
  assert.throws(() => kontrolleraPubliceringsprovning(p, paket, "d".repeat(64), hash));
  for (const slag of ["kalla", "regel"]) {
    const ny = structuredClone(p); ny.poster[0]!.referenser.find(r => r.slag === slag)!.innehall += " ändrat";
    assert.throws(() => kontrolleraPubliceringsprovning(ny, paket, manifest, hash), /Beslutet/u);
  }
});
test("borttagen, dubblerad, extra, avvikande eller ofullständigt bedömd post stoppas", () => {
  const p = klart(utkast());
  const mutations: ((v: Publiceringsprovning) => void)[] = [
    v => { v.poster.pop(); },
    v => { v.poster.push(structuredClone(v.poster[0]!)); },
    v => { (v as any).attesterad = true; },
    v => { v.poster[0]!.andring.direkt = !v.poster[0]!.andring.direkt; },
    v => { v.poster[0]!.bedomare = null; },
    v => { v.poster[0]!.bedomningar[0]!.utfall = "motsagt"; },
    v => { v.poster[0]!.bedomningar[0]!.utfall = "oavgjort"; },
    v => { v.poster[0]!.bedomningar[0]!.belagg = ["saknas"]; },
    v => { v.poster[0]!.bedomningar.pop(); },
    v => { v.poster[0]!.referenser = []; },
  ];
  for (const mutate of mutations) {
    const ny = structuredClone(p); mutate(ny);
    assert.throws(() => kontrolleraPubliceringsprovning(ny, paket, manifest, publiceringsprovningshash(ny)));
  }
  assert.throws(() => forberedPubliceringsprovning(paket, manifest, { saknas: refs }), /okänd/u);
});

test("publiceringsvalideraren kör utan installerade pipelineberoenden", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "publiceringsprovning-runtime-"));
  try {
    for (const namn of ["publiceringsprovning.ts", "publiceringspaket.ts", "underlagsversion.ts", "sakmoment.ts"]) cpSync(resolve(import.meta.dirname, "../src", namn), resolve(dir, namn));
    const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", "const m=await import(process.argv[1]); if(typeof m.kontrolleraPubliceringsprovning!=='function')process.exit(2)", pathToFileURL(resolve(dir, "publiceringsprovning.ts")).href], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
