import { test } from "node:test";
import assert from "node:assert/strict";
import {
  provaIndragning,
  draIn,
  malUtanKvarvarandeKoppling,
  SKAL_MIN_TECKEN,
} from "../src/indragning.ts";
import type { KopplingPost } from "../src/granskning.ts";

function koppling(over: Partial<KopplingPost> = {}): KopplingPost {
  return {
    id: "k-2026-0030",
    promise_id: "p-2026-0022",
    handling_id: "h-2026-1",
    riktning: "stodjer",
    bevis: { citat: "Slutligen är det viktigt att värna om public services roll." },
    method_note: "Motionen handlar om public service.",
    confidence: 0.9,
    status: "aktiv",
    ...over,
  } as KopplingPost;
}

const SKAL =
  "Motionens tre yrkanden gäller hörbarhet och textning, inte skyddet av public service som sådant.";

test("en läst rad med ett riktigt skäl går att verkställa", () => {
  assert.deepEqual(provaIndragning(koppling(), { id: "k-2026-0030", skal: SKAL }), {
    ok: true,
    fel: [],
  });
});

test("en koppling som inte finns stoppas", () => {
  const p = provaIndragning(undefined, { id: "k-2026-9999", skal: SKAL });
  assert.equal(p.ok, false);
  assert.match(p.fel[0]!, /finns inte/u);
});

test("en redan indragen koppling dras inte in en gång till", () => {
  const p = provaIndragning(koppling({ status: "indragen" }), { id: "k-2026-0030", skal: SKAL });
  assert.equal(p.ok, false);
  assert.match(p.fel[0]!, /redan indragen/u);
});

/**
 * Skälet står på den publicerade posten och är det enda en granskare ser om hen
 * frågar varför ett belägg försvann. «Bär inte» är inget svar.
 */
test("ett för kort skäl stoppar raden", () => {
  const p = provaIndragning(koppling(), { id: "k-2026-0030", skal: "Bär inte." });
  assert.equal(p.ok, false);
  assert.match(p.fel[0]!, new RegExp(String(SKAL_MIN_TECKEN)));
});

/** Interna koder säger ingenting för den som läser sajten. */
test("ett skäl som bär en intern kod stoppar raden", () => {
  const p = provaIndragning(koppling(), {
    id: "k-2026-0030",
    skal: "Motionen bär inte löftet enligt b-0039, och citatet står i brödtexten i stället för i yrkandet.",
  });
  assert.equal(p.ok, false);
  assert.match(p.fel[0]!, /b-0039/u);
});

test("indragningen sätter status, datum och skäl och rör inget annat", () => {
  const k = draIn(koppling(), `  ${SKAL}  `, "2026-08-08");
  assert.equal(k.status, "indragen");
  assert.deepEqual(k.indragen, { datum: "2026-08-08", skal: SKAL });
  assert.equal(k.bevis.citat, koppling().bevis.citat);
  assert.equal(k.riktning, "stodjer");
});

/**
 * Regressionen som betyder mest. En indragning som tar målets sista aktiva
 * koppling tar hela raden ur rutnätet och varje publicerad bedömning med den.
 * Testet `domar-aktuell` fäller en glömd omräkning men säger inte vilka
 * bedömningar som föll — de måste namnges i rättelseposten.
 */
test("mål som mister sitt sista belägg pekas ut", () => {
  const kopplingar = [
    koppling({ id: "k-1", promise_id: "p-A" }),
    koppling({ id: "k-2", promise_id: "p-A" }),
    koppling({ id: "k-3", promise_id: "p-B" }),
    koppling({ id: "k-4", promise_id: "p-C", status: "indragen" }),
    koppling({ id: "k-5", promise_id: "p-C" }),
  ];
  assert.deepEqual(malUtanKvarvarandeKoppling(kopplingar, new Set(["k-1"])), []);
  assert.deepEqual(malUtanKvarvarandeKoppling(kopplingar, new Set(["k-1", "k-2"])), ["p-A"]);
  assert.deepEqual(malUtanKvarvarandeKoppling(kopplingar, new Set(["k-3", "k-5"])), ["p-B", "p-C"]);
});

test("en redan indragen koppling räknas inte som kvarvarande belägg", () => {
  const kopplingar = [
    koppling({ id: "k-1", promise_id: "p-A" }),
    koppling({ id: "k-2", promise_id: "p-A", status: "indragen" }),
  ];
  assert.deepEqual(malUtanKvarvarandeKoppling(kopplingar, new Set(["k-1"])), ["p-A"]);
});
