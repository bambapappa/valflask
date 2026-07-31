/**
 * Frågevågen — isoleringskontraktet för backfillen (src/stance-backfill.ts):
 * fyller granskningskön ur page-källor UTAN att röra löftesflödets filer
 * (seen.json, promises.json, needs_review.json) och publicerar aldrig.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { MemorySource } from "../src/fetch.ts";
import { mockArchive } from "../src/archive.ts";
import type { LlmClient, LlmOptions } from "../src/llm.ts";
import type { NormalizedArticle } from "../src/gates.ts";
import { runStanceBackfill } from "../src/stance-backfill.ts";
import { buildSkeleton, type IssuesFile, type StanceCell } from "../src/stances.ts";

const QUOTE = "Vi säger ja till att bygga ny kärnkraft i Sverige och står bakom finansieringen fullt ut.";

const issuesFile: IssuesFile = {
  criteria_note: "testfixtur",
  formulation_note: "testfixtur",
  issues: [
    {
      id: "i-energi",
      title: "Energipolitiken",
      slug: "energipolitiken",
      category: "klimat-miljö",
      status: "aktiv",
      selection_sources: [],
      subquestions: [
        {
          id: "sq-energi-karnkraft",
          text: "Ska staten fortsätta finansiera utbyggnad av ny kärnkraft?",
          formulation_status: "verifierad",
          fairness_note: "testfixtur",
        },
      ],
    },
  ],
};

const article: NormalizedArticle = {
  url: "https://moderaterna.se/var-politik/",
  domain: "moderaterna.se",
  title: "Vår politik",
  text: `Energipolitik: ${QUOTE} Mer text.`,
  published: "2026-07-10T00:00:00Z",
};

class DispatchLlm implements LlmClient {
  async complete(prompt: string, _opts?: LlmOptions): Promise<string> {
    if (prompt.includes("<DELFRAGOR>")) {
      return JSON.stringify({
        stances: [
          { subquestion_id: "sq-energi-karnkraft", party: "m", position: "ja", condition_note: null, quote: QUOTE, person: null },
        ],
      });
    }
    return JSON.stringify({
      quote_on_topic: true,
      position_follows_from_quote_alone: true,
      party_correct: true,
      verdict: "publish",
      reason: "ok",
    });
  }
}

describe("stance-backfill: isoleringskontraktet", () => {
  test("fyller kön i review-läge; seen/promises/needs_review orörda; inget publiceras", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "backfill-"));
    try {
      const SEEN = '{"sentinel":"orörd"}\n';
      const PROMISES = '[{"id":"p-2026-0001","sentinel":true}]\n';
      const NEEDS = '[{"sentinel":"orörd"}]\n';
      writeFileSync(join(tmp, "seen.json"), SEEN);
      writeFileSync(join(tmp, "promises.json"), PROMISES);
      writeFileSync(join(tmp, "needs_review.json"), NEEDS);
      writeFileSync(join(tmp, "issues.json"), JSON.stringify(issuesFile));
      writeFileSync(join(tmp, "stances.json"), JSON.stringify(buildSkeleton(issuesFile, [])));
      writeFileSync(join(tmp, "stances_review.json"), "[]\n");

      const result = await runStanceBackfill({
        now: new Date("2026-07-12T12:00:00Z"),
        runId: "stances-backfill-test",
        llm: new DispatchLlm(),
        articleSource: new MemorySource([article]),
        dataDir: tmp,
        outputDir: tmp,
        allowlist: ["moderaterna.se"],
        archiveFn: mockArchive,
        models: { extract: "a", verify: "b" },
      });

      assert.equal(result.articles, 1);
      assert.equal(result.acceptedByGates, 1);
      assert.equal(result.queuedNew, 1, "kandidaten ska hamna i granskningskön");
      assert.equal(result.errors.length, 0);

      // Inget publicerat — kön har posten, cellen är tom, MODE-grinden märkt.
      const queue = JSON.parse(readFileSync(join(tmp, "stances_review.json"), "utf8"));
      assert.equal(queue.length, 1);
      assert.ok(queue[0].failures.some((f: { gate: string }) => f.gate === "MODE"));
      const cells = JSON.parse(readFileSync(join(tmp, "stances.json"), "utf8")) as StanceCell[];
      assert.ok(cells.every((c) => c.statements.length === 0));
      assert.ok(cells.every((c) => c.last_searched === "2026-07-12"));

      // Isoleringskontraktet: löftesflödets filer är BYTE-identiska.
      assert.equal(readFileSync(join(tmp, "seen.json"), "utf8"), SEEN);
      assert.equal(readFileSync(join(tmp, "promises.json"), "utf8"), PROMISES);
      assert.equal(readFileSync(join(tmp, "needs_review.json"), "utf8"), NEEDS);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("dry-run skriver ingenting alls", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "backfill-dry-"));
    try {
      const SKELETON = JSON.stringify(buildSkeleton(issuesFile, []));
      writeFileSync(join(tmp, "issues.json"), JSON.stringify(issuesFile));
      writeFileSync(join(tmp, "stances.json"), SKELETON);
      writeFileSync(join(tmp, "stances_review.json"), "[]\n");

      const result = await runStanceBackfill({
        now: new Date("2026-07-12T12:00:00Z"),
        runId: "stances-backfill-test",
        llm: new DispatchLlm(),
        articleSource: new MemorySource([article]),
        dataDir: tmp,
        outputDir: tmp,
        allowlist: ["moderaterna.se"],
        archiveFn: mockArchive,
        models: { extract: "a", verify: "b" },
        dryRun: true,
      });

      assert.equal(result.queuedNew, 1);
      assert.equal(readFileSync(join(tmp, "stances.json"), "utf8"), SKELETON);
      assert.equal(readFileSync(join(tmp, "stances_review.json"), "utf8"), "[]\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("budgettak respekteras (maxArticles)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "backfill-cap-"));
    try {
      writeFileSync(join(tmp, "issues.json"), JSON.stringify(issuesFile));
      writeFileSync(join(tmp, "stances.json"), JSON.stringify(buildSkeleton(issuesFile, [])));
      writeFileSync(join(tmp, "stances_review.json"), "[]\n");

      const many = Array.from({ length: 5 }, (_, i) => ({ ...article, url: `${article.url}?v=${i}` }));
      const result = await runStanceBackfill({
        now: new Date("2026-07-12T12:00:00Z"),
        runId: "stances-backfill-test",
        llm: new DispatchLlm(),
        articleSource: new MemorySource(many),
        dataDir: tmp,
        outputDir: tmp,
        allowlist: ["moderaterna.se"],
        archiveFn: mockArchive,
        models: { extract: "a", verify: "b" },
        maxArticles: 2,
      });
      assert.equal(result.articles, 2);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
