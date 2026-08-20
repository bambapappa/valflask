import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ankare,
  ankarmeningar,
  ankartackning,
  beloppIMening,
  beroendeAv,
  foraldradeAnkare,
  namndaPartier,
  type Ankarlofte,
} from "../src/ankaren.ts";

const lofte = (
  id: string,
  parties: string[],
  base: number | null,
  calculation: string,
  status = "aktiv",
): Ankarlofte => ({ id, parties, title: `${id} titel`, status, cost: { msek_base: base, calculation } });

describe("ankarmeningar", () => {
  it("plockar bara meningen som säger att beloppet är lånat", () => {
    const t = "Ingen nivå anges i löftet. Basbeloppet är lånat: Socialdemokraterna anger själva 1,95 miljarder kronor. Kontrollkalkylen ger 2 000 mkr.";
    const m = ankarmeningar(t);
    assert.equal(m.length, 1);
    assert.match(m[0]!, /lånat/u);
  });

  it("en uträkning utan lån ger inga meningar", () => {
    assert.deepEqual(ankarmeningar("230 000 anställda gånger 450 000 kronor ger 100 miljarder."), []);
  });
});

describe("beloppIMening", () => {
  it("räknar om miljarder till msek", () => {
    assert.deepEqual(beloppIMening("lånat 1,95 miljarder kronor"), [1950]);
  });

  it("läser tal med hårt blanksteg som tusenavskiljare", () => {
    // Vår prosa sätter hårt blanksteg i tusental. Läses det som ett vanligt
    // mellanslag blir 1 950 till talet 1, och ankaret pekar på fel belopp.
    assert.deepEqual(beloppIMening("lånat 1 950 miljoner kronor"), [1950]);
    assert.deepEqual(beloppIMening("lånat 3 000 mkr"), [3000]);
  });

  it("noll är inget ankare", () => {
    assert.deepEqual(beloppIMening("prissatt till 0 mkr"), []);
  });
});

describe("namndaPartier", () => {
  it("läser partiet ur löptexten", () => {
    assert.deepEqual(namndaPartier("i linje med Miljöpartiets löfte"), ["mp"]);
  });
  it("saknas partinamn går ankaret inte att följa", () => {
    assert.deepEqual(namndaPartier("i linje med jämförbara löften"), []);
  });
});

describe("ankare", () => {
  it("ett löfte ankrar inte i sitt eget parti", () => {
    const p = [lofte("p-1", ["s"], 100, "I linje med Socialdemokraternas eget löfte på 500 mkr.")];
    assert.deepEqual(ankare(p), []);
  });

  it("tillbakadragna löften ankrar inte i något", () => {
    const p = [lofte("p-1", ["l"], 100, "Lånat: Socialdemokraterna anger själva 500 mkr.", "tillbakadragen")];
    assert.deepEqual(ankare(p), []);
  });
});

describe("foraldradeAnkare", () => {
  // Fallet som gav upphov till svepet: låntagaren står kvar på ett belopp
  // långivaren lämnat.
  const bestand = [
    lofte("p-s", ["s"], 1950, "Partiet anger själv 1,95 miljarder kronor."),
    lofte("p-l", ["l"], 3000, "Basbeloppet är lånat: Socialdemokraterna anger själva 3 000 mkr."),
  ];
  const haft = { s: [8000, 3000, 1950], l: [3000] };

  it("hittar låntagaren som står kvar på ett övergivet belopp", () => {
    const f = foraldradeAnkare(bestand, haft);
    assert.equal(f.length, 1);
    assert.equal(f[0]!.id, "p-l");
    assert.equal(f[0]!.belopp, 3000);
    assert.equal(f[0]!.langivare, "s");
    assert.deepEqual(f[0]!.langivarens_belopp, [1950]);
  });

  it("står långivaren kvar på talet är ankaret inte föråldrat", () => {
    const levande = [bestand[0]!, lofte("p-l", ["l"], 1950, "Lånat: Socialdemokraterna anger själva 1,95 miljarder kronor.")];
    assert.deepEqual(foraldradeAnkare(levande, haft), []);
  });

  it("ett tal långivaren aldrig haft är inget ankare", () => {
    const p = [lofte("p-s", ["s"], 1950, "x"), lofte("p-l", ["l"], 700, "Lånat: Socialdemokraterna anger själva 777 mkr.")];
    assert.deepEqual(foraldradeAnkare(p, haft), []);
  });

  it("KOPIOR FÅR INTE MASKERA LÅNGIVAREN", () => {
    // Första svepet frågade «finns talet som NÅGOT löftes nuvarande belopp?».
    // Två låntagare på samma lånade tal svarade ja åt varandra, och svepet gav
    // noll fynd oavsett hur trasigt beståndet var.
    const tva = [
      bestand[0]!,
      lofte("p-l", ["l"], 3000, "Lånat: Socialdemokraterna anger själva 3 000 mkr."),
      lofte("p-mp", ["mp"], 3000, "Lånat: Socialdemokraterna anger själva 3 000 mkr."),
    ];
    const f = foraldradeAnkare(tva, haft);
    assert.deepEqual(f.map((x) => x.id).sort(), ["p-l", "p-mp"]);
  });
});

describe("beroendeAv", () => {
  const bestand = [
    lofte("p-s", ["s"], 1950, "Partiet anger själv 1,95 miljarder kronor."),
    lofte("p-l", ["l"], 1950, "Basbeloppet är lånat: Socialdemokraterna anger själva 1,95 miljarder kronor."),
    lofte("p-m", ["m"], 400, "Egen kalkyl utan lån."),
  ];

  it("pekar ut vad som lutar sig mot det som ska ändras", () => {
    const b = beroendeAv(bestand, ["p-s"]);
    assert.equal(b.length, 1);
    assert.equal(b[0]!.id, "p-l");
  });

  it("löftet som ändras räknas inte som beroende av sig självt", () => {
    assert.deepEqual(beroendeAv(bestand, ["p-l"]).map((x) => x.id), []);
  });

  it("ingenting lutar sig mot ett löfte ingen lånat av", () => {
    assert.deepEqual(beroendeAv(bestand, ["p-m"]), []);
  });
});

describe("ankartackning", () => {
  it("skiljer ankare som går att följa från dem som inte gör det", () => {
    const p = [
      lofte("p-1", ["l"], 100, "Lånat: Socialdemokraterna anger själva 500 mkr."),
      lofte("p-2", ["l"], 100, "I linje med jämförbara löften."),
      lofte("p-3", ["l"], 100, "Egen kalkyl."),
    ];
    assert.deepEqual(ankartackning(p), { aktiva: 3, med_ankarord: 2, provbara: 1 });
  });
});
