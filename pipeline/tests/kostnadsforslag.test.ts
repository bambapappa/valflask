import {createHash} from "node:crypto";
import {kanoniskJson} from "../src/underlagsversion.ts";
import {tillampaProvatKostnadsbeslut} from "../src/kostnadsbeslut.ts";
import {byggKostnadsunderlag, skapaSakprovning, sakprovningsBeredskap} from "../src/sakprovning.ts";
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {forberedKostnadsforslag, omprovaKostnadsforslag} from "../src/kostnadsforslag.ts";
const seed = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8"));
const old = structuredClone(seed.find((p: any) => p.status === "aktiv"));
const cost = {...old.cost, msek_low: 0, msek_base: 0, msek_high: 0, anchor_ids: [], harledning: {version: "harledning/1", led: [], arsprofil: {status: "okand", skal: "Syntetiskt prov"}, belopp_okant: {skal: "Syntetiskt saknat underlag"}}};
const rad = {id: old.id, kostnad: cost, skal: "Syntetiskt kontraktsprov: beloppet saknar tillräckligt underlag."};
const now = new Date("2026-10-07T12:00:00Z");
test("fryser full ny kostnad utan originalskrivning eller ärvda led", () => {
  const before = JSON.stringify(old), f = forberedKostnadsforslag(rad, [old], [], now);
  assert.deepEqual(f.nyttLofte.cost, cost);
  assert.deepEqual(omprovaKostnadsforslag(f, [old], [], f.hash), f);
  assert.equal(JSON.stringify(old), before);
});
test("ändrat föreläge, material, slutform och falsk okänd nolla stoppas", () => {
  const f = forberedKostnadsforslag(rad, [old], [], now);
  assert.throws(() => omprovaKostnadsforslag(f, [{...old, title: old.title + " ändrad"}], [], f.hash), /ändrats/);
  assert.throws(() => omprovaKostnadsforslag(f, [old], [{id: "k", slag: "kalla", adress: "https://example.test", innehall: "Nytt material"}], f.hash), /ändrats/);
  const changed = structuredClone(f); changed.nyttLofte.cost.msek_base = 12;
  assert.throws(() => omprovaKostnadsforslag(changed, [old], [], f.hash), /ändrats/);
  assert.throws(() => forberedKostnadsforslag({...rad, kostnad: {...cost, msek_low: 1}}, [old], [], now));
});

test("strukturen avvisar okänd roll, tom årsprofil och tal utan år/enhet", () => {
  for (const h of [
    {...cost.harledning, led: [{roll: "påhittad", text: "Prov"}]},
    {...cost.harledning, arsprofil: {status: "kand", ar: []}},
    {...cost.harledning, led: [{roll: "antagande", text: "Prov", tal: 1}]},
    {...cost.harledning, arsprofil: {status: "okand", skal: "   "}},
  ]) assert.throws(() => forberedKostnadsforslag({...rad, kostnad: {...cost, harledning: h}}, [old], [], now), /Ogiltig slutform/);
});

test("okänt belopp kan få ny känd kalkyl eller metodnolla utan ärvd okändmarkör", () => {
  const unknown = {...structuredClone(old), cost: structuredClone(cost), loftestyp: "reform" as const};
  for (const amount of [50, 0]) {
    const known = {...old.cost, period: "engang", msek_low: amount, msek_base: amount, msek_high: amount, anchor_ids: [],
      harledning: {version: "harledning/1", summeras: true, led: [{roll: "egen-berakning", text: "Syntetisk kalkyl, inte sakfacit", tal: amount, ar: 2027, enhet: "mkr"}], arsprofil: {status: "kand", ar: [{ar: 2027, msek: amount}]}}};
    const before = JSON.stringify(unknown);
    const f = forberedKostnadsforslag({...rad, kostnad: known}, [unknown], [], now);
    assert.equal(f.nyttLofte.cost.msek_base, amount);
    assert.ok(!Object.hasOwn(f.nyttLofte.cost.harledning as object, "belopp_okant"));
    assert.deepEqual(omprovaKostnadsforslag(f, [unknown], [], f.hash), f);
    assert.equal(JSON.stringify(unknown), before);
  }
});

test("ny kostnad får rekursivt sakunderlag och inget moment blir automatiskt godkänt", () => {
  const before = JSON.stringify(old), f = forberedKostnadsforslag(rad, [old], [], now);
  const u = byggKostnadsunderlag(f, [old], []);
  assert.deepEqual(u.poster.poster.find(p => p.id === old.id && p.slag === "lofte")!.innehall, f.nyttLofte);
  const proof = skapaSakprovning(u);
  assert.ok(proof.bedomningar.every(b => b.utfall === "oavgjort"));
  assert.equal(sakprovningsBeredskap(proof, u).klar, false);
  assert.equal(JSON.stringify(old), before);
});

test("beslutsvägen kräver separat exakt prövning och ger bara en kopia", () => {
  const refs = [{id: "källa", slag: "kalla" as const, adress: "https://example.test/kalla", innehall: "Syntetiskt material"}, {id: "regel", slag: "regel" as const, adress: "testregel", innehall: "Syntetisk regel"}];
  const f = forberedKostnadsforslag(rad, [old], refs, now), proof = skapaSakprovning(byggKostnadsunderlag(f, [old], refs));
  const digest = (v: unknown) => createHash("sha256").update(kanoniskJson(v)).digest("hex");
  assert.throws(() => tillampaProvatKostnadsbeslut(rad, [old], undefined, undefined), /separat/);
  const unreviewed = {forslag: f, provning: proof, aktuellaReferenser: refs, provningshash: digest(proof)};
  assert.throws(() => tillampaProvatKostnadsbeslut(rad, [old], unreviewed, unreviewed.provningshash), /inte klar/);
  proof.bedomare = "Syntetisk provbedömare — ingen faktisk sakprövning";
  for (const b of proof.bedomningar) { b.utfall = "styrkt"; b.motivering = "Syntetiskt kontraktsprov"; b.belagg = ["källa", "regel"]; }
  const ready = {...unreviewed, provningshash: digest(proof)}, before = JSON.stringify(old);
  const after = tillampaProvatKostnadsbeslut(rad, [old], ready, ready.provningshash);
  assert.deepEqual(after[0], f.nyttLofte);
  assert.equal(JSON.stringify(old), before);
  after[0]!.title += " kopieändring";
  assert.equal(JSON.stringify(old), before);
  assert.throws(() => tillampaProvatKostnadsbeslut(rad, [old], ready, "0".repeat(64)), /referens/);
  assert.throws(() => tillampaProvatKostnadsbeslut({...rad, skal: rad.skal + " ändrat"}, [old], ready, ready.provningshash), /argument/);
  assert.throws(() => tillampaProvatKostnadsbeslut(rad, [old], {...ready, aktuellaReferenser: refs.map(r => ({...r, innehall: "Ändrat material"}))}, ready.provningshash), /ändrats/);
});

test("två poster för samma år får inte maskeras av en korrekt totalsumma", () => {
  const next = {...cost, msek_low: 50, msek_base: 50, msek_high: 50, harledning: {version: "harledning/1", led: [], arsprofil: {status: "kand", ar: [{ar: 2027, msek: 25}, {ar: 2027, msek: 25}]}}};
  const before = JSON.stringify(old);
  assert.throws(() => forberedKostnadsforslag({...rad, kostnad: next}, [old], [], now), /dubblerade år/);
  assert.equal(JSON.stringify(old), before);
});
