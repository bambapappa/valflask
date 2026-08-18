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

describe("en reserv som bär samma modellnamn är ingen reserv", () => {
  // Natten till 2026-08-18 svarade utvinningsrollen varken på primären eller
  // sekundären, medan verifieringen och copyn gick igenom på samma led. Båda
  // leden var satta till samma utvinningsmodell, så ett modellfel slog ut dem
  // samtidigt. Kedjan såg ut att ha tre led och hade i praktiken två.

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
    return rader;
  }

  const tvaLed = (extractPrimar: string, extractSekundar: string) => ({
    LLM_BASE_URL: "https://ett",
    LLM_API_KEY: "k1",
    MODEL_EXTRACT: extractPrimar,
    MODEL_VERIFY: "kimi",
    MODEL_COPY: "copy-a",
    LLM_FALLBACK_BASE_URL: "https://tva",
    LLM_FALLBACK_API_KEY: "k2",
    MODEL_EXTRACT_FALLBACK: extractSekundar,
    MODEL_VERIFY_FALLBACK: "kimi-2",
    MODEL_COPY_FALLBACK: "copy-b",
  });

  it("varnar när två led kör samma modell för samma roll", () => {
    const rader = fangaVarningar(() => byggLed(tvaLed("deepseek", "deepseek"), roller));
    const träff = rader.filter((r) => /samma modell \(deepseek\)/u.test(r));
    assert.equal(träff.length, 1, "exakt en varning för utvinningsrollen");
    assert.match(träff[0]!, /primär och sekundär/u, "båda leden ska namnges");
    assert.match(träff[0]!, /MODEL_EXTRACT/u, "och variabeln som ska ändras");
  });

  it("varnar inte när leden bär olika modellnamn", () => {
    const rader = fangaVarningar(() => byggLed(tvaLed("deepseek", "glm"), roller));
    assert.deepEqual(
      rader.filter((r) => /samma modell/u.test(r)),
      [],
      "olika modeller ⇒ ingen varning, annars blir den brus",
    );
  });

  it("varnar per roll, inte per led — verify och copy skiljer sig här", () => {
    const rader = fangaVarningar(() => byggLed(tvaLed("deepseek", "deepseek"), roller));
    assert.equal(rader.filter((r) => /samma modell/u.test(r)).length, 1);
    assert.equal(rader.filter((r) => /rollen verify/u.test(r)).length, 0);
    assert.equal(rader.filter((r) => /rollen copy/u.test(r)).length, 0);
  });

  it("varningen stoppar inte körningen — kedjan byggs ändå", () => {
    const led = fangaVarningar(() => void byggLed(tvaLed("deepseek", "deepseek"), roller));
    assert.ok(led.length > 0, "varningen ska ha skrivits");
    const kedja = byggLed(tvaLed("deepseek", "deepseek"), roller);
    assert.equal(kedja.length, 2, "båda leden är kvar — att dela kvot kan vara avsiktligt");
  });
});
