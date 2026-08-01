import { test } from "node:test";
import assert from "node:assert/strict";
import { laddaProvade, mergeProvade, parNyckel, serialiseraProvade } from "../src/provade.ts";

test("parNyckel bygger stabil mål::handling-nyckel", () => {
  assert.equal(parNyckel("p-2026-0001", "h-2026-2074"), "p-2026-0001::h-2026-2074");
});

test("ladda/serialisera är en rundtur, sorterad", () => {
  const p = laddaProvade(["p-2::h-9", "p-1::h-1", "p-1::h-1"]);
  assert.equal(p.size, 2); // dubblett kollapsar
  assert.deepEqual(serialiseraProvade(p), ["p-1::h-1", "p-2::h-9"]);
});

test("mergeProvade unionar utan att tappa något och sorterar", () => {
  const farsk = ["p-1::h-1", "p-2::h-2"];
  const nya = ["p-2::h-2", "p-3::h-3"]; // en överlapp, en ny
  assert.deepEqual(mergeProvade(farsk, nya), ["p-1::h-1", "p-2::h-2", "p-3::h-3"]);
});

test("mergeProvade är idempotent — samma nycklar ger samma resultat", () => {
  const a = ["p-1::h-1", "p-2::h-2"];
  assert.deepEqual(mergeProvade(a, a), a);
  assert.deepEqual(mergeProvade(mergeProvade(a, []), []), a);
});
