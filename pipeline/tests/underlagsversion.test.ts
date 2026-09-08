import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bindUnderlag, sammaUnderlag, kanoniskJson, type Underlagspost } from "../src/underlagsversion.ts";

const root = resolve(import.meta.dirname, "../..");
const read = (file: string): any[] => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const promises = read("data/promises.json");
const links = read("handlingsvagen/data/kopplingar.json");
const handlingar = read("handlingsvagen/data/handlingar.json");
const p = promises.find((x) => x.status === "aktiv" && x.cost.anchor_ids?.length);
assert.ok(p?.id && p.quote, "saknar verkligt löfte med kalkylankare");
const ankare = promises.find((x) => x.id === p.cost.anchor_ids[0]);
assert.ok(ankare?.quote, "det verkliga ankaret måste finnas");
const k = links.find((x) => x.status === "aktiv" && x.motionstyp === "parti");
assert.ok(k?.bevis.citat, "saknar verklig partikoppling");
const handling = handlingar.find((x) => x.id === k.handling_id);
assert.ok(handling?.url, "kopplingens handling måste finnas");

function loften(): Underlagspost[] {
  return [
    { slag: "lofte", id: p.id, innehall: structuredClone(p), beroenden: [`lofte:${ankare.id}`] },
    { slag: "lofte", id: ankare.id, innehall: structuredClone(ankare), beroenden: [] },
  ];
}

test("samtliga tidigare oskyddade sakfält ändrar underlagets version", () => {
  const original = bindUnderlag(`lofte:${p.id}`, loften());
  const mutations = [
    (x: any) => { x.loftestyp = x.loftestyp === "reform" ? "inriktning" : "reform"; },
    (x: any) => { x.cost.anchor_ids = ["p-2026-annan"]; },
    (x: any) => { x.cost.basis_url = "https://example.com/annan"; },
    (x: any) => { x.cost.method_note = "En annan kalkylgrund"; },
    (x: any) => { x.cost.period = x.cost.period === "per_ar" ? "engang" : "per_ar"; },
    (x: any) => { x.financing_claimed.msek = 123456; },
    (x: any) => { x.quote += " Ett annat åtagande."; },
  ];
  for (const mutate of mutations) {
    const changed = loften();
    mutate(changed[0]!.innehall);
    assert.equal(sammaUnderlag(original, bindUnderlag(original.rot, changed)), false);
  }
});

test("ett ändrat kalkylankare bryter godkännandet trots samma rotpost och ankar-ID", () => {
  const original = bindUnderlag(`lofte:${p.id}`, loften());
  const changed = loften();
  (changed[1]!.innehall.cost as any).msek_base += 1;
  assert.equal(sammaUnderlag(original, bindUnderlag(original.rot, changed)), false);
});

test("partistatus och handlingens aktör är bundna till kopplingen", () => {
  const register: Underlagspost[] = [
    { slag: "koppling", id: k.id, innehall: structuredClone(k), beroenden: [`handling:${handling.id}`] },
    { slag: "handling", id: handling.id, innehall: structuredClone(handling), beroenden: [] },
  ];
  const original = bindUnderlag(`koppling:${k.id}`, register);
  const changed = structuredClone(register);
  changed[0]!.innehall.motionstyp = "enskild";
  assert.equal(sammaUnderlag(original, bindUnderlag(original.rot, changed)), false);
  changed[0]!.innehall = structuredClone(k);
  changed[1]!.innehall.parties = ["annat-parti"];
  assert.equal(sammaUnderlag(original, bindUnderlag(original.rot, changed)), false);
});

test("nyckel- och registerordning ändrar inte versionen; beroenden kan bilda en gruppcykel", () => {
  const register = loften();
  register[1]!.beroenden = [`lofte:${p.id}`];
  const original = bindUnderlag(`lofte:${p.id}`, register);
  const reversed = [...register].reverse().map((x) => ({ ...x, innehall: Object.fromEntries(Object.entries(x.innehall).reverse()) }));
  assert.ok(sammaUnderlag(original, bindUnderlag(original.rot, reversed)));
  assert.equal(original.poster.length, 2);
});

test("tomt, saknat, tvetydigt eller manipulerat underlag godtas inte", () => {
  assert.throws(() => bindUnderlag("lofte:saknas", []), /saknas/u);
  assert.throws(() => bindUnderlag(`lofte:${p.id}`, [loften()[0]!]), /beroende saknas/u);
  assert.throws(() => bindUnderlag(`lofte:${p.id}`, [...loften(), loften()[0]!]), /Dubblerad/u);
  assert.throws(() => bindUnderlag(`lofte:${p.id}`, [{ ...loften()[0]!, innehall: {} }]), /Tomt/u);
  assert.throws(() => kanoniskJson({ belopp: undefined }), /JSON/u);
  assert.throws(() => kanoniskJson({ belopp: NaN }), /JSON/u);
  const original = bindUnderlag(`lofte:${p.id}`, loften());
  const forged = structuredClone(original);
  forged.poster[0]!.innehall.title = "Ändrad efter godkännandet";
  assert.equal(sammaUnderlag(original, forged), false);
  assert.equal(sammaUnderlag(forged, original), false);
  const extra = structuredClone(original);
  extra.poster.push({ slag: "lofte", id: "ej-bundet", innehall: { quote: "Obunden post" }, beroenden: [] });
  assert.equal(sammaUnderlag(original, extra), false);
});
