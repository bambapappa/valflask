/**
 * Uträkningen är offentlig — också på vägen förbi granskningen.
 *
 * VARFÖR: kravet fanns redan på två ställen och saknades på det tredje.
 * Godkännandet i `review.ts` stoppar den som sätter ett belopp för hand utan
 * uträkning, och `utrakningen-kravs.test.ts` mäter att inget publicerat löfte
 * saknar en. Men mätprovet läser data *efteråt*, och det enda som skrev till
 * `promises.json` utan att passera godkännandet — `publish()` — hade ingen
 * sådan kontroll alls.
 *
 * Skillnaden syntes i drift. Pipelinekörning 31955869060 publicerade
 * p-2026-0865 den 16 augusti 2026: Vänsterpartiets fem miljarder kronor per år
 * till vårdens statsbidrag, med tomt uträkningsfält. Mätprovet fällde — men
 * först efter att löftet stod i registret, och bygget på `main` var rött till
 * dess någon skrev uträkningen för hand.
 *
 * Grinden kastar inte kandidaten. Ett belopp utan steg är inget skäl att
 * glömma löftet, bara att inte publicera det ännu: posten går till kön med sin
 * kostnad, där en människa kan skriva uträkningen och godkänna.
 *
 * VAD DET INTE FÅNGAR: att uträkningen är *riktig*, eller att den hör till
 * beloppet. Det mäter `quality-scan` och `utrakningen` på andra sätt.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { publish, type NeedsReviewEntry } from "../src/publish.ts";
import type { CostEstimate } from "../src/cost.ts";

function kostnad(over: Partial<CostEstimate> = {}): CostEstimate {
  const bas: CostEstimate = {
    type: "utgift",
    period: "per_ar",
    msek_low: 3750,
    msek_base: 5000,
    msek_high: 6750,
    basis: "parti",
    basis_url: null,
    method_note: "Belopp angivet i källtext.",
    confidence: 0.7,
  };
  return Object.assign(bas, over);
}

function kandidat(titel: string, cost: CostEstimate) {
  return {
    candidate: {
      title: titel,
      parties: ["v"],
      person: null,
      quote: `Förslaget är att tillföra fem miljarder kronor nationellt från 2027 (${titel}).`,
      category: "välfärd",
      amount_in_text_msek: 5000,
      financing_mentioned: false,
    },
    article: {
      url: `https://exempel.test/${encodeURIComponent(titel)}`,
      domain: "exempel.test",
      title: titel,
      text: "brödtext",
      published: "2026-08-14T08:18:57.000Z",
    },
    verifyResult: {
      is_promise: true,
      party_correct: true,
      amount_in_text: true,
      verdict: "publish" as const,
      reason: "ok",
    },
    cost,
    quip: "Fem miljarder, och kalenderåret får bära dem.",
    archiveUrl: null,
    extractModel: "modell-a",
    verifyModel: "modell-b",
  };
}

function kor(dir: string, processedCandidates: ReturnType<typeof kandidat>[]) {
  const reviewItems: NeedsReviewEntry[] = [];
  publish({
    processedCandidates,
    reviewItems,
    existingPromises: [],
    runId: "run-test",
    now: new Date("2026-08-16T15:43:20.533Z"),
    outputDir: dir,
  });
  return {
    loften: JSON.parse(readFileSync(join(dir, "promises.json"), "utf8")) as Array<{
      id: string;
      title: string;
    }>,
    kon: JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8")) as NeedsReviewEntry[],
  };
}

describe("publish släpper inte ut ett belopp utan uträkning", () => {
  it("ett tomt uträkningsfält skickar kandidaten till kön i stället för till registret", () => {
    const dir = mkdtempSync(join(tmpdir(), "utrakningen-grind-"));
    try {
      // Precis fallet från körning 31955869060: allt annat i ordning, bara
      // uträkningen saknas. Det här är raden som gör provet till en grind —
      // mot koden som publicerade p-2026-0865 hamnar löftet i registret.
      const { loften, kon } = kor(dir, [kandidat("Utan uträkning", kostnad())]);

      assert.deepEqual(
        loften.map((p) => p.id),
        [],
        "Ett belopp utan steg bakom sig är en siffra läsaren inte kan följa.\n" +
          "Kandidaten får inte nå promises.json.",
      );
      assert.equal(kon.length, 1, "kandidaten ska ligga kvar i kön, inte kastas");
      assert.match(
        kon[0]!.failures[0]!.reason,
        /uträkning/,
        "skälet ska säga vad som saknas, så den som tar posten vet vad den ska skriva",
      );
      assert.equal(
        kon[0]!.cost?.msek_base,
        5000,
        "kostnaden följer med till kön — annars betalas modellanropet en gång till",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blanktecken räknas inte som en uträkning", () => {
    const dir = mkdtempSync(join(tmpdir(), "utrakningen-grind-blank-"));
    try {
      const { loften } = kor(dir, [kandidat("Bara mellanslag", kostnad({ calculation: "   " }))]);
      assert.deepEqual(loften.map((p) => p.id), [], "tre mellanslag är inga steg");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("en kandidat med uträkning publiceras som förut", () => {
    // Den andra halvan av grinden: den får inte stänga den vanliga vägen.
    // Alla 719 aktiva löften bär en uträkning den 2026-08-16 sedan
    // p-2026-0865 fått sin, så kravet beskriver hur arbetet redan görs.
    const dir = mkdtempSync(join(tmpdir(), "utrakningen-grind-ok-"));
    try {
      const { loften, kon } = kor(dir, [
        kandidat("Med uträkning", kostnad({ calculation: "Partiet anger själv fem miljarder per år." })),
      ]);
      assert.equal(loften.length, 1, "en riktig uträkning ska passera");
      assert.equal(loften[0]!.title, "Med uträkning");
      assert.equal(kon.length, 0, "inget hamnar i kön i onödan");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
