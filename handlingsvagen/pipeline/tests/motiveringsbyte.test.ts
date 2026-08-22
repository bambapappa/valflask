/**
 * Vaktar omskrivningen av en publicerad motivering.
 *
 * Motiveringen står intill citatet i rutnätet. Skrivs den om utan spår är det
 * en tyst rättelse, och skrivs den om så att den beskriver ett annat citat än
 * det som står där har vi flyttat felet i stället för att rätta det.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bytMotivering, provaMotivering, rattelsePost } from "../src/motiveringsbyte.ts";
import type { KopplingPost } from "../src/granskning.ts";

const bas = (over: Partial<KopplingPost> = {}): KopplingPost =>
  ({
    id: "k-2026-0001",
    promise_id: "p-2026-0001",
    handling_id: "h-1",
    riktning: "stodjer",
    bevis: { citat: "Riksdagen ställer sig bakom det som anförs i motionen om saken." },
    method_note: "Motionen yrkar på saken.",
    confidence: 0.9,
    extraction: { model: "m", verified_by: "owner", run_id: "r" },
    status: "aktiv",
    ...over,
  }) as KopplingPost;

const rad = (over = {}) => ({ id: "k-2026-0001", motivering: "Ny text om saken.", skal: "läsningen fann X", ...over });

test("provningen kräver en post, en ny text och ett skäl", () => {
  assert.deepEqual(provaMotivering(undefined, rad()).fel, ["k-2026-0001 finns inte i kopplingar.json"]);
  assert.match(provaMotivering(bas(), rad({ motivering: "" })).fel.join(" "), /saknar ny motivering/u);
  assert.match(provaMotivering(bas(), rad({ skal: "" })).fel.join(" "), /saknar skäl/u);
  assert.ok(provaMotivering(bas(), rad()).ok);
});

test("en omskrivning till samma text rättar ingenting och stoppas", () => {
  // Annars skriver körningen en post i den publika rättelseloggen om en
  // rättelse som inte rättade något, och en logg full av sådana är svårare
  // att lita på än en kort.
  const k = bas();
  assert.match(provaMotivering(k, rad({ motivering: k.method_note })).fel.join(" "), /densamma/u);
});

test("interna beteckningar får inte skrivas in i publicerad text", () => {
  const fel = provaMotivering(bas(), rad({ motivering: "Samma sak som p-2026-0123 lovar." })).fel;
  assert.match(fel.join(" "), /p-2026-0123/u);
});

test("en indragen koppling visas inte för läsaren och ska inte skrivas om", () => {
  const fel = provaMotivering(bas({ status: "indragen" }), rad()).fel;
  assert.match(fel.join(" "), /bara aktiva/u);
});

test("bytet räknar om brödtextgrunden ur den nya prosan", () => {
  const med = bas({
    bevis: { citat: "citat ur brödtexten", brodtext_oppen: "anslagsrad" },
    method_note: "Motionens anslagsyrkande anvisar anslagen enligt tabellen i motionen, och tabellen …",
  });

  // Skrivs undantaget ut igen står grunden kvar.
  const kvar = bytMotivering(med, rad({ motivering: "Ny inledning. Motionens anslagsyrkande anvisar anslagen enligt tabellen i motionen, och raden är 1:1." }));
  assert.equal(kvar.bevis.brodtext_oppen, "anslagsrad");

  // Försvinner prosan måste fältet följa med — annars påstår fältet en grund
  // som ingen text längre förklarar.
  const bort = bytMotivering(med, rad({ motivering: "Motionen yrkar på saken och inget mer." }));
  assert.equal(bort.bevis.brodtext_oppen, undefined);

  // Citatet, riktningen och handlingen står stilla.
  assert.equal(bort.bevis.citat, med.bevis.citat);
  assert.equal(bort.riktning, med.riktning);
  assert.equal(bort.handling_id, med.handling_id);
});

test("rättelseposten namnger varje berört löfte", () => {
  // Rättelsenoten på löftessidan väljs genom att söka löftets id i `affects`.
  // Namnges inte löftet får sidan ingen not, och rättelsen blir tyst just där
  // den behövde synas.
  const post = rattelsePost([rad(), rad({ id: "k-2026-0002" })], ["p-2026-0001", "p-2026-0002"], "2026-08-22", "därför");
  assert.match(post.affects, /p-2026-0001/u);
  assert.match(post.affects, /p-2026-0002/u);
  assert.equal(post.why, "därför");
  assert.equal(post.commit, "0000000");
});
