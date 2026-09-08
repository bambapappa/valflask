import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { byggUnderlagsregister, type PubliceratUnderlag } from "../src/underlagsregister.ts";
import { bindUnderlag, sammaUnderlag } from "../src/underlagsversion.ts";

const root = resolve(import.meta.dirname, "../..");
const read = (file: string): any[] => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const data: PubliceratUnderlag = {
  loften: read("data/promises.json"),
  kopplingar: read("handlingsvagen/data/kopplingar.json"),
  handlingar: read("handlingsvagen/data/handlingar.json"),
  standpunkter: read("data/stances.json"),
};
const register = byggUnderlagsregister(data);

test("verkliga kalkylankare följer med från data utan en manuellt skriven beroendelista", () => {
  const p = data.loften.find((x: any) => x.status === "aktiv" && x.cost.anchor_ids?.length)!;
  assert.ok(p?.id);
  const packet = bindUnderlag(`lofte:${p.id}`, register);
  for (const id of (p.cost as any).anchor_ids) assert.ok(packet.poster.some((x) => x.slag === "lofte" && x.id === id));
  const changed = structuredClone(data);
  const id = (p.cost as any).anchor_ids[0];
  const anchor = changed.loften.find((x) => x.id === id)!;
  (anchor.cost as any).msek_base += 1;
  assert.equal(sammaUnderlag(packet, bindUnderlag(packet.rot, byggUnderlagsregister(changed))), false);
});

test("partikopplingen omfattar både det faktiska löftet och handlingens avsändare", () => {
  const k = data.kopplingar.find((x) => x.status === "aktiv" && x.motionstyp === "parti")!;
  assert.ok(k?.id && k.promise_id && k.handling_id);
  const packet = bindUnderlag(`koppling:${k.id}`, register);
  assert.ok(packet.poster.some((x) => x.slag === "lofte" && x.id === k.promise_id));
  assert.ok(packet.poster.some((x) => x.slag === "handling" && x.id === k.handling_id));
  const changed = structuredClone(data);
  changed.loften.find((x) => x.id === k.promise_id)!.quote += " Ett annat åtagande.";
  assert.equal(sammaUnderlag(packet, bindUnderlag(packet.rot, byggUnderlagsregister(changed))), false);
});

test("en ny medlem i en verklig grupp ändrar underlaget för befintliga medlemmar", () => {
  const p = data.loften.find((x) => x.status === "aktiv" && x.group_id)!;
  assert.ok(p?.id && p.group_id);
  const packet = bindUnderlag(`lofte:${p.id}`, register);
  const changed = structuredClone(data);
  changed.loften.push({ ...structuredClone(p), id: "p-prov-ny-gruppmedlem" });
  assert.equal(sammaUnderlag(packet, bindUnderlag(packet.rot, byggUnderlagsregister(changed))), false);
});

test("saknat och tvetydigt verkligt mål får inte döljas av registret", () => {
  const k = data.kopplingar.find((x) => x.status === "aktiv")!;
  assert.ok(k?.promise_id);
  const missing = { ...data, loften: data.loften.filter((x) => x.id !== k.promise_id) };
  assert.throws(() => bindUnderlag(`koppling:${k.id}`, byggUnderlagsregister(missing)), /saknas/u);
  const ambiguous = structuredClone(data);
  ambiguous.kopplingar.find((x) => x.id === k.id)!.stance_id = "annan";
  assert.throws(() => byggUnderlagsregister(ambiguous), /exakt ett mål/u);
  assert.throws(() => bindUnderlag(`koppling:${k.id}`, byggUnderlagsregister({ loften: [], kopplingar: [], handlingar: [], standpunkter: [] })), /saknas/u);
});
