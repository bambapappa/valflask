/**
 * Kör om kostnadssteget för de kö-poster där det havererat.
 *
 * När modellsvaret inte gick att använda skriver `estimateCost` en `failedCost`:
 * belopp 0, tom uträkning, och en metodnot som säger att beloppet måste sättas
 * för hand. **Nollan är problemet.** I datat går den inte att skilja från ett
 * omdöme — kostnadsreglerna nollar lagar, förbud och utredningslöften med
 * flit — och en post som blivit 0 av ett tekniskt haveri ser därför färdig ut.
 *
 * Genomgången av löfteskön 2026-08-16 fann nitton sådana poster av 79, och
 * fyra av dem var skatte- och fortbildningslöften som säkert kostar pengar.
 * Den vanligaste orsaken var att modellen svarade med rätt tal i fel form
 * (`"1 200"` i stället för `1200`); den är lagad i `finiteNum`. Skriptet finns
 * för resten: poster som redan ligger i kön med en nolla de inte förtjänat.
 *
 * Skriptet ändrar ALDRIG en post som har en uträkning. Det rör bara dem vars
 * kostnadssteg föll, och det publicerar ingenting — resultatet hamnar i kön,
 * där en människa fattar beslutet som förut.
 *
 *   pnpm kostnad:om                 # torrkörning, skriver inget
 *   pnpm kostnad:om --skriv         # skarp körning
 *   pnpm kostnad:om --lista         # visa bara vilka poster som är fallna
 *   Flaggor: --stub (ingen modell, för prov), --max=N
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { estimateCost, type CostEstimate } from "../src/cost.ts";
import { OpenRouterClient, type LlmClient } from "../src/llm.ts";
import { byggLed } from "../src/cli-run.ts";

const DATA = resolve(import.meta.dirname, "../../data");

function flagga(namn: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${namn}` || a.startsWith(`--${namn}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? "" : hit.slice(eq + 1);
}
const SKRIV = flagga("skriv") !== undefined;
const LISTA = flagga("lista") !== undefined;
const STUB = flagga("stub") !== undefined;
const MAX = Number(flagga("max") ?? "0");

interface KoPost {
  articleUrl?: string;
  articleTitle?: string;
  candidate: Record<string, unknown> | null;
  cost?: CostEstimate | null;
  costReason?: string;
  [k: string]: unknown;
}

/**
 * Föll kostnadssteget för den här posten?
 *
 * Mätt på DATAT, inte på metodnotens formulering. Noten har skrivits om en
 * gång förut (2026-08-14, när haveritexten läckte ut till läsaren), och en
 * kontroll som läser prosa slutar gälla nästa gång någon förbättrar en mening.
 * Det som är sant om varje fallen post är att den saknar uträkning: ett
 * llm-estimat utan steg bakom sig är inte ett belopp, det är ett uteblivet
 * svar. Godkännandevägen stoppar redan på samma villkor.
 */
export function kostnadenFoll(post: KoPost): boolean {
  const c = post.cost;
  if (!c) return true; // ingen kostnadspost alls
  if (c.basis !== "llm_estimat") return false;
  return ((c.calculation ?? "").trim()) === "";
}

function byggLlm(): { llm: LlmClient; model: string } {
  if (STUB) {
    const llm: LlmClient = {
      complete: async (prompt: string) => {
        const m = prompt.match(/"title":"([^"]+)"/);
        const seed = m?.[1] ?? prompt;
        let h = 0;
        for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
        const base = 50 + (Math.abs(h) % 500);
        return JSON.stringify({
          type: "utgift",
          period: "per_ar",
          msek_low: String(Math.round(base * 0.5)),
          msek_base: String(base),
          msek_high: String(Math.round(base * 1.8)),
          confidence: 0.4,
          method_note: "stubb",
          calculation: `Stubbad uträkning: antag ~${base} mkr utifrån jämförbara.`,
        });
      },
    } as unknown as LlmClient;
    return { llm, model: "stub-model" };
  }
  const model = process.env.MODEL_EXTRACT;
  if (!model) throw new Error("Saknar MODEL_EXTRACT (och --stub är inte satt).");
  return { llm: new OpenRouterClient({ led: byggLed(process.env, { extract: model }) }), model };
}

async function main(): Promise<void> {
  const fil = resolve(DATA, "needs_review.json");
  const poster = JSON.parse(readFileSync(fil, "utf8")) as KoPost[];
  const fallna = poster
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => kostnadenFoll(p));

  console.log(`${poster.length} poster i kön · ${fallna.length} där kostnadssteget föll.`);
  if (fallna.length === 0) return;

  for (const { p, i } of fallna) {
    const t = (p.candidate as { title?: string } | null)?.title ?? p.articleTitle ?? "?";
    const skal = p.cost ? "tom uträkning" : "ingen kostnadspost alls";
    console.log(`  [${String(i).padStart(2)}] ${t.slice(0, 70)}  (${skal})`);
  }
  if (LISTA) return;

  const { llm, model } = byggLlm();
  const urval = MAX > 0 ? fallna.slice(0, MAX) : fallna;
  let lagade = 0;
  let kvar = 0;

  for (const { p, i } of urval) {
    const cand = p.candidate as Parameters<typeof estimateCost>[0] | null;
    if (!cand) { kvar++; continue; }
    const ny = await estimateCost(cand, llm, model, []);
    if (kostnadenFoll({ candidate: p.candidate, cost: ny })) {
      kvar++;
      console.log(`  [${i}] föll igen — lämnas orörd`);
      continue;
    }
    lagade++;
    console.log(`  [${i}] ${ny.msek_low}–${ny.msek_base}–${ny.msek_high} mkr (${ny.period})`);
    if (SKRIV) {
      p.cost = ny;
      p.costReason = `LLM-estimat (confidence ${ny.confidence}) — omkörd efter haveri, bekräfta/justera belopp`;
      // Skriv EFTER VARJE post, inte på slutet. Skrivningen låg förut efter
      // hela loopen, och då är en lång körning allt-eller-inget: körning
      // 31949952846 malde i nästan två timmar mot jobbets tak utan att en enda
      // post hade kunnat räddas om den slagit i det. Samma lärdom som
      // foreslag.yml redan bär, där varje klart löfte pushas direkt.
      // Filen är liten och skrivningen kostar millisekunder mot ett
      // modellanrop som kostar minuter.
      writeFileSync(fil, `${JSON.stringify(poster, null, 2)}\n`, "utf8");
    }
  }

  console.log(`\n${lagade} fick ett belopp med uträkning · ${kvar} föll igen.`);
  if (!SKRIV) {
    console.log("torrkörning — lägg till --skriv för att verkställa.");
    return;
  }
  console.log(`skrivet löpande: ${fil}`);
}

await main();
