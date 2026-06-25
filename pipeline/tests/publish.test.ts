import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { publish, type NeedsReviewEntry } from "../src/publish.ts";

function reviewItem(url: string, title: string): NeedsReviewEntry {
  return {
    candidate: { title },
    failures: [],
    articleUrl: url,
    articleTitle: title,
  };
}

function run(outputDir: string, reviewItems: NeedsReviewEntry[]) {
  return publish({
    processedCandidates: [],
    reviewItems,
    existingPromises: [],
    runId: "run-test",
    now: new Date("2026-06-25T00:00:00Z"),
    outputDir,
  });
}

function readReview(dir: string): NeedsReviewEntry[] {
  return JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8"));
}

describe("publish: needs_review är en beständig kö (merge, inte överskrivning)", () => {
  it("lägger till nya poster utan att radera befintliga; tom körning bevarar kön", () => {
    const dir = mkdtempSync(join(tmpdir(), "publish-merge-"));
    try {
      // Körning 1: två poster flaggas.
      run(dir, [reviewItem("https://a.se/1", "Löfte A"), reviewItem("https://b.se/2", "Löfte B")]);
      assert.equal(readReview(dir).length, 2, "två poster efter första körningen");

      // Körning 2: TOM (allt redan sett) — får INTE radera de väntande.
      run(dir, []);
      assert.equal(readReview(dir).length, 2, "tom körning bevarar kön (regressionen 22→0)");

      // Körning 3: en ny + en dublett av befintlig (samma url+titel) → bara den nya läggs till.
      run(dir, [reviewItem("https://a.se/1", "Löfte A"), reviewItem("https://c.se/3", "Löfte C")]);
      const items = readReview(dir);
      assert.equal(items.length, 3, "dublett hoppas över, ny post läggs till");
      assert.deepEqual(
        items.map((r) => r.articleUrl).sort(),
        ["https://a.se/1", "https://b.se/2", "https://c.se/3"],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("respekterar att review-CLI:t har tömt en post (skriver inte tillbaka den om den inte återflaggas)", () => {
    const dir = mkdtempSync(join(tmpdir(), "publish-drain-"));
    try {
      run(dir, [reviewItem("https://a.se/1", "Löfte A"), reviewItem("https://b.se/2", "Löfte B")]);
      // Simulera att granskaren godkände/avvisade post 0 via CLI:t (filtrerade bort den).
      const after = readReview(dir).filter((r) => r.articleUrl !== "https://a.se/1");
      writeFileSync(join(dir, "needs_review.json"), JSON.stringify(after, null, 2) + "\n");
      // Nästa körning hittar inget nytt (artikeln är sedd) → kön ska förbli den tömda.
      run(dir, []);
      assert.deepEqual(readReview(dir).map((r) => r.articleUrl), ["https://b.se/2"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
