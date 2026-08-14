/**
 * Uträkningen är offentlig — och det var länge bara ett löfte till läsaren.
 *
 * VARFÖR: godkännandet **varnade** när ett belopp sattes för hand utan
 * uträkning, och publicerade sedan ändå. Tre löften gick den vägen och alla
 * tre visade sig vara fel när de till slut lästes: ett sektorsbidrag som stod
 * på noll utan ett enda steg bakom sig, Liberalernas fjärde största löfte, och
 * en dubblett som räknades två gånger i ett partis summa. En varning är en
 * påminnelse, och påminnelser åldras.
 *
 * Godkännandet stoppar nu i stället. Att grinden går att ha hård är mätt:
 * **alla 690 aktiva löften bär en uträkning** den 2026-08-14, så kravet
 * beskriver hur arbetet redan görs — det skärper bara vad som händer när
 * någon glömmer.
 *
 * DEN ANDRA HALVAN är samma platshållare i det andra fältet. Kostnadssteget
 * skriver «LLM-kostnadssvar saknade giltiga tal — belopp MÅSTE sättas
 * manuellt» i metodnoten när modellsvaret inte gick att använda, och den
 * noten renderas på löftessidan. Sex publicerade löften bar texten, och den
 * motsade sidan intill: beloppet *var* satt. Skälet var att godkännandet la
 * till «(belopp satt av granskare)» efter den gamla noten i stället för att
 * ersätta den.
 *
 * VAD DET INTE FÅNGAR: att uträkningen är *riktig*. Det mäter `quality-scan`
 * och `utrakningen` på andra sätt. Det här provet säger bara att den finns och
 * att den inte är maskinens felmeddelande.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { utanHaveritext } from "../src/review.ts";

const DATA = resolve(import.meta.dirname, "../../data");

/** Kostnadsstegets platshållare, som aldrig får nå läsaren. */
const HAVERITEXT = /LLM-kostnadssvar|MÅSTE sättas manuellt|ej tolkbart/iu;

interface Lofte {
  id: string;
  status?: string;
  cost: { calculation?: string; method_note?: string };
}

describe("uträkningen är offentlig", () => {
  const loften = (JSON.parse(readFileSync(resolve(DATA, "promises.json"), "utf8")) as Lofte[]).filter(
    (p) => p.status === "aktiv",
  );

  it("varje publicerat löfte har en uträkning", () => {
    const utan = loften.filter((p) => ((p.cost.calculation ?? "").trim()) === "").map((p) => p.id);
    assert.deepEqual(
      utan,
      [],
      "Ett belopp utan steg bakom sig är en siffra läsaren inte kan följa.\n" +
        `Utan uträkning: ${utan.join(", ")}`,
    );
  });

  it("ingen publicerad motivering bär kostnadsstegets platshållare", () => {
    const kvar = loften
      .filter((p) => HAVERITEXT.test(p.cost.method_note ?? ""))
      .map((p) => `${p.id}: «${p.cost.method_note}»`);
    assert.deepEqual(
      kvar,
      [],
      "Metodnoten renderas på löftessidan. Maskinens felmeddelande hör inte dit,\n" +
        `och det motsäger beloppet intill.\n${kvar.join("\n")}`,
    );
  });
});

describe("utanHaveritext", () => {
  it("tar bort platshållaren men lämnar en riktig motivering", () => {
    assert.equal(
      utanHaveritext("LLM-kostnadssvar saknade giltiga tal — belopp MÅSTE sättas manuellt."),
      "",
    );
    assert.equal(
      utanHaveritext("LLM-kostnadssvar ej tolkbart (ogiltig JSON) — belopp MÅSTE sättas manuellt."),
      "",
    );
    const riktig = "Beloppet avser åtgärden, inte dess följder.";
    assert.equal(utanHaveritext(riktig), riktig);
    assert.equal(
      utanHaveritext("LLM-kostnadssvar saknade giltiga tal — belopp MÅSTE sättas manuellt. " + riktig),
      riktig,
    );
  });
});
