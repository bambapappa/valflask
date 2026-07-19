/**
 * Förslagssteget (HV2) som CLI: rankar kandidatdokument per löfte, låter
 * språkmodellen föreslå kopplingar med exakt citat, prövar H1–H5 och
 * lägger passerande förslag i kön data/kopplingsforslag.json — där de
 * väntar på ägarens beslut (H6). Ingenting skrivs till kopplingar.json här.
 *
 *   npm run foreslag -- --promises <sökväg till valflask data/promises.json> --lofte p-2026-0042
 *   npm run foreslag -- --promises …/promises.json --alla --max-kandidater 5
 *
 * Miljö: OPENROUTER_API_KEY (krävs), MODEL_KOPPLING (krävs), samt valfritt
 * LLM_FALLBACK_BASE_URL, LLM_FALLBACK_API_KEY, MODEL_KOPPLING_FALLBACK.
 * --dry-run visar kandidatlistan utan modellanrop.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchDokumentText, type HttpFetch } from "../src/riksdagen.ts";
import type { Handling } from "../src/handlingar.ts";
import { OpenRouterClient } from "../src/llm.ts";
import { rankaKandidater, skapaForslag, type Lofte } from "../src/foreslag.ts";
import { LAGE_A_FONSTER, type KopplingsForslag } from "../src/grindar.ts";

interface KoPost extends KopplingsForslag {
  skapad: string;
  extraction: { model: string; verified_by: null; run_id: string };
}

function parseArgs(argv: string[]) {
  let promisesPath: string | undefined;
  let lofteId: string | undefined;
  let alla = false;
  let maxKandidater = 8;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--promises") promisesPath = resolve(argv[++i]!);
    else if (a === "--lofte") lofteId = argv[++i]!;
    else if (a === "--alla") alla = true;
    else if (a === "--max-kandidater") maxKandidater = Number(argv[++i]);
    else if (a === "--dry-run") dryRun = true;
  }
  if (!promisesPath) throw new Error("--promises <sökväg> krävs (valflask data/promises.json)");
  if (!lofteId && !alla) throw new Error("ange --lofte <p-id> eller --alla");
  return { promisesPath, lofteId, alla, maxKandidater, dryRun };
}

const politeFetch: HttpFetch = async (url) => {
  await new Promise((r) => setTimeout(r, 300));
  return fetch(url);
};

async function main() {
  const { promisesPath, lofteId, maxKandidater, dryRun } = parseArgs(process.argv.slice(2));
  const rot = resolve(import.meta.dirname, "../..");
  const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));
  const promises: Array<Lofte & { status?: string }> = JSON.parse(readFileSync(promisesPath, "utf8"));
  const loften = promises.filter((p) => (p.status ?? "aktiv") === "aktiv" && (!lofteId || p.id === lofteId));
  if (loften.length === 0) throw new Error(`inget aktivt löfte matchar ${lofteId ?? "--alla"}`);

  const koPath = resolve(rot, "data/kopplingsforslag.json");
  const ko: KoPost[] = existsSync(koPath) ? JSON.parse(readFileSync(koPath, "utf8")) : [];
  const sedd = new Set(ko.map((k) => `${k.promise_id ?? k.stance_id}::${k.handling_id}`));

  let llm: OpenRouterClient | undefined;
  let model = "";
  let systemPrompt = "";
  if (!dryRun) {
    const apiKey = process.env["OPENROUTER_API_KEY"];
    model = process.env["MODEL_KOPPLING"] ?? "";
    if (!apiKey || !model) throw new Error("OPENROUTER_API_KEY och MODEL_KOPPLING krävs (eller kör --dry-run)");
    const fallbackModel = process.env["MODEL_KOPPLING_FALLBACK"];
    llm = new OpenRouterClient({
      apiKey,
      ...(process.env["LLM_FALLBACK_BASE_URL"] ? { fallbackBaseUrl: process.env["LLM_FALLBACK_BASE_URL"] } : {}),
      ...(process.env["LLM_FALLBACK_API_KEY"] ? { fallbackApiKey: process.env["LLM_FALLBACK_API_KEY"] } : {}),
      ...(fallbackModel ? { fallbackModelMap: { [model]: fallbackModel } } : {}),
    });
    systemPrompt = readFileSync(resolve(import.meta.dirname, "../prompts/koppling.md"), "utf8");
  }

  const runId = `foreslag-${new Date().toISOString().slice(0, 10)}`;
  let nya = 0;
  for (const lofte of loften) {
    const kandidater = rankaKandidater(lofte, handlingar, maxKandidater);
    console.log(`${lofte.id} "${lofte.title.slice(0, 60)}" — ${kandidater.length} kandidater`);
    for (const { handling, poang } of kandidater) {
      if (sedd.has(`${lofte.id}::${handling.id}`)) continue;
      if (dryRun) {
        console.log(`  [${poang}] ${handling.id} ${handling.kind} ${handling.datum} ${handling.titel.slice(0, 70)}`);
        continue;
      }
      const kalltext = await fetchDokumentText(politeFetch, handling.dok_id);
      const { forslag, grindfel } = await skapaForslag(llm!, systemPrompt, model, lofte, handling, kalltext, LAGE_A_FONSTER);
      sedd.add(`${lofte.id}::${handling.id}`);
      if (!forslag) {
        console.log(`  ${handling.id}: ingen koppling föreslagen`);
        continue;
      }
      if (grindfel.length > 0) {
        console.log(`  ${handling.id}: fälld av ${grindfel.map((f) => f.grind).join(",")} — ${grindfel[0]!.reason}`);
        continue;
      }
      ko.push({ ...forslag, skapad: new Date().toISOString(), extraction: { model, verified_by: null, run_id: runId } });
      nya += 1;
      console.log(`  ${handling.id}: förslag i kö (${forslag.riktning}, conf ${forslag.confidence})`);
    }
  }

  if (!dryRun) {
    writeFileSync(koPath, JSON.stringify(ko, null, 2) + "\n");
    console.log(`klart: ${nya} nya förslag → ${koPath} (väntar på ägarbeslut H6)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
