import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { kanoniskJson } from "../src/underlagsversion.ts";
import { forberedUtrakningsforslag, tillampaUtrakningsforslag } from "../src/utrakningsforslag.ts";
import { byggUtrakningsunderlag, skapaSakprovning, sakprovningsBeredskap } from "../src/sakprovning.ts";
import type { PromiseEntry } from "../src/loftesforslag.ts";
const loften: PromiseEntry[] = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8"));
const mal = loften.find((p) => p.status === "aktiv" && p.cost.msek_base === 0)!;
assert.ok(mal);
const rad = { id: mal.id, utrakning: "Tekniskt prov av en ändrad uträkning. Beloppet är 0 miljoner kronor.", skal: "Tekniskt kontraktsprov som inte utgör en sakbedömning av löftet." };
const nu = new Date("2026-09-13T17:00:00Z");
it("samtidiga gruppändringar binds till gemensam slutform och ogiltiga syskon stoppas", () => {
  const grupp = structuredClone(loften.slice(0, 2));
  for (const p of grupp) { p.status = "aktiv"; p.group_id = "g-formatprov"; p.cost.msek_base = 0; }
  const forslag = grupp.map((p, i) => forberedUtrakningsforslag({ ...rad, id: p.id, utrakning: `Tekniskt grupprov ${i}. Bas 0 miljoner kronor.` }, grupp, nu));
  const fore = JSON.stringify(grupp);
  const u = byggUtrakningsunderlag(forslag[0]!, grupp, [], [forslag[1]!]);
  for (const f of forslag) assert.deepEqual(u.poster.poster.find((p) => p.slag === "lofte" && p.id === f.rad.id)?.innehall, f.nyttLofte);
  assert.notEqual(u.hash, byggUtrakningsunderlag(forslag[0]!, grupp, []).hash);
  assert.throws(() => byggUtrakningsunderlag(forslag[0]!, grupp, [], [forslag[0]!]), /Dubblerad/u);
  assert.throws(() => byggUtrakningsunderlag(forslag[0]!, grupp, [], [forslag[1]!, forslag[1]!]), /Dubblerad/u);
  const fel = structuredClone(forslag[1]!); fel.nyttLofte.title += " ändrad";
  assert.throws(() => byggUtrakningsunderlag(forslag[0]!, grupp, [], [fel]), /ändrats/u);
  assert.equal(JSON.stringify(grupp), fore);
});
it("fryser befintligt löfte med historik utan att ändra aktör, kostnad eller original", () => {
  const fore = JSON.stringify(loften), f = forberedUtrakningsforslag(rad, loften, nu);
  const efter = tillampaUtrakningsforslag(JSON.parse(JSON.stringify(f)), loften, f.hash);
  assert.deepEqual(f.tidigareLofte, mal);
  assert.deepEqual(efter.find((p) => p.id === mal.id), f.nyttLofte);
  assert.deepEqual(f.nyttLofte.cost, { ...mal.cost, calculation: rad.utrakning });
  assert.deepEqual(f.nyttLofte.history, [...mal.history, { date: "2026-09-13", commit: "0000000", change: rad.skal }]);
  assert.deepEqual({ ...f.nyttLofte, cost: mal.cost, history: mal.history }, mal);
  assert.equal(JSON.stringify(loften), fore);
});
it("ändrat bestånd, ändrad slutform med ny intern hash och fel extern hash stoppas", () => {
  const f = forberedUtrakningsforslag(rad, loften, nu), andra = structuredClone(loften);
  andra[0]!.title += " ändrad";
  assert.throws(() => tillampaUtrakningsforslag(f, andra, f.hash), /ändrats/u);
  assert.throws(() => tillampaUtrakningsforslag(f, loften, "0".repeat(64)), /ändrats/u);
  const bytt = structuredClone(f); bytt.nyttLofte.parties = ["ANNAT"];
  const { hash: _, ...payload } = bytt;
  bytt.hash = createHash("sha256").update(kanoniskJson(payload)).digest("hex");
  assert.throws(() => tillampaUtrakningsforslag(bytt, loften, bytt.hash), /slutform/u);
});
it("tomt bestånd, dubbla id, okänt mål och oförändrad text stoppas", () => {
  assert.throws(() => forberedUtrakningsforslag(rad, [], nu), /Tomt/u);
  assert.throws(() => forberedUtrakningsforslag(rad, [...loften, mal], nu), /dubblerat/u);
  assert.throws(() => forberedUtrakningsforslag({ ...rad, id: "saknas" }, loften, nu), /finns inte/u);
  assert.throws(() => forberedUtrakningsforslag({ ...rad, utrakning: typeof mal.cost.calculation === "string" ? mal.cost.calculation : "" }, loften, nu));
});
it("textändringen får separat sakunderlag utan köpost och alla moment börjar oavgjorda", () => {
  const f = forberedUtrakningsforslag(rad, loften, nu);
  const refs = [{ id: "regel", slag: "regel" as const, adress: "test", innehall: "Syntetiskt formatprov, inget sakfacit." }];
  const u = byggUtrakningsunderlag(f, loften, refs), prov = skapaSakprovning(u);
  assert.equal(u.poster.rot, `lofte:${mal.id}`);
  assert.deepEqual(u.forslag, f);
  assert.ok(prov.bedomningar.every((b) => b.utfall === "oavgjort"));
  assert.equal(sakprovningsBeredskap(prov, u).klar, false);
  const andrat = byggUtrakningsunderlag(f, loften, [{ ...refs[0]!, innehall: "Ändrat referensmaterial" }]);
  assert.notEqual(andrat.hash, u.hash);
  assert.equal(sakprovningsBeredskap(prov, andrat).klar, false);
});
