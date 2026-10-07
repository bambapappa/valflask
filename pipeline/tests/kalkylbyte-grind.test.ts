import {tillampa, provaUtrakningsrad} from "../src/utrakningsbyte.ts";
import {test} from "node:test";
import assert from "node:assert/strict";
import {flytta, provaFlytt} from "../src/kalkylflytt.ts";
import {satt, provaAnkarrad} from "../src/ankarsattning.ts";
import {nolla, provaNollrad} from "../src/regelnollning.ts";
import {provaAldreKalkylbyte} from "../src/kalkylbyte-grind.ts";
const cost = {msek_low: 0, msek_base: 0, msek_high: 0, harledning: {version: "harledning/1", led: [], arsprofil: {status: "okand", skal: "Prov"}}};
const post = {id: "p-2026-0001", cost};
test("alla tre äldre skrivare stoppar ärvd härledning även utan förprövning", () => {
  const before = JSON.stringify(post);
  const move = {fran: "candidate", till: post.id, kostnad: {msek_base: 100, calculation: "Ny kalkyl"}, skal: "Dokumenterad ny kalkyl"};
  const anchor = {id: "p-2026-0002", cost: {msek_base: 100}};
  const row = {id: post.id, ankare: anchor.id, utrakning: "Ny kalkyl", skal: "Dokumenterat skäl"};
  const zero = {id: post.id, regel: "lagandring" as const, utrakning: "Ny kalkyl", skal: "Dokumenterat skäl"};
  assert.ok(provaFlytt(move, post).fel.some(x => x.includes("härledning")));
  assert.ok(provaAnkarrad(post, anchor, row).fel.some(x => x.includes("härledning")));
  assert.ok(provaNollrad(post, zero).fel.some(x => x.includes("härledning")));
  assert.throws(() => flytta(post, move, "2026-10-07"), /härledning/);
  assert.throws(() => satt(post, anchor, row, "2026-10-07"), /härledning/);
  assert.throws(() => nolla(post, zero, "2026-10-07"), /härledning/);
  assert.equal(JSON.stringify(post), before);
});
test("ny strukturerad kalkyl och malformed marker får inte passera äldre väg", () => {
  for (const h of [null, {}, undefined]) assert.ok(provaAldreKalkylbyte({harledning: h}).length);
  assert.deepEqual(provaAldreKalkylbyte({msek_base: 0}, {msek_base: 100}), []);
});

test("källans härledning stoppas även när mottagaren saknar struktur", () => {
  const target = {id: "p-2026-0001", cost: {msek_base: 0}};
  const move = {fran: "candidate", till: target.id, kostnad: cost, skal: "Dokumenterat skäl"};
  const anchor = {id: "p-2026-0002", cost};
  const row = {id: target.id, ankare: anchor.id, utrakning: "Ny kalkyl", skal: "Dokumenterat skäl"};
  const before = JSON.stringify([target, anchor, move]);
  assert.ok(provaFlytt(move, target).fel.some(x => x.includes("härledning")));
  assert.ok(provaAnkarrad(target, anchor, row).fel.some(x => x.includes("härledning")));
  assert.throws(() => flytta(target, move, "2026-10-07"), /härledning/);
  assert.throws(() => satt(target, anchor, row, "2026-10-07"), /härledning/);
  assert.equal(JSON.stringify([target, anchor, move]), before);
});

test("textbyte får inte lämna ny uträkning med gammal strukturerad härledning", () => {
  const row = {id: post.id, utrakning: "Ny uträkning för beloppet.", skal: "Ny bedömning ersätter tidigare resonemang i kalkylen."};
  const before = JSON.stringify(post);
  assert.ok(provaUtrakningsrad(row, new Map([[post.id, post]])).fel.some(x => x.includes("härledning")));
  assert.throws(() => tillampa(post, row), /härledning/);
  assert.equal(JSON.stringify(post), before);
});
