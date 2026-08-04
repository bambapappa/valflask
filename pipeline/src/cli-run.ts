import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { LiveSource, type SourceConfig } from "./fetch.ts";
import { OpenRouterClient, type LlmLed } from "./llm.ts";
import { createArchiveFn } from "./archive.ts";
import { runPipeline, type PipelineContext } from "./index.ts";

const DATA_DIR = resolve(process.cwd(), "../data");

function getEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const v = env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

/**
 * Anropskedjans tre led. Varje led har sin egen adress, sin egen nyckel och
 * sina egna modellnamn — inget om leverantörerna finns i koden, så en
 * leverantör byts ut genom att ändra variabler.
 *
 * Suffixet är det som skiljer variabelnamnen åt: primären har inget,
 * sekundären `_FALLBACK`, det extra ledet `_ZAI`. Samma mönster gäller
 * modellerna: `MODEL_COPY`, `MODEL_COPY_FALLBACK`, `MODEL_COPY_ZAI`.
 */
const LED_ORDNING = [
  { namn: "primär", nyckel: "primar", url: "LLM_BASE_URL", key: "LLM_API_KEY", suffix: "" },
  { namn: "sekundär", nyckel: "sekundar", url: "LLM_FALLBACK_BASE_URL", key: "LLM_FALLBACK_API_KEY", suffix: "_FALLBACK" },
  { namn: "extra", nyckel: "extra", url: "LLM_ZAI_BASE_URL", key: "LLM_ZAI_API_KEY", suffix: "_ZAI" },
] as const;

/**
 * Bygger kedjan ur miljön.
 *
 * Ett led kommer med bara om det har adress, nyckel OCH modellnamn för alla
 * tre rollerna. Saknas modellnamnen hoppas ledet över med en rad i loggen —
 * tidigare togs det med ändå och fick primärens modellsträngar, vilket gav
 * 4xx hos en leverantör som inte känner igen dem. Ett led som inte kan svara
 * ska inte stå i kedjan och låtsas vara en reserv.
 *
 * `LLM_FORST` kan namnge ett led som ska provas först i just den här
 * körningen (`primar`, `sekundar` eller `extra`). Övriga följer i sin
 * vanliga ordning. Det är ingen omkonfigurering — bara en omkastning för en
 * körning, så att en leverantör går att prova utan att röra variablerna.
 */
export function byggLed(
  env: NodeJS.ProcessEnv,
  roller: Record<string, string>,
): LlmLed[] {
  const forst = getEnv(env, "LLM_FORST")?.toLowerCase();
  if (forst && !LED_ORDNING.some((l) => l.nyckel === forst)) {
    throw new Error(
      `Ogiltig LLM_FORST: "${forst}" (tillåtet: ${LED_ORDNING.map((l) => l.nyckel).join(" | ")})`,
    );
  }

  const ordnade = forst
    ? [...LED_ORDNING].sort((a, b) => Number(b.nyckel === forst) - Number(a.nyckel === forst))
    : [...LED_ORDNING];

  const led: LlmLed[] = [];
  for (const spec of ordnade) {
    const baseUrl = getEnv(env, spec.url);
    const apiKey =
      getEnv(env, spec.key) ??
      (spec.suffix === "" ? getEnv(env, "OPENROUTER_API_KEY") : undefined);

    const modeller: Record<string, string> = {};
    const saknade: string[] = [];
    if (!baseUrl) saknade.push(spec.url);
    if (!apiKey) saknade.push(spec.key);
    for (const [roll, primarModell] of Object.entries(roller)) {
      const namn = `MODEL_${roll.toUpperCase()}${spec.suffix}`;
      const varde = getEnv(env, namn);
      if (!varde) saknade.push(namn);
      else modeller[primarModell] = varde;
    }

    // Tre lägen, och skillnaden mellan dem är viktig:
    //
    //  • HELT osatt        → ledet är bortvalt. Hoppa tyst.
    //  • adress+nyckel men INGEN modell för någon av rollerna → ledet finns
    //    för ett ANNAT arbete (t.ex. matchningens `MODEL_KOPPLING_ZAI`) men
    //    är inte uppsatt för de här rollerna. Hoppa, men säg det — annars
    //    tror man att kedjan är längre än den är.
    //  • någon men inte alla delar satta → misstag. Stoppa körningen.
    //
    // Mellanläget fanns inte i första versionen, och följden var att
    // pipelinen hade kastat vid nästa körning bara för att det extra ledets
    // nycklar finns för matchningens räkning.
    const antalModeller = Object.keys(modeller).length;
    const antalSatta = 2 + Object.keys(roller).length - saknade.length;
    if (antalSatta === 0) continue;
    if (baseUrl && apiKey && antalModeller === 0) {
      console.warn(
        `LLM-kedjan: ledet "${spec.namn}" (${baseUrl}) har adress och nyckel men inga ` +
          `modellnamn för rollerna ${Object.keys(roller).join(", ")} — hoppas över. ` +
          `Sätt MODEL_<ROLL>${spec.suffix} för att ta med det.`,
      );
      continue;
    }
    if (saknade.length > 0) {
      throw new Error(
        `LLM-kedjans led "${spec.namn}" är halvt konfigurerat — saknar ${saknade.join(", ")}. ` +
          `Sätt alla, eller ingen av dem om ledet inte ska användas.`,
      );
    }

    led.push({ namn: spec.namn, baseUrl: baseUrl!, apiKey: apiKey!, modell: modeller });
  }

  if (led.length === 0) {
    throw new Error(
      "Ingen LLM-endpoint är fullständigt konfigurerad. Varje led behöver adress, " +
        "nyckel och modellnamn för alla tre rollerna — se LED_ORDNING i cli-run.ts.",
    );
  }
  return led;
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

  // Frågevågen: hård grind — passet är AV tills ägaren uttryckligen slår på
  // det (efter dubbel-/trippelverifiering av delfrågor och källor).
  const stancesEnabled = (getEnv(env, "STANCES_ENABLED") ?? "false").toLowerCase() === "true";
  // Egen mode-ratt för Frågevågen: PIPELINE_MODE delas med löftesflödet, och
  // torrkörningen (steg 2) får inte tvinga löftena till review — eller omvänt
  // låta auto-läget autopublicera ståndpunkter. Default REVIEW tills ägaren
  // uttryckligen växlar (steg 4 i ops/FRAGEVAGEN-LANSERING.md).
  const stancesModeRaw = (getEnv(env, "STANCES_MODE") ?? "review").toLowerCase();
  if (stancesModeRaw !== "review" && stancesModeRaw !== "auto") {
    throw new Error(`Ogiltig STANCES_MODE: "${stancesModeRaw}" (tillåtet: review | auto)`);
  }
  const stancesMode = stancesModeRaw as "review" | "auto";

  const { config, dataDir } = opts;
  if (!config.feeds || config.feeds.length === 0) {
    throw new Error("sources.yaml: inga feeds konfigurerade.");
  }
  if (!config.allowlist_domains || config.allowlist_domains.length === 0) {
    throw new Error("sources.yaml: tom allowlist_domains.");
  }

  const llm = new OpenRouterClient({ led: byggLed(env, { extract, verify, copy }) });

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
    partiDomaner: config.parti_domaner ?? [],
    mode,
    stancesEnabled,
    stancesMode,
    maxNewArticles: config.limits.max_articles_per_run,
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
    `Körning ${ctx.runId} | läge=${ctx.mode} | stances=${ctx.stancesEnabled ? `PÅ (${ctx.stancesMode})` : "av"} | feeds=${config.feeds.length} | ` +
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

  // Transienta LLM-fel (rate limit/timeout) ska INTE göra körningen röd — det
  // ger larm-trötthet och misconfig döljs. Failade artiklar är osedda och retas
  // nästa körning; ihållande avbrott syns via stale-banner/UptimeRobot (§15).
  // Endast konfigfel (saknad env, trasig sources.yaml) avslutar med kod 1 — det
  // sköts av buildContextFromEnv som kastar och fångas i main().
  if (
    result.promises.length === 0 &&
    result.needsReview.length === 0 &&
    result.errors.length > 0
  ) {
    console.warn(
      "Varning: inga kandidater producerade men fel uppstod (sannolikt rate limit/timeout). " +
        "Failade artiklar provas om nästa körning. Körningen markeras INTE misslyckad.",
    );
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
