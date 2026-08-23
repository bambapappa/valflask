/**
 * Rubrikkravet. Regeln står i `src/rubrikkravet.ts`.
 *
 * Provet mäter att grinden fäller två skilda åtgärder under en rubrik, att den
 * SLÄPPER samma löfte upprepat i två dokument, och att det incheckade beståndet
 * är rent. Det tredje ledet är det som ruttnar utan de två första: ett grönt
 * bestånd bevisar ingenting om grinden också hade släppt felet igenom.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { citatlikhet, rubrikbrott, type Rubrikpost } from "../src/rubrikkravet.ts";

const LOFTEN = resolve(import.meta.dirname, "../../data/promises.json");

const post = (o: Partial<Rubrikpost> & { id: string }): Rubrikpost => ({ status: "aktiv", ...o });

describe("rubrikkravet", () => {
  it("fäller två skilda åtgärder under samma rubrik hos samma parti", () => {
    const brott = rubrikbrott([
      post({ id: "p-2026-0001", parties: ["m"], title: "Förbjuda skadlig trålning",
             quote: "Därför bör skadlig trålning av fisk förbjudas." }),
      post({ id: "p-2026-0002", parties: ["m"], title: "Förbjuda skadlig trålning",
             quote: "Vi vill göra försöket med utflyttad trålgräns permanent och flytta trålfisket längre ut från kusten." }),
    ]);
    assert.equal(brott.length, 1);
    assert.deepEqual(brott[0]!.ids, ["p-2026-0001", "p-2026-0002"]);
  });

  it("släpper samma löfte upprepat i två dokument", () => {
    // Ett parti får säga samma sak två gånger. Då är samma rubrik rätt.
    assert.deepEqual(
      rubrikbrott([
        post({ id: "p-2026-0001", parties: ["s"], title: "Fler poliser i hela landet",
               quote: "Vi vill se fler poliser i hela landet och ökad närvaro i utsatta områden." }),
        post({ id: "p-2026-0002", parties: ["s"], title: "Fler poliser i hela landet",
               quote: "Fler poliser i hela landet, med ökad närvaro i de utsatta områdena." }),
      ]),
      [],
    );
  });

  it("rör inte två partier som råkar formulera sin rubrik lika", () => {
    // Att två partier lovar samma sak är inte ett fel — det är jämförelsen.
    assert.deepEqual(
      rubrikbrott([
        post({ id: "p-2026-0001", parties: ["m"], title: "Sänkt skatt på arbete", quote: "Vi sänker skatten på arbete." }),
        post({ id: "p-2026-0002", parties: ["kd"], title: "Sänkt skatt på arbete", quote: "Jobbskatteavdraget ska förstärkas ytterligare." }),
      ]),
      [],
    );
  });

  it("rör inte indragna löften", () => {
    assert.deepEqual(
      rubrikbrott([
        post({ id: "p-2026-0001", parties: ["v"], title: "Samma rubrik", quote: "Ett helt annat innehåll om skogen." }),
        post({ id: "p-2026-0002", parties: ["v"], title: "Samma rubrik", quote: "Något om vården i stället.", status: "tillbakadragen" }),
      ]),
      [],
    );
  });

  it("citatlikhet är noll mot ett tomt citat och ett mot sig själv", () => {
    assert.equal(citatlikhet("", "något alls"), 0);
    assert.equal(citatlikhet("fler poliser i landet", "fler poliser i landet"), 1);
  });
});

describe("rubrikkravet mot det incheckade beståndet", () => {
  const loften = JSON.parse(readFileSync(LOFTEN, "utf8")) as Rubrikpost[];

  it("hittar löften att mäta", () => {
    // En tom lista över ett tomt register intygar ingenting.
    assert.ok(loften.filter((p) => p.status === "aktiv").length > 2000);
  });

  it("inget parti bär samma rubrik över två skilda löften", () => {
    const brott = rubrikbrott(loften);
    assert.deepEqual(
      brott,
      [],
      "Två löften delar rubrik hos samma parti men säger olika saker. Läsaren ser då samma\n" +
        "löfte till två priser. Ge det löfte vars rubrik inte beskriver sitt citat en egen\n" +
        "rubrik — och skriv en ny prövning, för rubriken ingår i prövningens nyckel. Brott:\n" +
        brott.map((b) => `${b.ids.join(" / ")} «${b.rubrik}»`).join("\n"),
    );
  });
});
