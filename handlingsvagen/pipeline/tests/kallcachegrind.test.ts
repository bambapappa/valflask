import { test } from "node:test";
import assert from "node:assert/strict";
import { arSvarsobjekt } from "../src/kallcachegrind.ts";

/**
 * Regressionen på det fel som gjorde anslagstabellen ohämtbar: hämtningen
 * lämnade ett svarsobjekt, cachen skrev ned det som `{}`, och varje senare
 * körning läste den tomma posten som ett dokument utan text.
 */
test("ett svarsobjekt känns igen på formen, inte på klassen", () => {
  const somUndici = { status: 200, text: async () => "{}", json: async () => ({}) };
  assert.equal(arSvarsobjekt(somUndici), true);
  assert.equal(arSvarsobjekt(new Response("{}")), true);
});

test("ett svarsobjekt serialiseras till en tom post — det är felet spärren finns för", () => {
  assert.equal(JSON.stringify(new Response("{}")), "{}");
});

test("riktig data släpps igenom, också när den bär ett fält som heter status", () => {
  assert.equal(arSvarsobjekt({ dokumentstatus: { dokument: { html: "<table>" } } }), false);
  assert.equal(arSvarsobjekt({ status: 200, text: "aktiv" }), false);
  assert.equal(arSvarsobjekt([{ status: "aktiv" }]), false);
  assert.equal(arSvarsobjekt(null), false);
  assert.equal(arSvarsobjekt("<table>"), false);
});
