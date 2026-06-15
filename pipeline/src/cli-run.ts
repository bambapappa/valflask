import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { LiveSource, type SourceConfig } from "./fetch.ts";
import { OpenRouterClient } from "./llm.ts";
import { createArchiveFn } from "./archive.ts";
import { runPipeline, type PipelineContext } from "./index.ts";

const DATA_DIR = resolve(process.cwd(), "../data");

function getEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const v = env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

/**
 * Bygger en PipelineContext från miljövariabler + sources-konfig.
 * Ren och testbar: konstruerar klient/källa/arkiv (inga nätanrop förrän pipelinen körs),
 * och kastar med tydligt felmeddelande vid ogiltig konfiguration.
 */
export function buildContextFromEnv(
  env: NodeJS.ProcessEnv,
  opts: {
    config: SourceConfig;
    dataDir: string;
    now?: Date;
    cacheDir?: string;
  },
): PipelineContext {
  const apiKey = getEnv(env, "OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("Saknad miljövariabel: OPENROUTER_API_KEY");

  const fallbackBaseUrl = getEnv(env, "LLM_FALLBACK_BASE_URL");
  const fallbackApiKey = getEnv(env, "LLM_FALLBACK_API_KEY");
  if ((fallbackBaseUrl && !fallbackApiKey) || (!fallbackBaseUrl && fallbackApiKey)) {
    throw new Error(
      "LLM_FALLBACK_BASE_URL och LLM_FALLBACK_API_KEY måste sättas tillsammans (eller ingen).",
    );
  }

  const extract = getEnv(env, "MODEL_EXTRACT");
  const verify = getEnv(env, "MODEL_VERIFY");
  const copy = getEnv(env, "MODEL_COPY");
  if (!extract) throw new Error("Saknad miljövariabel: MODEL_EXTRACT");
  if (!verify) throw new Error("Saknad miljövariabel: MODEL_VERIFY");
  if (!copy) throw new Error("Saknad miljövariabel: MODEL_COPY");
  if (extract === verify) {
    throw new Error(
      "MODEL_VERIFY måste vara en annan modell än MODEL_EXTRACT (§20: oberoende verifiering).",
    );
  }

  const modeRaw = (getEnv(env, "PIPELINE_MODE") ?? "review").toLowerCase();
  if (modeRaw !== "review" && modeRaw !== "auto") {
    throw new Error(`Ogiltig PIPELINE_MODE: "${modeRaw}" (tillåtet: review | auto)`);
  }
  const mode = modeRaw as "review" | "auto";

  const { config, dataDir } = opts;
  if (!config.feeds || config.feeds.length === 0) {
    throw new Error("sources.yaml: inga feeds konfigurerade.");
  }
  if (!config.allowlist_domains || config.allowlist_domains.length === 0) {
    throw new Error("sources.yaml: tom allowlist_domains.");
  }

  const llm =
    fallbackBaseUrl && fallbackApiKey
      ? new OpenRouterClient({ apiKey, fallbackBaseUrl, fallbackApiKey })
      : new OpenRouterClient({ apiKey });

  const articleSource = new LiveSource({
    feeds: config.feeds,
    limits: config.limits,
    cacheDir: opts.cacheDir ?? null,
  });

  const now = opts.now ?? new Date();
  const runId = `run-${now.toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;

  return {
    now,
    runId,
    llm,
    articleSource,
    outputDir: dataDir,
    dataDir,
    allowlist: config.allowlist_domains,
    mode,
    archiveFn: createArchiveFn(),
    models: { extract, verify, copy },
  };
}

async function main(): Promise<void> {
  const sourcesPath = resolve(DATA_DIR, "sources.yaml");
  const config = parseYaml(readFileSync(sourcesPath, "utf8")) as SourceConfig;

  const ctx = buildContextFromEnv(process.env, {
    config,
    dataDir: DATA_DIR,
    cacheDir: resolve(process.cwd(), ".cache"),
  });

  console.log(
    `Körning ${ctx.runId} | läge=${ctx.mode} | feeds=${config.feeds.length} | ` +
      `extract=${ctx.models.extract} verify=${ctx.models.verify} copy=${ctx.models.copy}`,
  );

  const result = await runPipeline(ctx);

  console.log(
    `Klart: ${result.promises.length} publicerade, ${result.needsReview.length} till review, ` +
      `${result.errors.length} fel.`,
  );
  for (const e of result.errors.slice(0, 10)) {
    console.error(`  FEL ${e.url}: ${e.error}`);
  }

  // Larma CI om körningen producerade ingenting men hade fel.
  if (
    result.promises.length === 0 &&
    result.needsReview.length === 0 &&
    result.errors.length > 0
  ) {
    console.error("Inga kandidater producerade och fel uppstod — markerar körningen misslyckad.");
    process.exit(1);
  }
}

// Kör endast som direkt entrypoint (inte vid import från tester).
import { pathToFileURL } from "node:url";
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((e) => {
    console.error("Pipeline misslyckades:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
