import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const script = readFileSync(new URL("../public/loftesfilter.js", import.meta.url), "utf8");
function page({date = "", saved = "alla", accepted = true, legacy = false} = {}) {
  const values = {underlag:"parti",loftestyp:"reform",valdag:"alla",regering:"alla"};
  const handlers = new Map<string, Array<(event: any) => void>>();
  let change: (event: any) => void;
  const document: any = {
    readyState:"complete", documentElement:{dataset:{estimat:accepted ? "pa" : "av"}},
    addEventListener(name: string, fn: any) { handlers.set(name,[...(handlers.get(name) ?? []),fn]); },
    dispatchEvent(event: any) { for (const fn of handlers.get(event.type) ?? []) fn(event); },
  };
  const form: any = {
    dataset:{regeringsgrans:date},
    addEventListener(_: string, fn: any) {change=fn;},
    querySelector(selector: string) {
      const name = selector.match(/name="([^"]+)"/)?.[1] as keyof typeof values;
      if (!name || legacy && name === "regering") return null;
      const value = selector.match(/value="([^"]+)"/)?.[1];
      return {get value(){return value ?? values[name];},set checked(checked: boolean){if(checked && value) values[name]=value;}};
    },
  };
  const views = ["parti","utlovat","alla"].flatMap(u=>["reform","inriktning","alla"].flatMap(t=>["fore","valdagen","efter","oklar","alla"].flatMap(v=>["fore","tilltradesdagen","efter","oklar","alla"].map(g=>({hidden:false,dataset:{loftesfilterVy:legacy ? `${u}:${t}:${v}` : `${u}:${t}:${v}:${g}`,loftesfilterVyAntal:"10"}})))));
  document.querySelectorAll = (selector: string) => selector === "[data-loftesfilter]" ? [form] : selector === "[data-loftesfilter-vy]" ? views : [];
  const storage = new Map([["loftesfilter-regering-v1",saved]]);
  runInNewContext(script,{document,window:{},localStorage:{getItem:(k: string)=>storage.get(k),setItem:(k: string,v: string)=>storage.set(k,v)},CustomEvent:class{type:string;detail:any;constructor(type:string,options:any){this.type=type;this.detail=options.detail;}}});
  return {values,document,storage,visible:()=>views.filter(v=>!v.hidden).map(v=>v.dataset.loftesfilterVy),change:(updates:Partial<typeof values>)=>{Object.assign(values,updates);change({preventDefault(){}});}};
}

test("okänd gräns ignorerar sparat före-val och lämnar standardvyn synlig",()=>{
  const p=page({saved:"fore"});
  assert.equal(p.values.regering,"alla");
  assert.deepEqual(p.visible(),["parti:reform:alla:alla"]);
});
test("fastställd gräns återställer och sparar det oberoende regeringsvalet",()=>{
  const p=page({date:"2026-10-15",saved:"fore"});
  assert.deepEqual(p.visible(),["parti:reform:alla:fore"]);
  p.change({valdag:"efter",regering:"efter"});
  assert.deepEqual(p.visible(),["parti:reform:efter:efter"]);
  assert.equal(p.storage.get("loftesfilter-regering-v1"),"efter");
});
test("godkännande av beräkningar bevarar väntande regeringsval",()=>{
  const p=page({date:"2026-10-15",accepted:false});
  p.change({underlag:"utlovat",regering:"efter"});
  assert.deepEqual(p.visible(),["parti:reform:alla:alla"]);
  p.document.documentElement.dataset.estimat="pa";
  p.document.dispatchEvent({type:"estimat:pa"});
  assert.deepEqual(p.visible(),["utlovat:reform:alla:efter"]);
});
test("ogiltigt sparat regeringsval blir alla",()=>{
  const p=page({date:"2026-10-15",saved:"not-valid"});
  assert.deepEqual(p.visible(),["parti:reform:alla:alla"]);
});
test("äldre HTML fungerar med den uppdaterade klienten under en deploy",()=>{
  const p=page({legacy:true,saved:"fore"});
  assert.ok(p.visible().every(key=>key==="parti:reform:alla"));
  assert.ok(p.visible().length>0);
});
