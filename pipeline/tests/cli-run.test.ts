import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildContextFromEnv } from "../src/cli-run.ts";
import type { SourceConfig } from "../src/fetch.ts";

const config: SourceConfig = {
  allowlist_domains: ["data.riksdagen.se", "www.dn.se"],
  feeds: [{ id: "dn", type: "rss", url: "https://www.dn.se/rss/politik" }],
  limits: { max_articles_per_run: 10, min_chars: 400 },
};

const baseEnv: Record<string, string> = {
  OPENROUTER_API_KEY: "sk-test",
  MODEL_EXTRACT: "deepseek-v4-pro",
  MODEL_VERIFY: "kimi-k2.7",
  MODEL_COPY: "glm-5.1",
  PIPELINE_MODE: "review",
};

const opts = {
  config,
  dataDir: "/tmp/drygast-test",
  now: new Date("2026-06-14T21:30:00Z"),
};

function envWithout(key: string): NodeJS.ProcessEnv {
  const e: Record<string, string> = { ...baseEnv };
  delete e[key];
  return e as NodeJS.ProcessEnv;
}

function envWith(extra: Record<string, string>): NodeJS.ProcessEnv {
  return { ...baseEnv, ...extra } as NodeJS.ProcessEnv;
}

describe("cli-run buildContextFromEnv", () => {
  it("bygger giltig ctx från korrekt env", () => {
    const ctx = buildContextFromEnv(baseEnv as NodeJS.ProcessEnv, opts);
    assert.equal(ctx.mode, "review");
    assert.deepEqual(ctx.models, {
      extract: "deepseek-v4-pro",
      verify: "kimi-k2.7",
      copy: "glm-5.1",
    });
    assert.deepEqual([...ctx.allowlist], ["data.riksdagen.se", "www.dn.se"]);
    assert.equal(ctx.maxNewArticles, 10);
    assert.equal(ctx.runId, "run-2026-06-14-21-30");
    assert.equal(ctx.outputDir, "/tmp/drygast-test");
    assert.ok(ctx.llm && ctx.articleSource && ctx.archiveFn);
  });

  it("default-läge är review när PIPELINE_MODE saknas", () => {
    assert.equal(buildContextFromEnv(envWithout("PIPELINE_MODE"), opts).mode, "review");
  });

  it("auto-läge accepteras", () => {
    assert.equal(buildContextFromEnv(envWith({ PIPELINE_MODE: "auto" }), opts).mode, "auto");
  });

  it("kastar utan OPENROUTER_API_KEY", () => {
    assert.throws(() => buildContextFromEnv(envWithout("OPENROUTER_API_KEY"), opts), /OPENROUTER_API_KEY/);
  });

  it("kastar utan MODEL_EXTRACT", () => {
    assert.throws(() => buildContextFromEnv(envWithout("MODEL_EXTRACT"), opts), /MODEL_EXTRACT/);
  });

  it("kastar när MODEL_VERIFY == MODEL_EXTRACT (§20)", () => {
    assert.throws(
      () => buildContextFromEnv(envWith({ MODEL_VERIFY: "deepseek-v4-pro" }), opts),
      /annan modell/,
    );
  });

  it("kastar vid ogiltig PIPELINE_MODE", () => {
    assert.throws(() => buildContextFromEnv(envWith({ PIPELINE_MODE: "yolo" }), opts), /Ogiltig PIPELINE_MODE/);
  });

  it("kastar när bara en fallback-del är satt", () => {
    assert.throws(
      () => buildContextFromEnv(envWith({ LLM_FALLBACK_BASE_URL: "https://x/v1" }), opts),
      /tillsammans/,
    );
  });

  it("accepterar komplett fallback-par (OpenCode Go)", () => {
    const ctx = buildContextFromEnv(
      envWith({
        LLM_FALLBACK_BASE_URL: "https://opencode.ai/zen/go/v1",
        LLM_FALLBACK_API_KEY: "oc-test",
      }),
      opts,
    );
    assert.ok(ctx.llm);
  });

  it("kastar vid tom allowlist i sources.yaml", () => {
    assert.throws(
      () => buildContextFromEnv(baseEnv as NodeJS.ProcessEnv, {
        ...opts,
        config: { ...config, allowlist_domains: [] },
      }),
      /allowlist/,
    );
  });
});
