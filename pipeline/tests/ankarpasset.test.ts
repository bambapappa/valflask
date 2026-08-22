/**
 * Vaktar passet som betar av ankarskulden.
 *
 * Skulden får bara krympa, och den ska krympa av att någon läst — inte av att
 * ett skript gissat en koppling. Provet håller de regler som går att hålla
 * utan att läsa: att målet finns och lever, att posten hör till skulden, att
 * ingen post blir sitt eget ankare, att två poster inte lånar av varandra, och
 * att utfallet `egen` verkligen tar bort lånet i stället för att skriva om
 * meningen runt det.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { provaRad, tillampa, type Ankarrad, type Lofte } from "../src/ankarpasset.ts";
import { ankarbrott } from "../src/ankarkravet.ts";

const LANAR = "Bas 15 msek i linje med jämförbara löften.";

const lofte = (id: string, over: Partial<Lofte> = {}): Lofte =>
  ({
    id,
    status: "aktiv",
    title: `Löfte ${id}`,
    cost: { calculation: LANAR, msek_base: 15 },
    ...over,
  }) as Lofte;

const karta = (...l: Lofte[]) => new Map(l.map((x) => [x.id, x]));
const rad = (over: Partial<Ankarrad> = {}): Ankarrad =>
  ({ id: "p-2026-0001", utfall: "ankare", varde: "p-2026-0002", skal: "läsningen fann X", ...over });

test("ett ankare som finns och lever godtas", () => {
  const m = karta(lofte("p-2026-0001"), lofte("p-2026-0002"));
  assert.ok(provaRad(rad(), m).ok);
});

test("ett ankare som saknas, är tillbakadraget eller är posten själv stoppas", () => {
  const m = karta(lofte("p-2026-0001"), lofte("p-2026-0002", { status: "tillbakadragen" }));
  assert.match(provaRad(rad({ varde: "p-2026-0009" }), m).fel.join(" "), /finns inte/u);
  assert.match(provaRad(rad(), m).fel.join(" "), /tillbakadragen/u);
  assert.match(provaRad(rad({ varde: "p-2026-0001" }), m).fel.join(" "), /sitt eget ankare/u);
});

test("två löften får inte låna av varandra", () => {
  // En kedja är tillåten. En cykel är två belopp som håller varandra uppe
  // utan grund i botten, och den syns inte i någon enskild post.
  const m = karta(
    lofte("p-2026-0001"),
    lofte("p-2026-0002", { cost: { calculation: LANAR, anchor_ids: ["p-2026-0001"] } }),
  );
  assert.match(provaRad(rad(), m).fel.join(" "), /cykel/u);
});

test("en post som inte bryter mot ankarkravet hör inte till passet", () => {
  const m = karta(lofte("p-2026-0001", { cost: { calculation: "Egen aritmetik, inget lån." } }), lofte("p-2026-0002"));
  assert.match(provaRad(rad(), m).fel.join(" "), /bryter inte mot ankarkravet/u);
});

test("«egen» måste ta bort lånet, inte skriva om meningen runt det", () => {
  const m = karta(lofte("p-2026-0001"));
  const kvar = provaRad(rad({ utfall: "egen", varde: "Beloppet sätts där jämförbara löften ligger, cirka 15 msek per år." }), m);
  assert.match(kvar.fel.join(" "), /påstår fortfarande ett lån/u);

  const bort = provaRad(
    rad({ utfall: "egen", varde: "15 000 uppdrag per år × 1 000 kronor i höjd ersättning ≈ 15 msek per år." }),
    m,
  );
  assert.ok(bort.ok, bort.fel.join(" "));
});

test("«egen» får inte skriva en intern beteckning i publicerad text", () => {
  const m = karta(lofte("p-2026-0001"));
  const r = provaRad(
    rad({ utfall: "egen", varde: "Samma nivå som p-2026-0578 anger, alltså 15 msek per år för samma åtgärd." }),
    m,
  );
  assert.match(r.fel.join(" "), /intern beteckning/u);
});

test("«grupp» kräver en grupp som redan finns", () => {
  const m = karta(lofte("p-2026-0001"), lofte("p-2026-0002", { group_id: "g-x" }));
  assert.ok(provaRad(rad({ utfall: "grupp", varde: "g-x" }), m).ok);
  assert.match(provaRad(rad({ utfall: "grupp", varde: "g-tom" }), m).fel.join(" "), /finns inte/u);
});

test("tillämpningen rör grunden, aldrig beloppet", () => {
  const p = lofte("p-2026-0001");
  for (const r of [
    rad({ utfall: "ankare", varde: "p-2026-0002" }),
    rad({ utfall: "grupp", varde: "g-x" }),
    rad({ utfall: "egen", varde: "15 000 uppdrag × 1 000 kronor ≈ 15 msek per år, räknat på egen hand." }),
  ]) {
    assert.equal(tillampa(p, r).cost.msek_base, 15, `${r.utfall} rörde beloppet`);
  }
  assert.deepEqual(tillampa(p, rad()).cost.anchor_ids, ["p-2026-0002"]);
  assert.equal(tillampa(p, rad({ utfall: "grupp", varde: "g-x" })).group_id, "g-x");
});

test("metodnoten kan skrivas om i samma rad som uträkningen", () => {
  // Ankarkravet läser bara `calculation`, men noten står intill den på sidan.
  // Blir den kvar påstår den ett lån sidan inte längre visar.
  const p = lofte("p-2026-0001", { cost: { calculation: LANAR, method_note: "I linje med jämförbara löften." } });
  const ut = tillampa(p, rad({ utfall: "egen", varde: "Egen aritmetik: 15 000 × 1 000 kronor.", metodnot: "Räknat på antal uppdrag." }));
  assert.equal(ut.cost.method_note, "Räknat på antal uppdrag.");
});

test("det incheckade datat: skulden i facit är exakt de poster som bryter mot kravet", () => {
  const ROT = resolve(import.meta.dirname, "../..");
  const loften = JSON.parse(readFileSync(resolve(ROT, "data/promises.json"), "utf8"));
  const facit = JSON.parse(readFileSync(resolve(ROT, "pipeline/facit/ankarskulden.json"), "utf8"));
  const brott = ankarbrott(loften);
  assert.deepEqual(
    brott.filter((id: string) => !facit.ids.includes(id)),
    [],
    "poster bryter mot ankarkravet utan att stå i skulden — listan får bara krympa",
  );
  assert.equal(facit.count, facit.ids.length, "count och ids säger olika saker");
  assert.ok(facit.ids.length > 0, "tom skuld — provet mäter då ingenting");
});
