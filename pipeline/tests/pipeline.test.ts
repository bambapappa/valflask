import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { LlmClient, LlmOptions } from "../src/llm.ts";
import type { NormalizedArticle } from "../src/gates.ts";
import { MemorySource } from "../src/fetch.ts";
import { mockArchive } from "../src/archive.ts";
import { runPipeline, type PipelineContext } from "../src/index.ts";
import type { PipelinePromise } from "../src/publish.ts";

/* ──────────────────────── Fixture loading ── */

interface FixtureData {
  article: NormalizedArticle;
  extractResponse: string;
  verifyResponse: string;
  quipResponse: string;
}

function loadFixture(name: string): FixtureData {
  const raw = readFileSync(
    join(import.meta.dirname, "..", "fixtures", name),
    "utf8",
  );
  return JSON.parse(raw) as FixtureData;
}

function loadFixtures(names: string[]): FixtureData[] {
  return names.map(loadFixture);
}

/* ──────────────────────── Fixture-keyed mock LLM ── */

class FixtureMockLlm implements LlmClient {
  private byUrl: Map<string, FixtureData>;
  private quipByTitle: Map<string, string>;

  constructor(fixtures: FixtureData[]) {
    this.byUrl = new Map(fixtures.map((f) => [f.article.url, f]));
    this.quipByTitle = new Map();
    for (const f of fixtures) {
      try {
        const ext = JSON.parse(f.extractResponse) as {
          promises: Array<{ title: string }>;
        };
        for (const p of ext.promises) {
          this.quipByTitle.set(p.title, f.quipResponse);
        }
      } catch {
        // skip
      }
    }
  }

  async complete(prompt: string, opts?: LlmOptions): Promise<string> {
    const sys = opts?.systemPrompt ?? "";

    if (sys.includes("extraktionsmotor")) {
      const match = prompt.match(/url="([^"]+)"/);
      const url = match?.[1] ?? "";
      return (
        this.byUrl.get(url)?.extractResponse ?? '{"promises":[]}'
      );
    }

    if (sys.includes("oberoende granskare")) {
      const match = prompt.match(/url="([^"]+)"/);
      const url = match?.[1] ?? "";
      return (
        this.byUrl.get(url)?.verifyResponse
          ?? '{"is_promise":true,"party_correct":true,"amount_in_text":null,"verdict":"publish","reason":"mock"}'
      );
    }

    if (sys.includes("stenograf")) {
      for (const [title, quip] of this.quipByTitle) {
        if (prompt.includes(title)) return quip;
      }
      return "En torr kommentar om beloppet.";
    }

    return '{"error":"unknown call type"}';
  }
}

/* ──────────────────────── Test helpers ── */

const NOW = new Date("2026-06-12T06:00:00Z");
const RUN_ID = "2026-06-12T06";
const ALLOWLIST = [
  "dn.se",
  "svt.se",
  "svd.se",
  "gp.se",
  "expressen.se",
  "aftonbladet.se",
  "di.se",
  "sverigesradio.se",
  "altinget.se",
];

function makeContext(
  fixtures: FixtureData[],
  tmpDir: string,
  mode: "auto" | "review" = "auto",
): PipelineContext {
  const articles = fixtures.map((f) => f.article);
  return {
    now: NOW,
    runId: RUN_ID,
    llm: new FixtureMockLlm(fixtures),
    articleSource: new MemorySource(articles),
    outputDir: tmpDir,
    dataDir: tmpDir,
    allowlist: ALLOWLIST,
    mode,
    archiveFn: mockArchive,
    models: {
      extract: "mock-extract",
      verify: "mock-verify",
      copy: "mock-copy",
    },
  };
}

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), "drygast-test-"));
}

function writeExistingPromises(
  tmpDir: string,
  promises: PipelinePromise[],
): void {
  writeFileSync(
    join(tmpDir, "promises.json"),
    JSON.stringify(promises, null, 2) + "\n",
  );
}

/* ──────────────────────── T4: Snapshot ── */

describe("T4: full pipeline snapshot", () => {
  test("deterministic output from normal fixtures — two runs deeply equal", async () => {
    const fixtures = loadFixtures([
      "normal-1.json",
      "normal-2.json",
      "normal-3.json",
    ]);

    const tmp1 = makeTmp();
    const tmp2 = makeTmp();
    try {
      writeExistingPromises(tmp1, []);
      writeExistingPromises(tmp2, []);

      const result1 = await runPipeline(makeContext(fixtures, tmp1));
      const result2 = await runPipeline(makeContext(fixtures, tmp2));

      assert.deepEqual(result1, result2, "Two runs must be deeply identical");
      assert.equal(result1.promises.length, 3, "Three promises published");
      assert.equal(result1.errors.length, 0, "No errors");
      assert.equal(result1.dataHash, result2.dataHash, "data_hash stable");
      assert.equal(result1.dataHash.length, 64, "SHA-256 hex");

      const promises = JSON.parse(
        readFileSync(join(tmp1, "promises.json"), "utf8"),
      ) as PipelinePromise[];
      assert.equal(promises.length, 3);
      for (const p of promises) {
        assert.ok(p.id.startsWith("p-2026-"), `id format: ${p.id}`);
        assert.equal(p.status, "aktiv");
        assert.ok(p.slug.length > 0);
        assert.ok(p.quote.length > 0);
        assert.equal(p.extraction.run_id, RUN_ID);
      }

      const ids = promises.map((p) => p.id);
      assert.deepEqual(ids, [...ids].sort(), "Promises sorted by id");

      const changelog = JSON.parse(
        readFileSync(join(tmp1, "changelog.json"), "utf8"),
      ) as Array<{ added: string[]; data_hash: string }>;
      assert.equal(changelog.length, 1);
      assert.deepEqual(changelog[0]!.added, ids);
      assert.equal(changelog[0]!.data_hash, result1.dataHash);

      const seen = JSON.parse(
        readFileSync(join(tmp1, "seen.json"), "utf8"),
      ) as Record<string, string>;
      assert.equal(Object.keys(seen).length, 3);
    } finally {
      rmSync(tmp1, { recursive: true });
      rmSync(tmp2, { recursive: true });
    }
  });

  test("T4 snapshot: output matches checked-in snapshot", async () => {
    const fixtures = loadFixtures([
      "normal-1.json",
      "normal-2.json",
      "normal-3.json",
    ]);
    const tmp = makeTmp();
    try {
      writeExistingPromises(tmp, []);
      await runPipeline(makeContext(fixtures, tmp));
      const promisesJson = readFileSync(
        join(tmp, "promises.json"),
        "utf8",
      );

      const snapshotDir = join(import.meta.dirname, "__snapshots__");
      const snapshotPath = join(snapshotDir, "T4-promises.json");

      let expected: string;
      try {
        expected = readFileSync(snapshotPath, "utf8");
      } catch {
        mkdirSync(snapshotDir, { recursive: true });
        writeFileSync(snapshotPath, promisesJson);
        console.log("T4 snapshot created — first run");
        return;
      }
      assert.equal(promisesJson, expected, "Snapshot must match");
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });
});

/* ──────────────────────── T5: Fabricated quote ── */

describe("T5: fabricated quote stops at G3", () => {
  test("fabricated quote → needs_review, not published", async () => {
    const fixtures = loadFixtures(["fabricated.json"]);
    const tmp = makeTmp();
    try {
      writeExistingPromises(tmp, []);
      const result = await runPipeline(makeContext(fixtures, tmp));

      assert.equal(result.promises.length, 0, "Nothing published");
      assert.ok(result.needsReview.length >= 1, "At least one review item");

      const review = result.needsReview[0]!;
      assert.ok(
        review.failures.some((f) => f.gate === "G3"),
        "G3 failure present",
      );
      assert.ok(
        review.failures.some(
          (f) =>
            f.reason.includes("ordagrant") || f.reason.includes("verbatim"),
        ),
        "Reason mentions verbatim",
      );

      const parsed = JSON.parse(
        readFileSync(join(tmp, "promises.json"), "utf8"),
      ) as PipelinePromise[];
      assert.equal(parsed.length, 0);
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });
});

/* ──────────────────────── T6: Injection suite ── */

describe("T6: injection suite — zero published", () => {
  const injectionFiles = [
    "injection-1.json",
    "injection-2.json",
    "injection-3.json",
    "injection-4.json",
    "injection-5.json",
  ];

  test("all injection variants together → zero published, no crash", async () => {
    const fixtures = loadFixtures(injectionFiles);
    const tmp = makeTmp();
    try {
      writeExistingPromises(tmp, []);
      const result = await runPipeline(makeContext(fixtures, tmp));

      assert.equal(
        result.promises.length,
        0,
        `Expected 0 published, got ${result.promises.length}`,
      );
      assert.equal(result.errors.length, 0, "No crashes");
      assert.ok(
        result.needsReview.length >= 5,
        "All injection candidates in review",
      );
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });

  for (const file of injectionFiles) {
    test(`${file}: individually → zero published`, async () => {
      const fixtures = loadFixtures([file]);
      const tmp = makeTmp();
      try {
        writeExistingPromises(tmp, []);
        const result = await runPipeline(makeContext(fixtures, tmp));

        assert.equal(
          result.promises.length,
          0,
          `${file}: expected 0 published, got ${result.promises.length}`,
        );
        assert.ok(
          result.needsReview.length >= 1,
          `${file}: at least one review item`,
        );
        assert.equal(result.errors.length, 0, `${file}: no errors`);
      } finally {
        rmSync(tmp, { recursive: true });
      }
    });
  }

  test("injection-3 (amount bomb) stopped by G4/R5", async () => {
    const fixtures = loadFixtures(["injection-3.json"]);
    const tmp = makeTmp();
    try {
      writeExistingPromises(tmp, []);
      const result = await runPipeline(makeContext(fixtures, tmp));

      assert.equal(result.promises.length, 0);
      const r5failure = result.needsReview.find((r) =>
        r.failures.some(
          (f) => f.gate === "G4" && f.reason.includes("R5"),
        ),
      );
      assert.ok(r5failure, "R5 failure present for amount bomb");
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });
});
