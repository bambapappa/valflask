/**
 * Sortbytet. Regeln står i `src/sortbyte.ts`.
 *
 * Provets viktigaste led är att beloppet ALDRIG rörs. Verktyget finns för att
 * sorten kan vara fel medan siffran är rätt, och kunde det flytta pengar vore
 * det ett tredje sätt att ändra en summa utan att gå genom `regelnollning`
 * eller `ankarsattning` — alltså utan deras spärrar.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { provaSortrad, tillampa, type Sortlofte, type Sortrad } from "../src/sortbyte.ts";

const lofte = (o: Partial<Sortlofte> = {}): Sortlofte =>
  ({ id: "p-2026-0625", status: "aktiv", loftestyp: "inriktning", cost: { msek_base: 0, calculation: "gammal" }, ...o });
const rad = (o: Partial<Sortrad> = {}): Sortrad => ({
  id: "p-2026-0625", sort: "reform",
  utrakning:
    "Löftet pekar ut en bestämd åtgärd: allmännyttan ska få förköpsrätt till misskötta fastigheter. " +
    "Kostnadsregeln för lagar och regleringar säger att beloppet avser åtgärden själv.",
  skal: "citatet pekar ut en bestämd rättslig åtgärd — nollan följer av regleringsregeln",
  ...o,
});

describe("sortbytets spärrar", () => {
  it("godtar ett byte från inriktning till reform på en nolla", () => {
    assert.deepEqual(provaSortrad(lofte(), rad()), { ok: true, fel: [] });
  });

  it("fäller en okänd sort", () => {
    assert.equal(provaSortrad(lofte(), rad({ sort: "paroll" })).ok, false);
  });

  it("fäller ett byte till den sort posten redan har", () => {
    assert.equal(provaSortrad(lofte({ loftestyp: "reform" }), rad({ sort: "reform" })).ok, false);
  });

  it("fäller ett byte TILL inriktning på en post med basbelopp", () => {
    // Hela skillnaden mellan sorterna. `loftestyp.test.ts` vaktar samma sak
    // mot beståndet; här fälls det innan det skrivs.
    const { ok, fel } = provaSortrad(lofte({ loftestyp: "reform", cost: { msek_base: 500 } }), rad({ sort: "inriktning" }));
    assert.equal(ok, false);
    assert.match(fel.join(" "), /bär aldrig ett basbelopp/u);
  });

  it("släpper ett byte till inriktning på en nolla", () => {
    assert.ok(provaSortrad(lofte({ loftestyp: "reform" }), rad({ sort: "inriktning" })).ok);
  });

  it("fäller en för kort uträkning och en intern beteckning", () => {
    assert.equal(provaSortrad(lofte(), rad({ utrakning: "Regeln säger noll." })).ok, false);
    assert.equal(provaSortrad(lofte(), rad({
      utrakning: "Löftet är samma sak som p-2026-1154, där hela paketet redan är prissatt och räknas en gång.",
    })).ok, false);
  });

  it("fäller ett för kort skäl, ett indraget löfte och ett som saknas", () => {
    assert.equal(provaSortrad(lofte(), rad({ skal: "fel sort" })).ok, false);
    assert.equal(provaSortrad(lofte({ status: "tillbakadragen" }), rad()).ok, false);
    assert.equal(provaSortrad(undefined, rad()).ok, false);
  });
});

describe("sortbytets verkställighet", () => {
  it("byter sort och uträkning men rör aldrig beloppet", () => {
    const efter = tillampa(lofte({ cost: { msek_base: 0, msek_high: 20, calculation: "gammal" } }), rad(), "2026-08-23");
    assert.equal(efter.loftestyp, "reform");
    assert.match(efter.cost!.calculation!, /förköpsrätt/u);
    assert.equal(efter.cost!.msek_base, 0);
    assert.equal((efter.cost as { msek_high?: number }).msek_high, 20, "taket ska stå kvar");
  });

  it("historiken säger att siffran inte ändrats och varför sorten var fel", () => {
    const h = tillampa(lofte(), rad(), "2026-08-23").history!.at(-1)!;
    assert.match(h.change, /Beloppet är oförändrat/u);
    assert.match(h.change, /nollat löfte blev därför inriktning/u);
    assert.equal(h.commit, "0000000");
  });
});
