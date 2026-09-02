/**
 * En fälld svit ska säga VAD som föll, inte bara att något gjorde det.
 *
 * Provsvitens utskrift är omkring tiotusen rader och jobbloggen går bara att
 * läsa 5 000 rader från slutet. Ett fel mitt i sviten hamnar utom synhåll.
 * Mätt 2026-09-01: «1 115 prov, 2 fällda» var allt som gick att nå, och det
 * kostade två körningar, en omkörning och sex misslyckade återskapningar
 * innan orsaken kunde pekas ut — genom att ta bort den misstänkta
 * konstruktionen, inte genom att läsa felet.
 *
 * FÄLLS AV: att sluta plocka ut de fallna proven, att låta ett fel svämma in
 * i nästa prov, eller att skriva något alls när ingenting föll.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { fallda, sammanfattning } from "../src/tapfel.ts";

/** Utskriften som node skriver, med den indragning kapslade prov får. */
const TAP = `TAP version 13
# Subtest: något som håller
ok 1 - något som håller
  ---
  duration_ms: 1.2
  ...
# Subtest: yttre svit
    # Subtest: den som faller
    not ok 1 - den som faller
      ---
      duration_ms: 3.4
      location: '/repo/pipeline/tests/exempel.test.ts:1:1'
      failureType: 'testCodeFailure'
      error: |-
        Förväntade 500 men fick 0
      code: 'ERR_ASSERTION'
      ...
    # Subtest: den som håller
    ok 2 - den som håller
      ---
      duration_ms: 0.1
      ...
    1..2
not ok 2 - yttre svit
  ---
  duration_ms: 4.0
  type: 'suite'
  ...
# Subtest: ett till som faller
not ok 3 - ett till som faller
  ---
  error: |-
    Kunde inte läsa filen
  ...
1..3
# tests 4
# pass 2
# fail 2
`;

describe("de fallna proven plockas ur provsvitens utskrift", () => {
  it("hittar dem, kapslade som okapslade", () => {
    const f = fallda(TAP);
    assert.deepEqual(
      f.map((p) => p.namn),
      ["den som faller", "yttre svit", "ett till som faller"],
    );
  });

  it("bär med sig felet, inte bara namnet", () => {
    const f = fallda(TAP);
    assert.ok(
      f[0]!.detalj.some((d) => d.includes("Förväntade 500 men fick 0")),
      "meddelandet ska följa med — utan det säger sammanfattningen inget mer än siffran",
    );
  });

  it("ett fel svämmar inte in i nästa prov", () => {
    const f = fallda(TAP);
    assert.ok(
      !f[0]!.detalj.some((d) => d.includes("den som håller")),
      "blocket ska sluta vid nästa provrad",
    );
    assert.ok(
      !f[2]!.detalj.some((d) => d.includes("Förväntade")),
      "det sista provets fel ska vara sitt eget",
    );
  });

  it("säger ingenting när ingenting föll", () => {
    // En grön körning ska förbli tyst. En sammanfattning som alltid skriver
    // något blir brus, och brus slutar man läsa.
    assert.equal(sammanfattning("TAP version 13\nok 1 - allt väl\n# fail 0\n"), "");
  });

  it("sammanfattningen namnger antalet och varje prov", () => {
    const s = sammanfattning(TAP);
    assert.match(s, /^3 prov föll:/u);
    for (const namn of ["den som faller", "yttre svit", "ett till som faller"]) {
      assert.ok(s.includes(namn), `${namn} ska stå i sammanfattningen`);
    }
  });

  it("bygget kör sammanfattningen efter en fälld svit", () => {
    // Regeln är värdelös om workflown inte anropar den, och den måste köras
    // med `if: failure()` — annars hamnar den inte sist i loggen, som är hela
    // poängen.
    //
    // Villkoret prövas på STEGET, inte på filen. En första version letade efter
    // «if: failure()» var som helst i build.yml, och den matchade andra steg
    // som redan hade det: fallprovet gick igenom när villkoret togs bort. Ett
    // prov som inte faller mot sitt eget införda fel mäter ingenting.
    const yml = parse(
      readFileSync(join(import.meta.dirname, "..", "..", ".github", "workflows", "build.yml"), "utf8"),
    ) as { jobs: Record<string, { steps?: Array<{ if?: string; run?: string }> }> };

    const steg = Object.values(yml.jobs).flatMap((j) => j.steps ?? []);
    const svit = steg.find((s) => /pnpm test/u.test(s.run ?? ""));
    const sammanfattaren = steg.find((s) => /fallda-prov\.mts/u.test(s.run ?? ""));

    assert.ok(svit, "hittade inget steg som kör provsviten");
    assert.ok(sammanfattaren, "bygget ska anropa sammanfattningen");
    assert.equal(sammanfattaren!.if, "failure()", "den ska köras just när sviten fallit");
    assert.match(svit!.run ?? "", /tee "\$RUNNER_TEMP\/tap-pipeline\.txt"/u, "utskriften måste sparas undan");
    assert.match(svit!.run ?? "", /set -o pipefail/u, "annars döljer tee provsvitens utgångskod");
    assert.match(
      sammanfattaren!.run ?? "",
      /\$RUNNER_TEMP\/tap-pipeline\.txt/u,
      "sammanfattningen ska läsa samma fil som sviten skrev",
    );
  });
});
