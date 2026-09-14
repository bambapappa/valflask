import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
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
