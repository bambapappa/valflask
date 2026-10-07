import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {forberedKostnadspaket, kontrolleraKostnadspaket} from "../src/kostnadspaket.ts";
const posts = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8")).filter((p: any) => p.status === "aktiv").slice(0, 2);
for (const p of posts) p.group_id = "g-syntetiskt-kostnadsprov";
const rows = posts.map((p: any) => ({id: p.id, kostnad: {...p.cost, msek_low: 0, msek_base: 0, msek_high: 0, anchor_ids: [], harledning: {version: "harledning/1", led: [], arsprofil: {status: "okand", skal: "Prov"}, belopp_okant: {skal: "Syntetiskt saknat underlag"}}}, skal: "Syntetiskt kontraktsprov av kostnadsändring, inte sakfacit."}));
const fore = {"promises.json": JSON.stringify(posts), "rattelser.json": "[]", "changelog.json": "[]"};
const input = {rader: rows, material: {}, varfor: "Syntetiskt kontraktsprov", orsak: "annat" as const};
const now = new Date("2026-10-07T12:00:00Z");
test("kostnadsbulk binder samtidiga gruppändringar och lämnar föreläget orört", () => {
  const before = JSON.stringify(fore), p = forberedKostnadspaket(input, fore, now);
  assert.equal(p.forslag.length, 2);
  for (const prov of p.provningar) {
    for (const f of p.forslag) assert.deepEqual(prov.underlag.poster.poster.find(x => x.id === f.rad.id && x.slag === "lofte")!.innehall, f.nyttLofte);
    assert.ok(prov.bedomningar.every(b => b.utfall === "oavgjort"));
  }
  assert.match(p.filer.efter["rattelser.json"]!, /kostnad och härledning omprövade/);
  assert.throws(() => kontrolleraKostnadspaket(p, fore), /inte klar/);
  assert.equal(JSON.stringify(fore), before);
});
test("tom, dubblerad, ändrad och stale kostnadsbulk stoppas", () => {
  assert.throws(() => forberedKostnadspaket({...input, rader: []}, fore, now), /Tom/);
  assert.throws(() => forberedKostnadspaket({...input, rader: [rows[0], rows[0]]}, fore, now), /dubblerad/);
  const p = forberedKostnadspaket(input, fore, now);
  const changed = structuredClone(p); changed.filer.efter["promises.json"] = "[]";
  assert.throws(() => kontrolleraKostnadspaket(changed, fore), /slutform/);
  assert.throws(() => kontrolleraKostnadspaket(p, {...fore, "changelog.json": "[{}]"}), /föreläge/);
});
