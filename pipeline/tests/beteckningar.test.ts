/**
 * Interna beteckningar i publicerad text. Regeln står i `src/beteckningar.ts`.
 *
 * 103 kö-poster satt fast bakom spärren 2026-08-25: prissättningen skrev
 * numret, grinden vägrade publicera det, och ingen väg fanns däremellan.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { medOrd, REGELORD, skrivOmBeteckningar, type Loftesuppgift } from "../src/beteckningar.ts";
import { internaBeteckningar } from "../src/publicerad-text.ts";

const loften = new Map<string, Loftesuppgift>([
  ["p-2026-1924", { id: "p-2026-1924", title: "Sektorsbidrag för skolans personal", parties: ["s"], status: "aktiv" }],
  ["p-2026-0500", { id: "p-2026-0500", title: "Indraget löfte", parties: ["m"], status: "tillbakadragen" }],
]);

describe("löftes-id byter form, det försvinner inte", () => {
  it("numret blir ord och hamnar i ankaret", () => {
    const r = skrivOmBeteckningar("Jämförbart löfte p-2026-1924 anger 500 mkr.", loften);
    assert.equal(r.text, "Jämförbart löfte S:s löfte om sektorsbidrag för skolans personal anger 500 mkr.");
    assert.deepEqual(r.ankare, ["p-2026-1924"]);
  });

  it("texten bär ingen intern beteckning efteråt", () => {
    const r = skrivOmBeteckningar("Samma nivå som p-2026-1924 räknar fram.", loften);
    assert.deepEqual(internaBeteckningar({ calculation: r.text } as never, ""), []);
  });

  /** Ett ankare måste peka på något som lever. */
  it("ett indraget löfte beskrivs i ord men blir inget ankare", () => {
    const r = skrivOmBeteckningar("Jämför p-2026-0500.", loften);
    assert.match(r.text, /M:s löfte om indraget löfte/u);
    assert.deepEqual(r.ankare, []);
  });

  it("ett okänt id blir vagt men sant, och inget ankare", () => {
    const r = skrivOmBeteckningar("Jämför p-2026-9999.", loften);
    assert.equal(r.text, "Jämför ett annat löfte.");
    assert.deepEqual(r.ankare, []);
  });

  it("samma id två gånger ger ett ankare", () => {
    const r = skrivOmBeteckningar("p-2026-1924 och p-2026-1924 igen.", loften);
    assert.deepEqual(r.ankare, ["p-2026-1924"]);
  });
});

describe("regelkoder skrivs ut i ord", () => {
  it("«regel 13» blir regeln i klartext", () => {
    const r = skrivOmBeteckningar("Beloppet är noll enligt regel 13.", loften);
    assert.match(r.text, /kostnadsregeln om breda uppräkningslöften/u);
    assert.deepEqual(r.regler, ["13"]);
  });

  it("böjda former fångas", () => {
    assert.match(skrivOmBeteckningar("enligt regeln 9 ovan", loften).text, /kostnadsregeln om lagar, förbud/u);
  });

  it("en okänd regelkod lämnas orörd hellre än att gissas", () => {
    const r = skrivOmBeteckningar("enligt regel 99", loften);
    assert.equal(r.text, "enligt regel 99");
    assert.deepEqual(r.regler, []);
  });

  it("varje regel i listan har en läsbar mening", () => {
    for (const [nr, ord] of Object.entries(REGELORD)) {
      assert.ok(ord.length > 20, `${nr}: «${ord}»`);
      assert.match(ord, /^kostnadsregeln om /u, `${nr} läser sig inte som ett namn`);
      assert.doesNotMatch(ord, /regel \d/u, `${nr} hänvisar till en annan kod`);
    }
  });
});

describe("beskrivningen", () => {
  it("rubriken får liten begynnelsebokstav i löpande text", () => {
    assert.equal(medOrd(loften.get("p-2026-1924"), "x"), "S:s löfte om sektorsbidrag för skolans personal");
  });

  it("flera partier skrivs ut", () => {
    assert.match(medOrd({ id: "x", title: "Delat löfte", parties: ["s", "v"] }, "x"), /^S och V:s löfte/u);
  });

  it("utan rubrik blir det partiets löfte", () => {
    assert.equal(medOrd({ id: "x", parties: ["c"] }, "x"), "C:s löfte");
  });
});
