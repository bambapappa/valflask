/**
 * Ledet artikel → kandidat, per källa.
 *
 * `bySource` stannade vid `succeeded`: en källa som lästes varje körning utan
 * att någonsin lämna en kandidat räknades som en källa som fungerade. Det är
 * den tysta förlustpunkten i insamlingskedjan — sidan hämtas, tolkas utan fel,
 * och bär inget löfte.
 *
 * Flödenas egna utfall mäts inte här. Den diagnostiken finns i
 * `Feedhamtning`/`getFeedOutcomes`, och den är strängare: status per flöde och
 * fel per adress, validerade av `korutfall()`.
 *
 * Provet mäts genom `runPipeline` på den fixtur som redan bär en verklig
 * kandidat, inte mot en fixtur skriven ur samma antagande som koden.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { MemorySource } from "../src/fetch.ts";
import { mockArchive } from "../src/archive.ts";
import { runPipeline, type PipelineContext } from "../src/index.ts";
import type { LlmClient, LlmOptions } from "../src/llm.ts";
import type { NormalizedArticle } from "../src/gates.ts";

describe("kandidaträkningen per källa", () => {
  interface Fixtur {
    article: NormalizedArticle;
    extractResponse: string;
    verifyResponse: string;
    quipResponse: string;
  }
  const f = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "fixtures", "normal-1.json"), "utf8"),
  ) as Fixtur;

  class MockLlm implements LlmClient {
    async complete(_prompt: string, opts?: LlmOptions): Promise<string> {
      const sys = opts?.systemPrompt ?? "";
      if (sys.includes("extraktionsmotor")) return f.extractResponse;
      if (sys.includes("oberoende granskare")) return f.verifyResponse;
      if (sys.includes("stenograf")) return f.quipResponse;
      return '{"error":"okänd anropstyp"}';
    }
  }

  async function kor(artiklar: NormalizedArticle[], opts?: { allowlist?: string[] }) {
    const dir = mkdtempSync(join(tmpdir(), "insamlingsdiagnostik-"));
    writeFileSync(join(dir, "promises.json"), "[]\n");
    const ctx: PipelineContext = {
      now: new Date("2026-06-12T06:00:00Z"),
      runId: "diagnostikprov",
      llm: new MockLlm(),
      articleSource: new MemorySource(artiklar),
      outputDir: dir,
      dataDir: dir,
      allowlist: opts?.allowlist ?? ["dn.se"],
      mode: "review",
      archiveFn: mockArchive,
      samtidigaArtiklar: 1,
      models: { extract: "mock", verify: "mock", copy: "mock", kostnad: "mock" },
    };
    try {
      return await runPipeline(ctx);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // FÄLLS AV: att räkna noll i stället för postens antal.
  test("en källa som lämnar poster räknas, och summan är körningens kö", async () => {
    const r = await kor([f.article]);
    const rader = Object.values(r.runStats.bySource);
    assert.equal(rader.length, 1);
    assert.equal(rader[0]!.attempted, 1);
    assert.equal(rader[0]!.succeeded, 1);
    assert.ok(rader[0]!.kandidater > 0, `källan lämnade poster: ${rader[0]!.kandidater}`);
    assert.equal(
      rader.reduce((s, m) => s + m.kandidater, 0),
      r.runStats.kandidater,
      "källornas poster summerar till körningens",
    );
  });

  // FÄLLS AV: att räkna bara `ut.kandidater` och hoppa över `ut.gateReview`.
  // Källan nedan ger INGEN kandidat — den ger ett grindavslag, och det är
  // skillnaden mellan en källa utan löften och en källa vi inte kan läsa.
  test("en källa som bara ger grindavslag räknas också", async () => {
    const r = await kor([f.article], { allowlist: ["ingen-sadan-doman.example"] });
    const rader = Object.values(r.runStats.bySource);
    assert.equal(rader.length, 1);
    assert.equal(rader[0]!.succeeded, 1, "artikeln lästes utan fel");
    assert.equal(r.runStats.reviewCandidates, 1, "posten är ett grindavslag");
    assert.equal(rader[0]!.kandidater, 1, "och räknas på källan");
  });

});
