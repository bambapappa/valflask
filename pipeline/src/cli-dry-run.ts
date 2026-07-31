import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { LiveSource, type SourceConfig } from "./fetch.ts";
import { runDryRunFetch } from "./index.ts";

const DATA_DIR = resolve(process.cwd(), "../data");
const REPORT_DIR = resolve(process.cwd(), ".report");

async function main(): Promise<void> {
  const sourcesPath = resolve(DATA_DIR, "sources.yaml");
  const sourcesYaml = readFileSync(sourcesPath, "utf8");
  const config = parseYaml(sourcesYaml) as SourceConfig;

  if (!config.feeds || config.feeds.length === 0) {
    console.error("Inga feeds konfigurerade i sources.yaml");
    process.exit(1);
  }

  console.log(`Laddade ${config.feeds.length} feeds från sources.yaml`);
  console.log(`Gränser: max ${config.limits.max_articles_per_run} artiklar, min ${config.limits.min_chars} tecken\n`);

  const cacheDir = resolve(process.cwd(), ".cache");

  const source = new LiveSource({
    feeds: config.feeds,
    limits: config.limits,
    cacheDir,
  });

  const result = await runDryRunFetch(source, DATA_DIR);

  if (result.totalFetched === 0) {
    console.log("VARNING: Inga artiklar hämtade. Kontrollera nätverksåtkomst och feed-URL:er.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Dry-run misslyckades:", e);
  process.exit(1);
});
