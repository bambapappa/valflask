import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {totalFlasket, partyTotalMsek, categoryBreakdown, totalFlasketInterval, promiseTotalMsek, coalitionAggregates, buildSummary} = await import(new URL('../../site/src/lib/aggregates.ts',import.meta.url).href);
import {totalFlasket as pipelineTotal} from '../src/chronicle.ts';
const all = JSON.parse(readFileSync(new URL('../../data/promises.json', import.meta.url),'utf8'));
const ids = ['p-2026-0613','p-2026-0926','p-2026-0927','p-2026-0928','p-2026-3302'];
// Historical regression input stays frozen after the correction is published.
const family = JSON.parse(readFileSync(new URL('./fixtures/norrland-fore-rattelse-2f88b22a.json',import.meta.url),'utf8')).rows;
assert.deepEqual(family.map((p:any)=>p.id).sort(),[...ids].sort());
const historicalAll=all.map((p:any)=>family.find((r:any)=>r.id===p.id) ?? p);
function prepared() {
 const rows = structuredClone(family);
 const parts:Record<string,any[]> = {
 'p-2026-0613':[['v-norrland-kvinnor',300],['',2700]],
 'p-2026-0926':[['v-norrland-glesbygd',500],['v-norrland-kvinnor',300],['',400]],
 'p-2026-3302':[['v-norrland-glesbygd',500],['',500]],
 };
 for(const p of rows) if(parts[p.id]) {
  p.cost.msek_low=p.cost.msek_base*.75; p.cost.msek_high=p.cost.msek_base*1.35;
  p.cost.harledning={version:'harledning/1',led:[],arsprofil:{status:'okand',skal:'Synligt antagande om fortsatt årsnivå; faktisk årsbudget är inte belagd.'},
   summadelar:parts[p.id]!.map(([key,base])=>({text:key||'Återstående del',msek_low:base*.75,msek_base:base,msek_high:base*1.35,kalla_ref:'norrland',...(key?{gemensam_id:key}:{})}))};
 }
 return rows;
}
test('verkliga fem poster: tre aktiva 20,8 till 17,6; egna belopp och indragningar bevaras',()=>{
 assert.equal(totalFlasket(family),20800);
 const next=prepared(), before=structuredClone(next);
 assert.equal(totalFlasket(next),17600);
 assert.equal(pipelineTotal(next),17600);
 assert.equal(partyTotalMsek(next,'v'),17600);
 assert.equal(categoryBreakdown(next).reduce((s:number,x:{totalMsek:number})=>s+x.totalMsek,0),17600);
 assert.equal(totalFlasketInterval(next).base,17600);
 assert.deepEqual(next,before);
 assert.deepEqual(next.filter((p:any)=>p.status==='tillbakadragen'),family.filter((p:any)=>p.status==='tillbakadragen'));
 assert.deepEqual(next.filter((p:any)=>p.status==='aktiv').map(promiseTotalMsek).sort((a:number,b:number)=>a-b),[4000,4800,12000]);
});
test('delmängder avräknar bara gemensamma pengar som faktiskt finns i urvalet',()=>{
 const next=prepared().filter((p:any)=>p.status==='aktiv');
 const [women,regional,rural]=['p-2026-0613','p-2026-0926','p-2026-3302'].map(id=>next.find((p:any)=>p.id===id));
 for(const [rows,amount] of [[[regional],4800],[[regional,rural],6800],[[women,regional],15600],[[women,rural],16000]] as const){
  assert.equal(totalFlasket([...rows]),amount);assert.equal(pipelineTotal([...rows]),amount);
 }
 assert.equal(totalFlasket([...next].reverse()),17600);
});
test('ofullständig uppdelning och motstridiga gemensamma delar får inte ge en falsk summa',()=>{
 const rows=prepared();const rural=rows.find((p:any)=>p.id==='p-2026-3302');
 rural.cost.harledning.summadelar[0].msek_base=499;
 assert.throws(()=>totalFlasket(rows),/del|summa/i);
 const bad=prepared();bad.find((p:any)=>p.id==='p-2026-3302').cost.period='mandatperiod';
 assert.throws(()=>totalFlasket(bad),/gemensam|period/i);
});
test('hela oförändrade main har identisk beräkning och ingen post muteras',()=>{
 const before=JSON.stringify(all);assert.equal(totalFlasket(all),pipelineTotal(all));assert.equal(JSON.stringify(all),before);
});


test('koalition, publikt sammanfattningssvar och hela beståndet använder samma rättelse',()=>{
 const next=prepared();
 const parties=JSON.parse(readFileSync(new URL('../../data/parties.json',import.meta.url),'utf8'));
 assert.equal(coalitionAggregates(next,parties,['v']).totalFlasket,17600);
 assert.equal(coalitionAggregates(next,parties,['m']).totalFlasket,0);
 const constants=JSON.parse(readFileSync(new URL('../../data/constants.json',import.meta.url),'utf8'));
 const summary=buildSummary(next,parties,constants,[]);
 assert.equal(summary.total_msek_flasket,17600);
 assert.equal(summary.parties.find((p:any)=>p.code==='v').total_msek,17600);
 const before=all.map((p:any)=>family.find((n:any)=>n.id===p.id) ?? p);
 const full=before.map((p:any)=>next.find((n:any)=>n.id===p.id) ?? p);
 assert.equal(totalFlasket(before)-totalFlasket(full),3200);
 assert.equal(pipelineTotal(before)-pipelineTotal(full),3200);
});

test('frysning av slutform kräver korrekt uppdelning och varje dels källreferens', async()=>{
 const {forberedKostnadsforslag}=await import('../src/kostnadsforslag.ts');
 const {skapaSakprovning,byggKostnadsunderlag}=await import('../src/sakprovning.ts');
 const {kontrolleraSummadelar}=await import('../src/kostnadsdelar.ts');
 const row=prepared().find((p:any)=>p.id==='p-2026-0926');
 const rad={id:row.id,kostnad:row.cost,skal:'Syntetiskt teknikprov av fryst delbeloppsrepresentation; ingen innehållsattest.'};
 const ref={id:'norrland',slag:'kalla' as const,adress:'https://example.test/norrland',innehall:'Syntetiskt teknikmaterial; inte ett ekonomiskt belägg.'};
 assert.throws(()=>forberedKostnadsforslag(rad,historicalAll,[],new Date('2026-10-10T00:00:00Z')),/källreferens/);
 const frozen=forberedKostnadsforslag(rad,historicalAll,[ref],new Date('2026-10-10T00:00:00Z'));
 assert.deepEqual(frozen.nyttLofte.cost,row.cost);
 const proof=skapaSakprovning(byggKostnadsunderlag(frozen,historicalAll,[ref]));
 assert.ok(proof.bedomningar.every((b:any)=>b.utfall==='oavgjort'));
 const bad=structuredClone(rad); bad.kostnad.harledning.summadelar[0].msek_high=900;
 assert.throws(()=>forberedKostnadsforslag(bad,historicalAll,[ref],new Date('2026-10-10T00:00:00Z')),/summa/);
 for(const change of [(x:any)=>x.msek_low=-1,(x:any)=>x.msek_high=NaN,(x:any)=>x.kalla_ref='']) {
  const cost=structuredClone(row.cost);change(cost.harledning.summadelar[0]);assert.throws(()=>kontrolleraSummadelar(cost));
 }
});


test('uppdelning ensam får inte göra samma löfte artificiellt säkrare',()=>{
 const original=family.find((p:any)=>p.id==='p-2026-0926');
 const divided=prepared().find((p:any)=>p.id===original.id);
 assert.deepEqual(totalFlasketInterval([divided]),totalFlasketInterval([original]));
});

test('gemensam osäkerhet beror på relationen, aldrig på löftenas id',()=>{
 const rows=prepared().filter((p:any)=>p.status==='aktiv');
 const renamed=structuredClone(rows);
 for(let i=0;i<renamed.length;i++) renamed[i].id=`omdopt-${renamed.length-i}`;
 assert.deepEqual(totalFlasketInterval(renamed),totalFlasketInterval(rows));
});

test('gemensamma delar binder familjens andra poster till sakunderlaget',async()=>{
 const {byggUnderlagsregister}=await import('../src/underlagsregister.ts');
 const {bindUnderlag,sammaUnderlag}=await import('../src/underlagsversion.ts');
 const rows=prepared();
 const data={loften:rows,kopplingar:[],handlingar:[],standpunkter:[]};
 const packet=bindUnderlag('lofte:p-2026-0926',byggUnderlagsregister(data));
 assert.ok(packet.poster.some(p=>p.id==='p-2026-0613'));
 assert.ok(packet.poster.some(p=>p.id==='p-2026-3302'));
 const changed=structuredClone(data);
 changed.loften.find((p:any)=>p.id==='p-2026-3302').cost.harledning.summadelar[0].gemensam_id='annan-del';
 assert.equal(sammaUnderlag(packet,bindUnderlag(packet.rot,byggUnderlagsregister(changed))),false);
});
