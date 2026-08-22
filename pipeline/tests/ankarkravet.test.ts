/**
 * Spärrhaken för ankarkravet. Regeln och skälen står i `src/ankarkravet.ts`.
 *
 * Provet mäter två saker: att inget NYTT löfte lånar ett belopp utan att
 * namnge ankaret, och att den frysta skulden bara krymper. Det andra är
 * poängen — utan den raden kan någon "lösa" ett rött prov genom att lägga
 * till id:t i facit, och då är grinden en påminnelse igen.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ankarbrott, type AnkarPost } from "../src/ankarkravet.ts";

const DATA = resolve(import.meta.dirname, "../../data");
const FACIT = resolve(import.meta.dirname, "../facit/ankarskulden.json");

describe("ankarkravet", () => {
  const loften = JSON.parse(readFileSync(resolve(DATA, "promises.json"), "utf8")) as AnkarPost[];
  const skuld = JSON.parse(readFileSync(FACIT, "utf8")) as { ids: string[]; count: number };
  const brott = ankarbrott(loften);

  it("inget nytt löfte lånar ett belopp utan att namnge ankaret", () => {
    const frysta = new Set(skuld.ids);
    const nya = brott.filter((id) => !frysta.has(id));
    assert.deepEqual(
      nya,
      [],
      "Ett lånat belopp utan id är ett tal läsaren inte kan följa till sin grund.\n" +
        "Lägg posten i samma grupp som löftet den lånar från, räkna om den\n" +
        "på egen grund, eller nolla den och skriv ut varför. Skriv INTE ut id:t i\n" + "texten — publicerad-text spärrar interna beteckningar i läsartext.\n" +
        `Nya brott: ${nya.join(", ")}`,
    );
  });

  it("den frysta skulden krymper, den växer aldrig", () => {
    assert.ok(
      skuld.ids.length <= skuld.count,
      `facit/ankarskulden.json säger count ${skuld.count} men listar ${skuld.ids.length} id.`,
    );
    const kvar = new Set(brott);
    const rattade = skuld.ids.filter((id) => !kvar.has(id));
    assert.ok(
      skuld.ids.length - rattade.length === brott.filter((id) => new Set(skuld.ids).has(id)).length,
      "Skuldlistan och beståndet säger olika saker.",
    );
    // Rättade id ska tas bort ur facit, annars döljer listan hur långt arbetet kommit.
    assert.deepEqual(
      rattade,
      [],
      "Dessa löften uppfyller nu kravet och ska tas bort ur facit/ankarskulden.json:\n" +
        `${rattade.join(", ")}`,
    );
  });
});
