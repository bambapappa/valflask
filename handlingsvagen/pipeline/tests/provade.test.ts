import { test } from "node:test";
import assert from "node:assert/strict";
import {
  antalProvadePerMal,
  laddaProvade,
  mergeProvade,
  parNyckel,
  serialiseraProvade,
  tackningsordning,
} from "../src/provade.ts";

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

test("antalProvadePerMal räknar par per löfte, inte per handling", () => {
  const p = laddaProvade(["p-1::h-1", "p-1::h-2", "p-2::h-1"]);
  assert.deepEqual([...antalProvadePerMal(p)].sort(), [
    ["p-1", 2],
    ["p-2", 1],
  ]);
});

test("antalProvadePerMal ger noll för ett mål som aldrig prövats", () => {
  // Det är precis det målet en körning ska ta först — saknas det i mängden
  // måste uppslaget falla tillbaka på 0 och inte på undefined.
  const per = antalProvadePerMal(laddaProvade(["p-1::h-1"]));
  assert.equal(per.get("p-oprövad") ?? 0, 0);
});

test("minst täckta löftet först — och samma ordning varje gång vid lika täckning", () => {
  // Grinden mot att sorteringen tyst faller tillbaka till filordning
  // (b-0038). Filordningen ligger grupperad per parti, så en körning som
  // slår i taket skulle då alltid svälta samma partier. Testet använder
  // samma jämförelse som foreslag-körningen — inte en kopia av den.
  const loften = [{ id: "p-a" }, { id: "p-d" }, { id: "p-b" }, { id: "p-c" }];
  loften.sort(tackningsordning(laddaProvade(["p-a::h-1", "p-a::h-2", "p-b::h-1"])));
  assert.deepEqual(loften.map((l) => l.id), ["p-c", "p-d", "p-b", "p-a"]);
});
