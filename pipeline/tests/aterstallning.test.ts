/**
 * Återställningen. Regeln står i `src/aterstallning.ts`.
 *
 * Det led som gör verktyget värt att ha är att beloppet HÄMTAS ur en tidigare
 * revision i stället för att skrivas. Fem poster återställdes för hand 23–24
 * augusti 2026, och varje gång var det en människa som skrev en siffra på nytt
 * — just när ett fel rättas är risken störst att göra ett nytt.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aterstall, mandatperioden, provaAterstallning, type Aterstallningslofte as Lofte, type Aterstallningsrad as Rad } from "../src/aterstallning.ts";

const nu = (o: Partial<Lofte> = {}): Lofte => ({
  id: "p-2026-1629", status: "tillbakadragen", loftestyp: "reform",
  cost: { msek_base: 0, period: "per_ar", calculation: "nollad" }, ...o,
});
const fore = (o: Partial<Lofte> = {}): Lofte => ({
  id: "p-2026-1629", status: "aktiv", loftestyp: "reform",
  cost: { msek_low: 40, msek_base: 80, msek_high: 200, period: "per_ar", calculation: "egen aritmetik" }, ...o,
});
const rad = (o: Partial<Rad> = {}): Rad => ({
  id: "p-2026-1629",
  skal: "att stoppa kringgåendet av sanktioner och att utvidga dem är två skilda åtgärder",
  ...o,
});

describe("återställningens spärrar", () => {
  it("godtar en rad där allt stämmer", () => {
    assert.deepEqual(provaAterstallning(nu(), fore(), rad()), { ok: true, fel: [] });
  });

  it("fäller en post som inte är tillbakadragen", () => {
    const { ok, fel } = provaAterstallning(nu({ status: "aktiv" }), fore(), rad());
    assert.equal(ok, false);
    assert.match(fel.join(" "), /ingenting att återställa/u);
  });

  it("fäller när posten var tillbakadragen redan i den revision beloppet hämtas ur", () => {
    // Annars återställs en nolla och verktyget påstår att det var det gamla beloppet.
    const { ok, fel } = provaAterstallning(nu(), fore({ status: "tillbakadragen" }), rad());
    assert.equal(ok, false);
    assert.match(fel.join(" "), /tillbakadragen redan/u);
  });

  it("fäller när posten saknas i nuet eller i revisionen", () => {
    assert.equal(provaAterstallning(undefined, fore(), rad()).ok, false);
    assert.equal(provaAterstallning(nu(), undefined, rad()).ok, false);
  });

  it("fäller ett för kort skäl", () => {
    assert.equal(provaAterstallning(nu(), fore(), rad({ skal: "fel beslut" })).ok, false);
  });
});

describe("återställningens verkställighet", () => {
  it("hämtar hela kostnaden ur revisionen, inte ur raden", () => {
    const efter = aterstall(nu(), fore(), rad(), "2026-08-24");
    assert.equal(efter.status, "aktiv");
    assert.deepEqual(efter.cost, fore().cost);
  });

  it("lämnar rubrik, citat och grupp orörda", () => {
    const p = nu({ title: "Stoppa kringgåendet", quote: "Att krafttag tas…", group_id: "g-x" });
    const efter = aterstall(p, fore(), rad(), "2026-08-24");
    assert.equal(efter.title, "Stoppa kringgåendet");
    assert.equal(efter.quote, "Att krafttag tas…");
    assert.equal(efter.group_id, "g-x");
  });

  it("byter sort till reform när ett belopp återförs till en inriktning", () => {
    assert.equal(aterstall(nu({ loftestyp: "inriktning" }), fore(), rad(), "2026-08-24").loftestyp, "reform");
  });

  it("rör inte sorten när det återförda beloppet är noll", () => {
    const noll = fore({ cost: { msek_base: 0, period: "per_ar" } });
    assert.equal(aterstall(nu({ loftestyp: "inriktning" }), noll, rad(), "2026-08-24").loftestyp, "inriktning");
  });

  it("historiken säger att indragningen var fel och varför", () => {
    const h = aterstall(nu(), fore(), rad(), "2026-08-24").history!.at(-1)!;
    assert.match(h.change, /indragningen var fel/u);
    assert.match(h.change, /skilda åtgärder/u);
    assert.equal(h.commit, "0000000");
  });

  it("mandatperioden räknar årligt gånger fyra", () => {
    assert.equal(mandatperioden(fore()), 320);
  });
});
