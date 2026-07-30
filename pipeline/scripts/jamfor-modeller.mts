/**
 * Modelljämförelse: kör om ett givet urval REDAN AVGJORDA par mot en ny
 * modell och ställer utfallet sida vid sida med det ursprungliga.
 *
 * Rör ALDRIG produktionsfilerna (kopplingsforslag.json, provade-par.json,
 * inga GitHub-issues) — bara ett fristående jämförelseunderlag. Poängen är
 * att se om ett modellbyte (t.ex. deepseek-v4-pro -> glm-5.2) dömer
 * konsekvent på samma indata, inte att producera nya förslag att granska.
 *
 *   npm run jamfor -- --urval <fil med [{lofte, handling, ...}]> \
 *     --promises <valflask data/promises.json> --ut <utfil>
 *
 * Miljö: samma LLM_BASE_URL/LLM_API_KEY/MODEL_KOPPLING-mönster som
 * foreslag.mts — sätt dem till den modell som ska JÄMFÖRAS MOT.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchDokumentText, type HttpFetch } from "../src/riksdagen.ts";
import type { Betankande } from "../src/betankanden.ts";
import type { Handling } from "../src/handlingar.ts";
import { OpenRouterClient } from "../src/llm.ts";
import { skapaForslag, type Lofte } from "../src/foreslag.ts";
import { LAGE_A_FONSTER } from "../src/grindar.ts";

interface UrvalsPost {
  lofte: string;
  handling: string;
  deepseek_utfall: "forslag" | "ingen_koppling";
  deepseek_riktning?: string;
  deepseek_citat?: string;
  deepseek_confidence?: number;
}

function parseArgs(argv: string[]) {
  let urvalPath = "";
  let promisesPath = "";
  let utPath = "";
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--urval") urvalPath = resolve(argv[++i]!);
    else if (a === "--promises") promisesPath = resolve(argv[++i]!);
    else if (a === "--ut") utPath = resolve(argv[++i]!);
  }
  if (!urvalPath || !promisesPath || !utPath) {
    throw new Error("--urval, --promises och --ut krävs");
  }
  return { urvalPath, promisesPath, utPath };
}

const politeFetch: HttpFetch = async (url) => {
  await new Promise((r) => setTimeout(r, 300));
  return fetch(url);
};

async function main() {
  const { urvalPath, promisesPath, utPath } = parseArgs(process.argv.slice(2));
  const rot = resolve(import.meta.dirname, "../..");

  const urval: UrvalsPost[] = JSON.parse(readFileSync(urvalPath, "utf8"));
  const promises: Lofte[] = JSON.parse(readFileSync(promisesPath, "utf8"));
  const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));
  const betPath = resolve(rot, "data/betankanden.json");
  const betankanden: Betankande[] = existsSync(betPath) ? JSON.parse(readFileSync(betPath, "utf8")) : [];
  const betIndex = new Map(betankanden.map((b) => [b.dok_id, b]));

  const apiKey = process.env["LLM_API_KEY"] ?? process.env["OPENROUTER_API_KEY"];
  const baseUrl = process.env["LLM_BASE_URL"];
  const model = process.env["MODEL_KOPPLING"] ?? "";
  if (!apiKey || !model) throw new Error("LLM_API_KEY och MODEL_KOPPLING krävs");
  const llm = new OpenRouterClient({ apiKey, ...(baseUrl ? { baseUrl } : {}) });
  const systemPrompt = readFileSync(resolve(import.meta.dirname, "../prompts/koppling.md"), "utf8");

  const loftenMap = new Map(promises.map((p) => [p.id, p]));
  const handlingMap = new Map(handlingar.map((h) => [h.id, h]));

  const resultat: Array<Record<string, unknown>> = [];
  let overens = 0;

  for (const post of urval) {
    const lofte = loftenMap.get(post.lofte);
    const handling = handlingMap.get(post.handling);
    if (!lofte || !handling) {
      console.error(`${post.lofte}/${post.handling}: löfte eller handling saknas, hoppar`);
      resultat.push({ ...post, ny_utfall: "fel", ny_fel: "löfte eller handling saknas i aktuell data" });
      continue;
    }
    const betankande = handling.kind === "votering" ? betIndex.get(handling.dok_id) : undefined;
    try {
      const kalltext = await fetchDokumentText(politeFetch, betankande?.dok_id ?? handling.dok_id);
      const { forslag, grindfel } = await skapaForslag(llm, systemPrompt, model, lofte, handling, kalltext, LAGE_A_FONSTER, betankande);
      const nyttUtfall = forslag && grindfel.length === 0 ? "forslag" : forslag ? "falld_av_grind" : "ingen_koppling";
      const bedomdSomLika =
        (post.deepseek_utfall === "forslag" && nyttUtfall === "forslag") ||
        (post.deepseek_utfall === "ingen_koppling" && nyttUtfall !== "forslag");
      if (bedomdSomLika) overens += 1;
      resultat.push({
        ...post,
        ny_modell: model,
        ny_utfall: nyttUtfall,
        ny_riktning: forslag?.riktning,
        ny_citat: forslag?.bevis.citat,
        ny_confidence: forslag?.confidence,
        ny_grindfel: grindfel.length > 0 ? grindfel.map((g) => `${g.grind}: ${g.reason}`) : undefined,
        overens_med_deepseek: bedomdSomLika,
      });
      console.log(
        `${post.lofte} <-> ${post.handling}: deepseek=${post.deepseek_utfall} ny(${model})=${nyttUtfall} ${bedomdSomLika ? "OVERENS" : "OLIKA"}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${post.lofte}/${post.handling}: fel — ${msg}`);
      resultat.push({ ...post, ny_utfall: "fel", ny_fel: msg });
    }
  }

  writeFileSync(
    utPath,
    JSON.stringify(
      {
        skapad: new Date().toISOString(),
        modell: model,
        antal_par: urval.length,
        overensstammelse: `${overens}/${urval.length}`,
        resultat,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\nÖverensstämmelse: ${overens}/${urval.length} — skrivet till ${utPath}`);
}

main();
