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


test("explicit grupprättelse fryser borttagning och bevarar övriga fält", () => {
  const grouped = {...structuredClone(old), group_id: "g-test-grupp"};
  const before = JSON.stringify(grouped);
  const f = forberedKostnadsforslag({...rad, ta_ur_grupp: true}, [grouped], [], now);
  assert.equal(f.nyttLofte.group_id, null);
  assert.equal(f.tidigareLofte.group_id, "g-test-grupp");
  assert.equal(JSON.stringify(grouped), before);
  assert.match((f.nyttLofte.history.at(-1) as {change: string}).change, /tas ur sin tidigare kostnadsgrupp/);
  assert.deepEqual(omprovaKostnadsforslag(f, [grouped], [], f.hash), f);
  assert.throws(() => omprovaKostnadsforslag(f, [{...grouped, group_id: "g-annan"}], [], f.hash), /ändrats/);
  const ordinary = forberedKostnadsforslag(rad, [grouped], [], now);
  assert.equal(ordinary.nyttLofte.group_id, "g-test-grupp");
});

test("grupprättelse kräver uttryckligt giltigt val och en befintlig grupp", () => {
  const grouped = {...structuredClone(old), group_id: "g-test-grupp"};
  for (const value of [false, null, "true", 1]) {
    assert.throws(() => forberedKostnadsforslag({...rad, ta_ur_grupp: value} as any, [grouped], [], now), /grupp/i);
  }
  assert.throws(() => forberedKostnadsforslag({...rad, ta_ur_grupp: true}, [{...grouped, group_id: null}], [], now), /grupp/i);
  assert.throws(() => forberedKostnadsforslag({...rad, group_id: "g-annan"} as any, [grouped], [], now), /fält/);
});

test("enbart gruppborttagning går att bereda med oförändrad strukturerad kostnad", () => {
  const grouped = {...structuredClone(old), group_id: "g-test-grupp", cost: structuredClone(cost)};
  const f = forberedKostnadsforslag({...rad, ta_ur_grupp: true}, [grouped], [], now);
  assert.deepEqual(f.nyttLofte.cost, grouped.cost);
  assert.equal(f.nyttLofte.group_id, null);
  assert.throws(() => forberedKostnadsforslag(rad, [grouped], [], now), /oförändrad/);
});

test("kostnad och uttrycklig löftestyp får en gemensam fryst slutform", () => {
  const original = {...structuredClone(old), loftestyp: "reform" as const};
  const before = structuredClone(original);
  const f = forberedKostnadsforslag({...rad, loftestyp: "inriktning"}, [original], [], now);
  assert.equal(f.nyttLofte.loftestyp, "inriktning");
  assert.deepEqual(f.nyttLofte.cost, cost);
  assert.match((f.nyttLofte.history.at(-1) as {change: string}).change, /Löftestyp ändrad från reform till inriktning/);
  assert.deepEqual(original, before);
  assert.deepEqual(f.nyttLofte.source, original.source);
  assert.equal(f.nyttLofte.quote, original.quote);
  const ordinary = forberedKostnadsforslag(rad, [original], [], now);
  assert.equal(ordinary.nyttLofte.loftestyp, "reform");
  assert.notEqual(f.hash, ordinary.hash);
  assert.throws(() => omprovaKostnadsforslag(f, [{...original, loftestyp: "inriktning"}], [], f.hash), /ändrats/);
});

test("enbart löftestyp går att rätta men ogiltigt val och belopp på inriktning stoppas", () => {
  const original = {...structuredClone(old), loftestyp: "reform" as const, cost: structuredClone(cost)};
  const f = forberedKostnadsforslag({...rad, loftestyp: "inriktning"}, [original], [], now);
  assert.deepEqual(f.nyttLofte.cost, original.cost);
  for (const value of [null, "", "annan", false]) assert.throws(() => forberedKostnadsforslag({...rad, loftestyp: value} as any, [original], [], now), /löftestyp/i);
  assert.throws(() => forberedKostnadsforslag({...rad, loftestyp: "inriktning", kostnad: {...cost, msek_base: 25}}, [original], [], now), /inriktning/i);
  assert.throws(() => forberedKostnadsforslag({...rad, loftestyp: "reform"}, [original], [], now), /oförändrad/);
});

test('samordnad rubrik och kostnad fryses mot samma citat och bevarar övriga fält',()=>{
 const frozen=JSON.parse(readFileSync(new URL('./fixtures/norrland-fore-rattelse-2f88b22a.json',import.meta.url),'utf8'));
 const post=structuredClone(frozen.rows.find((p:any)=>p.id==='p-2026-3302'));
 const rubrik='Glesbygdsmiljard nationellt, varav 500 miljoner till Norrland';
 const f=forberedKostnadsforslag({...rad,id:post.id,rubrik},[post],[],now);
 assert.equal(f.nyttLofte.title,rubrik);assert.equal(f.nyttLofte.quote,post.quote);
 assert.deepEqual(f.nyttLofte.source,post.source);assert.equal(f.tidigareLofte.title,post.title);
 assert.throws(()=>forberedKostnadsforslag({...rad,id:post.id,rubrik:'Inför rymdturism på Mars'},[post],[],now),/rubrik|citat/i);
 assert.throws(()=>forberedKostnadsforslag({...rad,id:post.id,rubrik:123} as any,[post],[],now),/rubrik/i);
});

test('felaktig personkoppling kan tas bort i samma frysta kostnadsrättelse utan nytt namn eller sakattest',()=>{
 const post=structuredClone(seed.find((p:any)=>p.id==='p-2026-0011'));
 const before=structuredClone(post);
 assert.ok(post.person?.name);
 const f=forberedKostnadsforslag({...rad,id:post.id,person:null},[post],[],now);
 assert.equal(f.nyttLofte.person,null);
 assert.deepEqual(f.nyttLofte.parties,post.parties);
 assert.equal(f.nyttLofte.quote,post.quote);assert.deepEqual(f.nyttLofte.source,post.source);
 assert.deepEqual(post,before);
 assert.equal(f.nyttLofte.history.length,post.history.length+1);
 assert.match((f.nyttLofte.history.at(-1) as {change:string}).change,/personattribution/i);
 const proof=skapaSakprovning(byggKostnadsunderlag(f,[post],[]));
 assert.equal(proof.bedomare,null);assert.ok(proof.bedomningar.every(b=>b.utfall==='oavgjort'));
 assert.deepEqual(omprovaKostnadsforslag(f,[post],[],f.hash),f);
 assert.throws(()=>omprovaKostnadsforslag(f,[{...post,person:null}],[],f.hash),/ändrats|person/i);
 for(const invalid of [undefined,false,'Annat namn',{name:'Ny person',role:'ny roll'}]) {
  assert.throws(()=>forberedKostnadsforslag({...rad,id:post.id,person:invalid} as any,[post],[],now),/person/i);
 }
});
