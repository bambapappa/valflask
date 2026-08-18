import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildContextFromEnv, byggLed } from "../src/cli-run.ts";
import type { SourceConfig } from "../src/fetch.ts";

const config: SourceConfig = {
  allowlist_domains: ["data.riksdagen.se", "www.dn.se"],
  feeds: [{ id: "dn", type: "rss", url: "https://www.dn.se/rss/politik" }],
  limits: { max_articles_per_run: 10, min_chars: 400 },
};

const baseEnv: Record<string, string> = {
  // Primären har ingen inbyggd leverantör längre — adressen måste anges.
  LLM_BASE_URL: "https://openrouter.ai/api/v1",
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
    assert.throws(() => buildContextFromEnv(envWithout("OPENROUTER_API_KEY"), opts), /halvt konfigurerat/);
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
      /halvt konfigurerat/,
    );
  });

  // Ett led är komplett först när det har adress, nyckel OCH egna modellnamn.
  // Enbart adress + nyckel räcker inte längre: ett led utan egna modellnamn
  // får primärens strängar och svarar 4xx hos en leverantör med annat
  // namnschema — det var precis så reserven kunde stå som attrapp i drift.
  it("accepterar komplett fallback-led (adress, nyckel och modeller)", () => {
    const ctx = buildContextFromEnv(
      envWith({
        LLM_FALLBACK_BASE_URL: "https://opencode.ai/zen/go/v1",
        LLM_FALLBACK_API_KEY: "oc-test",
        MODEL_EXTRACT_FALLBACK: "deepseek-v4-pro",
        MODEL_VERIFY_FALLBACK: "kimi-k2.7",
        MODEL_COPY_FALLBACK: "glm-5.1",
      }),
      opts,
    );
    assert.ok(ctx.llm);
  });

  // Ett led vars nycklar finns för ETT ANNAT arbete (matchningen har egna
  // MODEL_KOPPLING_*) ska hoppas över, inte fälla körningen. Utan den
  // skillnaden hade pipelinen kastat vid nästa körning bara för att det
  // extra ledets adress och nyckel råkar vara satta i repot.
  it("hoppar över ett led som har adress och nyckel men inga modeller för rollerna", () => {
    const ctx = buildContextFromEnv(
      envWith({ LLM_ZAI_BASE_URL: "https://z.ai/api/paas/v4", LLM_ZAI_API_KEY: "z-test" }),
      opts,
    );
    assert.equal(ctx.models.extract, "deepseek-v4-pro");
  });

  it("kastar när bara en fallback-modell är satt (kräver alla tre)", () => {
    assert.throws(
      () => buildContextFromEnv(envWith({ MODEL_EXTRACT_FALLBACK: "deepseek-v4-pro" }), opts),
      /halvt konfigurerat/,
    );
  });

  it("accepterar komplett fallback-endpoint + fallback-modeller", () => {
    const ctx = buildContextFromEnv(
      envWith({
        LLM_FALLBACK_BASE_URL: "https://opencode.ai/zen/go/v1",
        LLM_FALLBACK_API_KEY: "oc-test",
        MODEL_EXTRACT_FALLBACK: "deepseek-v4-pro",
        MODEL_VERIFY_FALLBACK: "kimi-k2.7",
        MODEL_COPY_FALLBACK: "glm-5.1",
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

describe("varningen mäter bristen på modellreserv, inte mönstret", () => {
  // Projektets uppsättning: primär och sekundär är TVÅ KONTON hos samma
  // leverantör med samma modeller, det tredje ledet har egna. Det är en
  // fullgod reserv mot allt som sitter i kontot — slut kvot, taktspärr, död
  // nyckel — och ska inte varnas för. Bara när HELA kedjan kör en enda modell
  // för en roll finns det inget kvar när modellen faller.

  const roller = { extract: "extract", verify: "verify", copy: "copy" };

  function fangaVarningar(fn: () => void): string[] {
    const rader: string[] = [];
    const original = console.warn;
    console.warn = (...a: unknown[]) => void rader.push(a.join(" "));
    try {
      fn();
    } finally {
      console.warn = original;
    }
    return rader.filter((r) => /i HELA kedjan/u.test(r));
  }

  const env = (led: Array<Record<string, string>>) => {
    const e: Record<string, string> = {};
    const suffix = ["", "_FALLBACK", "_ZAI"];
    const url = ["LLM_BASE_URL", "LLM_FALLBACK_BASE_URL", "LLM_ZAI_BASE_URL"];
    const key = ["LLM_API_KEY", "LLM_FALLBACK_API_KEY", "LLM_ZAI_API_KEY"];
    led.forEach((m, n) => {
      e[url[n]!] = `https://led${n + 1}`;
      e[key[n]!] = `nyckel-${n + 1}`;
      for (const roll of Object.keys(roller)) {
        e[`MODEL_${roll.toUpperCase()}${suffix[n]}`] = m[roll]!;
      }
    });
    return e;
  };

  it("varnar INTE för två konton med samma modell när ett tredje led bär en egen", () => {
    // Uppsättningen i drift: go konto 1, go konto 2, zai.
    const rader = fangaVarningar(() =>
      byggLed(
        env([
          { extract: "deepseek", verify: "kimi", copy: "copy-a" },
          { extract: "deepseek", verify: "kimi", copy: "copy-a" },
          { extract: "glm", verify: "glm", copy: "glm" },
        ]),
        roller,
      ),
    );
    assert.deepEqual(rader, [], "delad modell mellan konton är en reserv, inte en brist");
  });

  it("varnar när rollen kör en enda modell i hela kedjan", () => {
    const rader = fangaVarningar(() =>
      byggLed(
        env([
          { extract: "deepseek", verify: "kimi", copy: "copy-a" },
          { extract: "deepseek", verify: "glm", copy: "copy-b" },
        ]),
        roller,
      ),
    );
    assert.equal(rader.length, 1, "bara utvinningsrollen saknar modellreserv");
    assert.match(rader[0]!, /rollen extract/u);
    assert.match(rader[0]!, /deepseek/u);
    assert.match(rader[0]!, /MODEL_EXTRACT/u);
    assert.doesNotMatch(rader[0]!, /rollen verify/u, "verify har två modeller och är hel");
  });

  it("varnar inte för ett ensamt led — det finns ingen reserv att sakna", () => {
    const rader = fangaVarningar(() =>
      byggLed(env([{ extract: "deepseek", verify: "kimi", copy: "copy-a" }]), roller),
    );
    assert.deepEqual(rader, [], "en kedja med ett led är ett val, inte en brist");
  });

  it("varningen stoppar inte körningen", () => {
    const e = env([
      { extract: "deepseek", verify: "deepseek", copy: "deepseek" },
      { extract: "deepseek", verify: "deepseek", copy: "deepseek" },
    ]);
    const rader = fangaVarningar(() => void byggLed(e, roller));
    assert.equal(rader.length, 3, "alla tre rollerna saknar modellreserv");
    assert.equal(byggLed(e, roller).length, 2, "båda leden är ändå kvar");
  });
});

