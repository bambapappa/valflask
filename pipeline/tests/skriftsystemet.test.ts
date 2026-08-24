/**
 * Grinden mot främmande skriftsystem i publicerad text. Regeln står i
 * `src/skriftsystemet.ts`.
 *
 * Provet mäter tre saker: att den fäller en kyrillisk homoglyf mitt i ett
 * svenskt ord, att den SLÄPPER kubikmeter och tankstreck — kravet gäller
 * bokstäver, inte tecken — och att beståndet är rent.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { frammandeTecken, skriftbrott, type Textpost } from "../src/skriftsystemet.ts";

const LOFTEN = resolve(import.meta.dirname, "../../data/promises.json");

describe("skriftsystemet", () => {
  it("fäller en kyrillisk homoglyf mitt i ett ord", () => {
    const f = frammandeTecken("handlar främst om личliga och organisatoriska resurser");
    assert.equal(f.length, 1);
    assert.equal(f[0]!.skrift, "kyrilliska");
    assert.deepEqual(f[0]!.tecken.sort(), ["и", "л", "ч"]);
  });

  it("fäller ett kinesiskt tecken mitt i ett ord", () => {
    assert.equal(frammandeTecken("osäkerhet uppåt vid kraftig扩ning")[0]!.skrift, "kinesiska");
  });

  it("släpper kubikmeter, tankstreck, procent och valuta", () => {
    // Kravet gäller BOKSTÄVER. «100–200 tusen m³ HVO à 10 kr/l ≈ 3 %» är
    // korrekt svenska och ska passera oförändrad.
    assert.deepEqual(frammandeTecken("~100–200 tusen m³ HVO/biodiesel × 10–15 kr/l ≈ 1–3 mdkr, 2 % ökning"), []);
  });

  it("släpper ren svenska med alla accenter", () => {
    assert.deepEqual(frammandeTecken("Åtgärden är försumbar; ökningen påverkar även Öresund."), []);
  });

  it("rör inte indragna löften", () => {
    const poster: Textpost[] = [{ id: "p-2026-0001", status: "tillbakadragen", quote: "личliga resurser" }];
    assert.deepEqual(skriftbrott(poster), []);
  });
});

describe("skriftsystemet mot det incheckade beståndet", () => {
  const loften = JSON.parse(readFileSync(LOFTEN, "utf8")) as Textpost[];

  it("hittar löften att mäta", () => {
    assert.ok(loften.filter((p) => (p.status ?? "aktiv") === "aktiv").length > 2000);
  });

  it("ingen publicerad text bär bokstäver ur ett främmande skriftsystem", () => {
    const brott = skriftbrott(loften);
    assert.deepEqual(
      brott,
      [],
      "En språkmodell kan halka över i ett annat skriftsystem mitt i ett ord. Texten ser ut som\n" +
        "svenska på avstånd och är obegriplig på nära håll; sökningen bryts och en skärmläsare\n" +
        "byter språk mitt i meningen. Brott:\n" +
        brott.map((b) => `  ${b.id} [${b.falt}] ${b.skrift} ${b.tecken.join("")} — «${b.sammanhang}»`).join("\n"),
    );
  });
});
