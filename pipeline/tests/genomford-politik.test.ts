/**
 * `looksLikeCompletedPolicy` — citat som beskriver genomförd politik.
 *
 * Tre kö-poster fälldes 2026-08-25 som «genomförd politik» och alla tre var
 * löften om framtiden. Två svenska grammatikfällor låg bakom, och bägge är av
 * samma slag som modulens egna kommentarer redan varnar för:
 *
 *   · INFINITIVEN är partiernas vanligaste löftesform — A–Ö-sidorna skriver
 *     punkt efter punkt som «Införa …», «Höja …», «Garantera …» — och sådana
 *     punkter bär ofta en bisats i perfekt som beskriver bakgrunden.
 *   · SUBSTANTIV PÅ -HET ser ut som supinum. «har möjlighet» är inte perfekt.
 *
 * Proven låser fast bägge, och lika viktigt: att skrytmeningen fortfarande
 * fälls, också när den inleds med ett partinamn i bestämd plural.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inledsAvInfinitiv, looksLikeCompletedPolicy } from "../src/quality-scan.ts";

describe("löften i infinitiv är löften", () => {
  const loften = [
    "Införa ett jobbat avdrag så att man betalar lägre skatt på den pension man själv har jobbat ihop.",
    "Höja ersättningarna inom sjuk- och aktivitetsersättningen då de under lång tid har halkat efter löneutvecklingen i samhället.",
    "Garantera att public service har möjlighet att sända stora sportevenemang där Sverige tävlar.",
    "Säkerställa att fler människor som inte har rätt att vistas i Sverige lämnar landet.",
  ];
  for (const q of loften) {
    it(q.slice(0, 58), () => assert.equal(looksLikeCompletedPolicy(q), false));
  }
});

describe("skrytet fälls fortfarande", () => {
  const skryt = [
    "Vi har sänkt skatten för alla pensionärer och byggt ut polisen.",
    "Sedan vi tog över har brottsligheten minskat.",
    // Partinamn i bestämd plural slutar på -erna, precis som infinitiv slutar
    // på -a. Skulle infinitivregeln ta dem vore skrytmeningen immun.
    "Moderaterna har sänkt skatten för alla pensionärer.",
    "Kristdemokraterna har byggt ut vården i hela landet.",
    "Alla har fått det bättre sedan vi tog över.",
  ];
  for (const q of skryt) {
    it(q.slice(0, 58), () => assert.equal(looksLikeCompletedPolicy(q), true));
  }
});

describe("infinitivläsningen för sig", () => {
  it("tar verbet som inleder punkten", () => {
    assert.equal(inledsAvInfinitiv("Införa ett nytt reseavdrag."), true);
    assert.equal(inledsAvInfinitiv("Att stärka polisen."), true);
  });
  it("tar inte partinamn i bestämd plural", () => {
    assert.equal(inledsAvInfinitiv("Liberalerna vill sänka skatten."), false);
    assert.equal(inledsAvInfinitiv("Socialdemokraterna har lovat mer."), false);
  });
  it("tar inte determinanter", () => {
    assert.equal(inledsAvInfinitiv("Alla ska med."), false);
    assert.equal(inledsAvInfinitiv("Detta har gett resultat."), false);
  });
});
