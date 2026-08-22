/**
 * Sorten står på varje löfte, och en inriktning bär aldrig ett belopp.
 *
 * Det andra provet är det som gör fältet värt något. Sorterna finns för att
 * en nolla ska gå att läsa: bär inriktningen plötsligt ett belopp är
 * skillnaden borta igen och fältet har blivit dekoration. Regeln och skälen
 * står i `src/loftestyp.ts`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { harledLoftestyp } from "../src/loftestyp.ts";

const DATA = resolve(import.meta.dirname, "../../data");

interface Lofte {
  id: string;
  loftestyp?: string;
  quote: string;
  status: string;
  cost: { msek_low: number; msek_base: number; msek_high: number; calculation?: string | null; method_note?: string | null };
}

describe("löftessorten", () => {
  const loften = JSON.parse(readFileSync(resolve(DATA, "promises.json"), "utf8")) as Lofte[];

  it("varje löfte bär en sort", () => {
    const utan = loften.filter((p) => p.loftestyp !== "reform" && p.loftestyp !== "inriktning");
    assert.deepEqual(
      utan.map((p) => p.id),
      [],
      "Utan sort går en nolla inte att läsa: läsaren ser inte om åtgärden är gratis\n" +
        "eller om det inte finns någon åtgärd att prissätta.",
    );
  });

  it("ett inriktningslöfte bär aldrig ett belopp", () => {
    const med = loften
      .filter((p) => p.loftestyp === "inriktning")
      .filter((p) => p.cost.msek_low !== 0 || p.cost.msek_base !== 0 || p.cost.msek_high !== 0);
    assert.deepEqual(
      med.map((p) => p.id),
      [],
      "En inriktning säger vart partiet vill, inte med vilket medel — då finns\n" +
        "ingenting att räkna på. Bär posten ett belopp är den en reform, och sorten\n" +
        "ska ändras i stället för att beloppet ska stå kvar under fel rubrik.",
    );
  });

  it("härledningen känner igen sina två grundfall", () => {
    const noll = { msek_low: 0, msek_base: 0, msek_high: 0 };
    assert.equal(
      harledLoftestyp("Psykiatrin ska stärkas, inte minst för barn och unga", {
        ...noll,
        calculation: "Citatet anger ingen åtgärd och ingen nivå.",
      }),
      "inriktning",
    );
    assert.equal(
      harledLoftestyp("Vi vill förbjuda religiösa friskolor", {
        ...noll,
        calculation: "Löftet hålls av ett förbud. Statens direkta kostnad är försumbar.",
      }),
      "reform",
    );
    assert.equal(
      harledLoftestyp("Vi ska satsa på vårdpersonalen", { msek_low: 100, msek_base: 200, msek_high: 300 }),
      "reform",
      "Är något prissatt finns det en åtgärd, oavsett hur citatet låter.",
    );
  });
});
