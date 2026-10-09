import {test} from "node:test";
import assert from "node:assert/strict";
import {kanon, provningsGrind} from "../src/provningar.ts";
import {readFileSync} from "node:fs";
import {forberedKostnadspaket, kontrolleraKostnadspaket} from "../src/kostnadspaket.ts";
const posts = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8")).filter((p: any) => p.status === "aktiv").slice(0, 2);
for (const p of posts) p.group_id = "g-syntetiskt-kostnadsprov";
const rows = posts.map((p: any) => ({id: p.id, kostnad: {...p.cost, msek_low: 0, msek_base: 0, msek_high: 0, anchor_ids: [], harledning: {version: "harledning/1", led: [], arsprofil: {status: "okand", skal: "Prov"}, belopp_okant: {skal: "Syntetiskt saknat underlag"}}}, skal: "Syntetiskt kontraktsprov av kostnadsändring, inte sakfacit."}));
const fore = {"promises.json": JSON.stringify(posts), "rattelser.json": "[]", "changelog.json": "[]", "provningar.json": '{"poster":[]}', "provningsskulden.json": '{"count":0,"ids":[]}'};
const input = {rader: rows, material: {}, varfor: "Syntetiskt kontraktsprov", orsak: "annat" as const};
const now = new Date("2026-10-07T12:00:00Z");
test("gemensam klassning och kostnad binds i alla sakunderlag och rättelsen", () => {
  const original = posts.map((p: any) => ({...p, loftestyp: "reform"}));
  const files = {...fore, "promises.json": JSON.stringify(original)};
  const packet = forberedKostnadspaket({...input, rader: rows.map((r: any) => ({...r, loftestyp: "inriktning" as const}))}, files, now);
  const after = JSON.parse(packet.filer.efter["promises.json"]!);
  assert.ok(after.every((p: any) => p.loftestyp === "inriktning"));
  assert.match(packet.filer.efter["rattelser.json"]!, /Löftestyp ändrad från reform till inriktning/);
  for (const review of packet.provningar) {
    assert.ok(review.underlag.poster.poster.filter(p => p.slag === "lofte").every(p => (p.innehall as any).loftestyp === "inriktning"));
    assert.equal(review.bedomare, null);
    assert.ok(review.bedomningar.every(b => b.utfall === "oavgjort"));
  }
  assert.throws(() => kontrolleraKostnadspaket(packet, files), /inte klar/);
  const ordinary = forberedKostnadspaket(input, files, now);
  assert.notDeepEqual(packet.provningar.map(p => p.underlag.hash), ordinary.provningar.map(p => p.underlag.hash));
  const changed = structuredClone(packet);
  const altered = JSON.parse(changed.filer.efter["promises.json"]!); altered[0].loftestyp = "reform";
  changed.filer.efter["promises.json"] = JSON.stringify(altered);
  assert.throws(() => kontrolleraKostnadspaket(changed, files), /slutform/);
});

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


test("gruppborttagning syns i slutlistan, sakunderlagen och den offentliga rättelsen", () => {
  const before = JSON.stringify(fore);
  const packet = forberedKostnadspaket({...input, rader: rows.map((r: any) => ({...r, ta_ur_grupp: true as const}))}, fore, now);
  const after = JSON.parse(packet.filer.efter["promises.json"]!);
  assert.ok(after.every((p: any) => p.group_id === null));
  assert.match(packet.filer.efter["rattelser.json"]!, /tas ur sin tidigare kostnadsgrupp/);
  for (const review of packet.provningar) {
    assert.ok(review.bedomningar.every(b => b.utfall === "oavgjort"));
    assert.equal((review.underlag.poster.poster.find(x => x.id === (review.underlag.forslag as import("../src/kostnadsforslag.ts").FrystKostnadsforslag).rad.id && x.slag === "lofte")!.innehall as any).group_id, null);
    assert.ok(review.underlag.poster.poster.filter(x => x.slag === "lofte").every(x => (x.innehall as any).group_id === null));
  }
  assert.throws(() => kontrolleraKostnadspaket(packet, fore), /inte klar/);
  assert.equal(JSON.stringify(fore), before);
});


test("kostnadsförslaget fryser aktuell sakexport och krymper enbart dess gamla prövningsskuld", () => {
  const baseline = forberedKostnadspaket(input, fore, now);
  const exports = baseline.forslag.map(f => ({id:f.rad.id, slag:"lofte" as const, datum:"2026-10-07", utfall:"haller-med-forbehall" as const, underlag_hash:kanon("lofte", f.nyttLofte as unknown as Record<string, unknown>)}));
  const oldRows = [{id:posts[0].id,slag:"lofte",datum:"2026-08-01",utfall:"haller",underlag_hash:"0000000000000000"},{id:"unrelated",slag:"standpunkt",datum:"2026-08-01",utfall:"haller",underlag_hash:"1111111111111111"}];
  const facit = {count:2,ids:[`lofte:${posts[0].id}`,"lofte:unrelated-debt"]};
  const files = {...fore,"provningar.json":JSON.stringify({poster:oldRows}),"provningsskulden.json":JSON.stringify(facit)};
  const before = JSON.stringify(files);
  const p = forberedKostnadspaket({...input,sakexport:exports},files,now);
  const index = JSON.parse(p.filer.efter["provningar.json"]!).poster;
  assert.deepEqual(index.find((r:any)=>r.id==="unrelated"),oldRows[1]);
  assert.deepEqual(index[1],oldRows[1],"Oberörda registerrader får inte flytta vid exporten");
  assert.deepEqual(index.find((r:any)=>r.id===posts[0].id),exports[0]);
  assert.deepEqual(JSON.parse(p.filer.efter["provningsskulden.json"]!),{count:1,ids:["lofte:unrelated-debt"]});
  for(const f of p.forslag) assert.equal(provningsGrind(new Map(index.map((r:any)=>[r.id,r])),[f.rad.id],"lofte",f.nyttLofte as unknown as Record<string, unknown>).ok,true);
  assert.ok(p.provningar.every(r=>r.bedomare===null && r.bedomningar.every(b=>b.utfall==="oavgjort")));
  assert.throws(()=>kontrolleraKostnadspaket(p,files),/inte klar/);
  assert.equal(JSON.stringify(files),before);
  for(const invalid of [exports.map(r=>({...r,underlag_hash:"0000000000000000"})),[exports[0],exports[0]],exports.map(r=>({...r,bedomningsomfang:{sak:"godkand"}})),exports.map(r=>({...r,utfall:"haller-inte"}))]) {
    assert.throws(()=>forberedKostnadspaket({...input,sakexport:invalid} as any,files,now),/sakexport|Sakexport/);
  }
});


test("sakexport ensam är inte attest och ett färdigt paket kräver exporten", () => {
  const refs = [{id:"source",slag:"kalla" as const,adress:"https://example.test/source",innehall:"Syntetiskt kontraktsprov, inget sakfacit"},{id:"rule",slag:"regel" as const,adress:"https://example.test/rule",innehall:"Syntetisk metodregel"}];
  const indata = {...input,material:Object.fromEntries(posts.map((p:any)=>[p.id,refs]))};
  const p = forberedKostnadspaket(indata,fore,now);
  function syntheticReady(packet: typeof p) {
    for(const r of packet.provningar) {r.bedomare="Syntetisk bedömare, inget mänskligt beslut";for(const b of r.bedomningar) {b.utfall="styrkt";b.motivering="Syntetiskt formatprov, inte ett sakfacit.";b.belagg=["source","rule"];}}
    return packet;
  }
  assert.throws(()=>kontrolleraKostnadspaket(syntheticReady(p),fore),/Sakexport saknas/);
  const exports = p.forslag.map(f=>({id:f.rad.id,slag:"lofte" as const,datum:"2026-10-07",utfall:"haller-med-forbehall" as const,underlag_hash:kanon("lofte",f.nyttLofte as unknown as Record<string,unknown>)}));
  const withExport = forberedKostnadspaket({...indata,sakexport:exports},fore,now);
  assert.throws(()=>kontrolleraKostnadspaket(withExport,fore),/inte klar/);
  assert.doesNotThrow(()=>kontrolleraKostnadspaket(syntheticReady(withExport),fore));
  withExport.filer.efter["provningar.json"]='{"poster":[]}';
  assert.throws(()=>kontrolleraKostnadspaket(withExport,fore),/slutform/);
});
