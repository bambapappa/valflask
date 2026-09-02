import test from "node:test";
import assert from "node:assert/strict";
import {
  SKAL_MIN_TECKEN,
  draIn,
  grupperSomByterBarare,
  provaIndragning,
  rattelsePost,
} from "../src/indragning.ts";

const SKAL =
  "Samma parti lovar samma sak på en annan sida, och den posten bär hela åtagandet med nivån utskriven.";

test("skälet måste gå att läsa — ett för kort skäl faller", () => {
  const r = provaIndragning({ id: "p-2026-0001", status: "aktiv" }, { id: "p-2026-0001", skal: "Dubblett" });
  assert.equal(r.ok, false);
  assert.ok(r.fel.some((f) => f.includes(`minst ${SKAL_MIN_TECKEN}`)), r.fel.join(" | "));
});

test("ett skäl som duger går igenom", () => {
  const r = provaIndragning({ id: "p-2026-0001", status: "aktiv" }, { id: "p-2026-0001", skal: SKAL });
  assert.equal(r.ok, true, r.fel.join(" | "));
});

test("interna koder får inte stå i skälet — det möter läsaren", () => {
  for (const kod of ["b-0020", "G3", "H4", "R3", "C5"]) {
    const r = provaIndragning(
      { id: "p-2026-0001", status: "aktiv" },
      { id: "p-2026-0001", skal: `Posten faller på ${kod} och är därför inte längre publicerbar hos oss.` },
    );
    assert.equal(r.ok, false, `${kod} skulle ha fällts`);
    assert.ok(r.fel.some((f) => f.includes(kod)), r.fel.join(" | "));
  }
});

test("ett löfte som inte finns, eller redan är tillbakadraget, faller", () => {
  assert.equal(provaIndragning(undefined, { id: "p-2026-9999", skal: SKAL }).ok, false);
  const r = provaIndragning({ id: "p-2026-0001", status: "tillbakadragen" }, { id: "p-2026-0001", skal: SKAL });
  assert.equal(r.ok, false);
  assert.ok(r.fel.some((f) => f.includes("redan tillbakadragen")), r.fel.join(" | "));
});

test("tillbakadragningen sätter status och skriver historikposten med platshållaren", () => {
  const lofte = { id: "p-2026-0001", status: "aktiv", history: [{ date: "2026-08-01", commit: "abc1234" }] };
  const ut = draIn(lofte, SKAL, "2026-08-15");
  assert.equal(ut.status, "tillbakadragen");
  assert.equal(ut.history.length, 2);
  const ny = ut.history[1] as unknown as { commit: string; change: string };
  assert.equal(ny.commit, "0000000");
  assert.ok(ny.change.includes(SKAL));
  assert.equal(lofte.history.length, 1, "originalet muteras inte");
  assert.equal(lofte.status, "aktiv");
});

test("en grupp vars bärare dras tillbaka namnges — annars ändras en summa tyst", () => {
  const loften = [
    { id: "p-2026-0001", group_id: "g-a" },
    { id: "p-2026-0002", group_id: "g-a" },
    { id: "p-2026-0003", group_id: "g-b" },
  ];
  const barare = new Map([
    ["g-a", "p-2026-0001"],
    ["g-b", "p-2026-0003"],
  ]);
  assert.deepEqual(grupperSomByterBarare(loften, new Set(["p-2026-0001"]), barare), ["g-a"]);
  // Dras en medlem som INTE bär gruppens belopp byter gruppen ingen bärare.
  assert.deepEqual(grupperSomByterBarare(loften, new Set(["p-2026-0002"]), barare), []);
});

test("ett löfte utan grupp ger ingen gruppändring", () => {
  const loften = [{ id: "p-2026-0004", group_id: null }];
  assert.deepEqual(grupperSomByterBarare(loften, new Set(["p-2026-0004"]), new Map()), []);
});

test("rättelseposten bär de mätta talen och namnger varje löfte", () => {
  const post = rattelsePost(
    [{ lofte: { id: "p-2026-0002", parties: ["kd"] }, skal: SKAL }],
    "2026-08-15",
    { partier: new Map([["kd", 160]]), riket: 160, grupperSomBytteBarare: [] },
    "annat",
  );
  assert.ok(post.affects.includes("p-2026-0002"));
  assert.ok(post.what.includes("KD minskar med 160 miljoner kronor"));
  assert.ok(post.what.includes("minskar med 160 miljoner kronor för mandatperioden"));
  assert.equal(post.commit, "0000000");
});

test("bytt gruppbärare skrivs ut i rättelseposten, och utelämnas när det inte hände", () => {
  const med = rattelsePost([{ lofte: { id: "p-2026-0002" }, skal: SKAL }], "2026-08-15", {
    partier: new Map(),
    riket: 0,
    grupperSomBytteBarare: ["g-a"],
  }, "annat");
  const utan = rattelsePost([{ lofte: { id: "p-2026-0002" }, skal: SKAL }], "2026-08-15", {
    partier: new Map(),
    riket: 0,
    grupperSomBytteBarare: [],
  }, "annat");
  assert.ok(med.what.includes("delat löfte bytte"));
  assert.ok(!utan.what.includes("delat löfte bytte"));
});
