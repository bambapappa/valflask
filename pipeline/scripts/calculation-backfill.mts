/**
 * Bakåtfyllnad av `cost.calculation` för äldre LLM-estimat (full spårbarhet).
 *
 * Äldre löften saknar den stegvisa uträkningen — den infördes framåtriktat. Här
 * körs varje sådant löfte genom SAMMA estimator (A5 + grannkontroll) på nytt, och
 * resultatet triageras ärligt:
 *   • Nytt belopp NÄRA det publicerade  → fäst den nya (rekonstruerade) uträkningen,
 *     BEHÅLL det publicerade beloppet (ingen tyst ändring, ingen rättelse).
 *   • Nytt belopp AVVIKER kraftigt        → rör inte löftet; lägg i granskningskön
 *     (data/calculation_review.json) för mänskligt beslut.
 *
 * Uträkningen märks öppet som rekonstruerad i efterhand — originalresonemanget
 * sparades aldrig, så vi utger den inte för att vara det.
 *
 * Idempotent (hoppar löften som redan har calculation) och därmed återupptagbart.
 *
 *   pnpm calc:backfill --sample=10 --dry-run     # kalibrering, skriver inget
 *   pnpm calc:backfill --all                      # skarp körning
 *   Flaggor: --sample=N | --all, --dry-run, --seed=N, --factor=1.5, --stub
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { estimateCost, type CostEstimate } from "../src/cost.ts";
import {
  findComparableCosts,
  type ComparablePromiseLite,
} from "../src/similarity.ts";
import { computeDataHash } from "../src/publish.ts";
import { OpenRouterClient, type LlmClient } from "../src/llm.ts";

const DATA = resolve(import.meta.dirname, "../../data");

interface Cost extends CostEstimate {}
interface PromiseEntry {
  id: string;
  title: string;
  parties: string[];
  person: unknown;
  quote: string;
  category: string;
  status: string;
  cost: Cost;
  financing_claimed?: { msek?: number | null };
  [k: string]: unknown;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? "" : hit.slice(eq + 1);
}
const DRY = arg("dry-run") !== undefined;
const ALL = arg("all") !== undefined;
const STUB = arg("stub") !== undefined;
const SAMPLE = Number(arg("sample") ?? (ALL ? "0" : "10"));
const SEED = Number(arg("seed") ?? "1");
const FACTOR = Number(arg("factor") ?? "1.5");
/** Antal varv: löften som föll bort får en ny chans (transient API-bortfall). */
const ROUNDS = Math.max(1, Number(arg("rounds") ?? "3"));

/** Deterministisk PRNG (mulberry32) så slumpurvalet går att återskapa via --seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sample<T>(arr: T[], n: number, seed: number): T[] {
  if (n <= 0 || n >= arr.length) return [...arr];
  const r = rng(seed);
  const idx = arr.map((_, i) => i).sort(() => r() - 0.5).slice(0, n).sort((x, y) => x - y);
  return idx.map((i) => arr[i]!);
}

export interface Triage {
  near: boolean;
  factor: number | null;
  reason: string;
}
/** Avgör om ett färskt estimat ligger nära det publicerade beloppet. */
export function triage(oldCost: Cost, newBase: number, factorThreshold = FACTOR): Triage {
  const oldBase = oldCost.msek_base;
  if (oldBase === 0 && newBase === 0) return { near: true, factor: 1, reason: "båda 0" };
  if (oldBase === 0 || newBase === 0)
    return { near: false, factor: null, reason: `0-skifte (publicerat ${oldBase}, nytt ${newBase})` };
  const inSpan = newBase >= oldCost.msek_low && newBase <= oldCost.msek_high;
  const factor = newBase >= oldBase ? newBase / oldBase : oldBase / newBase;
  if (inSpan) return { near: true, factor, reason: "inom publicerat spann" };
  if (factor <= factorThreshold) return { near: true, factor, reason: `faktor ${factor.toFixed(2)}` };
  return { near: false, factor, reason: `avviker ${factor.toFixed(1)}×` };
}

/** Märker uträkningen öppet som rekonstruerad i efterhand. */
export function markReconstructed(calc: string): string {
  return `Rekonstruerad i efterhand (originalresonemanget sparades inte): ${calc}`.slice(0, 800);
}

function buildLlm(): { llm: LlmClient; model: string } {
  if (STUB) {
    // Deterministisk stubb för lokal logiktest utan nyckel: föreslår ett belopp
    // nära (±) det som redan står i prompten via en fast transform på titeln.
    const llm: LlmClient = {
      complete: async (prompt: string) => {
        const m = prompt.match(/"title":"([^"]+)"/);
        const seedStr = m?.[1] ?? prompt;
        let h = 0; for (const c of seedStr) h = (h * 31 + c.charCodeAt(0)) | 0;
        const base = 100 + (Math.abs(h) % 20000);
        return JSON.stringify({
          type: "utgift", period: "per_ar",
          msek_low: Math.round(base * 0.5), msek_base: base, msek_high: Math.round(base * 1.8),
          confidence: 0.4, method_note: "stubb",
          calculation: `Stubbad uträkning för test: antag ~${base} mkr utifrån jämförbara.`,
        });
      },
    };
    return { llm, model: "stub-model" };
  }
  const apiKey = process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL;
  const model = process.env.MODEL_EXTRACT;
  if (!apiKey) throw new Error("Saknar LLM_API_KEY (eller OPENROUTER_API_KEY) (kör med --stub för lokal logiktest).");
  if (!model) throw new Error("Saknar MODEL_EXTRACT.");
  const fbUrl = process.env.LLM_FALLBACK_BASE_URL;
  const fbKey = process.env.LLM_FALLBACK_API_KEY;
  const llm =
    fbUrl && fbKey
      ? new OpenRouterClient({ apiKey, ...(baseUrl ? { baseUrl } : {}), fallbackBaseUrl: fbUrl, fallbackApiKey: fbKey })
      : new OpenRouterClient({ apiKey, ...(baseUrl ? { baseUrl } : {}) });
  return { llm, model };
}

async function main(): Promise<void> {
  const promises = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as PromiseEntry[];
  const pool: ComparablePromiseLite[] = promises.map((p) => ({
    id: p.id, title: p.title, parties: p.parties, category: p.category,
    group_id: (p.group_id as string | null) ?? null,
    msek_base: p.cost.msek_base, period: p.cost.period, basis: p.cost.basis, status: p.status,
  }));

  const targets = promises.filter(
    (p) => p.status !== "tillbakadragen" && p.cost.basis === "llm_estimat" && !p.cost.calculation,
  );
  const selected = ALL ? targets : sample(targets, SAMPLE, SEED);

  console.log(
    `Backfill uträkning — mål: ${targets.length} löften utan calculation. ` +
      `Kör: ${selected.length} (${ALL ? "alla" : `slump N=${SAMPLE}, seed=${SEED}`})` +
      `${DRY ? "  [DRY-RUN]" : ""}${STUB ? "  [STUB]" : ""}\n`,
  );

  const { llm, model } = buildLlm();
  let near = 0, diverge = 0, skip = 0;
  const divergences: Array<Record<string, unknown>> = [];
  const skipReasons = new Map<string, number>();

  /**
   * Ett löfte: returnerar true om det behandlades (uträkning fäst eller lagd
   * till granskning), false om det hoppades.
   *
   * Skip-orsaken YTAS. I körning 30028792947 föll 243 av 357 löften bort och
   * loggades alla som "modellen gav ingen uträkning" — men det var API:et som
   * var otillgängligt i början och slutet av körningen (misslyckade anrop tog
   * ~5 s mot ~28 s för riktiga svar). estimateCost sväljer anropsfel och
   * returnerar ett tomt estimat, så felet syntes aldrig. method_note bär
   * orsaken ("LLM-kostnadsanrop misslyckades", "ogiltig JSON", …) och skrivs
   * nu ut, så nästa bortfall går att diagnostisera direkt ur loggen.
   */
  async function process(p: PromiseEntry): Promise<boolean> {
    const comparables = findComparableCosts(
      { title: p.title, category: p.category },
      pool,
    ).filter((c) => c.id !== p.id);

    let est: CostEstimate;
    try {
      est = await estimateCost(
        { title: p.title, parties: p.parties, person: p.person, quote: p.quote,
          category: p.category, amount_in_text_msek: null, financing_mentioned: false } as never,
        llm, model, comparables,
      );
    } catch (e) {
      const why = `estimatfel: ${e instanceof Error ? e.message : e}`;
      console.log(`SKIP ${p.id} — ${why}`);
      skipReasons.set(why, (skipReasons.get(why) ?? 0) + 1);
      return false;
    }

    if (!est.calculation) {
      // method_note skiljer misslyckat anrop från ett svar utan uträkning.
      const why = est.method_note || "modellen gav ingen uträkning";
      console.log(`SKIP ${p.id} — ingen uträkning (${why})`);
      skipReasons.set(why, (skipReasons.get(why) ?? 0) + 1);
      return false;
    }

    const t = triage(p.cost, est.msek_base);
    const tag = t.near ? "NÄRA   " : "AVVIKER";
    console.log(
      `${tag} ${p.id} [${p.parties.join(",")}] publicerat ${p.cost.msek_base} → nytt ${est.msek_base}  (${t.reason})`,
    );
    if (DRY) console.log(`         ${est.calculation}`);

    if (t.near) {
      near++;
      if (!DRY) p.cost.calculation = markReconstructed(est.calculation);
    } else {
      diverge++;
      divergences.push({
        id: p.id, parties: p.parties, title: p.title,
        published: { low: p.cost.msek_low, base: p.cost.msek_base, high: p.cost.msek_high },
        reestimated: { base: est.msek_base, low: est.msek_low, high: est.msek_high },
        factor: t.factor, calculation: est.calculation,
      });
    }
    return true;
  }

  let pending = selected;
  // Bortfallet är tidsklustrat (API otillgängligt i perioder), inte knutet till
  // enskilda löften — därför är ett nytt varv över just de som föll bort värt
  // mycket mer än att ge upp. Varvet avbryts när det inte längre räddar något.
  for (let round = 1; round <= ROUNDS && pending.length > 0; round++) {
    if (round > 1) {
      console.log(`\n— Omtag ${round - 1}: ${pending.length} löften som föll bort, ny chans —\n`);
      skipReasons.clear();
    }
    const failed: PromiseEntry[] = [];
    for (const p of pending) if (!(await process(p))) failed.push(p);
    if (failed.length === pending.length && round > 1) {
      console.log(`\nOmtaget räddade inget — avbryter (API troligen fortsatt otillgängligt).`);
      pending = failed;
      break;
    }
    pending = failed;
  }
  skip = pending.length;

  console.log(`\nSummering: ${near} nära (uträkning fästs), ${diverge} avviker (till granskning), ${skip} hoppade.`);
  if (skipReasons.size > 0) {
    console.log("Skip-orsaker (sista varvet):");
    for (const [why, n] of [...skipReasons.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${why.slice(0, 120)}`);
    }
  }

  if (DRY) { console.log("\n[DRY-RUN] Inget skrivet."); return; }

  writeFileSync(join(DATA, "promises.json"), JSON.stringify(promises, null, 2) + "\n");
  writeFileSync(join(DATA, "calculation_review.json"), JSON.stringify(divergences, null, 2) + "\n");

  if (near > 0) {
    const changelog = JSON.parse(readFileSync(join(DATA, "changelog.json"), "utf8")) as unknown[];
    changelog.push({
      run_id: `calc-backfill-${new Date().toISOString().slice(0, 10)}`,
      added: [], updated: selected.filter((p) => p.cost.calculation && p.cost.calculation.startsWith("Rekonstruerad")).map((p) => p.id),
      retracted: [], data_hash: computeDataHash(promises), timestamp: new Date().toISOString(),
    });
    writeFileSync(join(DATA, "changelog.json"), JSON.stringify(changelog, null, 2) + "\n");

    // EN samlad rättelse-post för hela kvalitetshöjningen — inte en per löfte.
    // Den nära-grenen ändrar inga belopp (bara tillagd uträkning), så det är en
    // förbättring av rutinen, inte enskilda felrättningar. Idempotent via sentinel.
    const rPath = join(DATA, "rattelser.json");
    const SENTINEL = "systematisk kvalitetshöjning";
    const rattelser = JSON.parse(readFileSync(rPath, "utf8")) as Array<{ date: string; affects: string; what: string; why: string }>;
    if (!rattelser.some((r) => r.affects.includes(SENTINEL))) {
      rattelser.unshift({
        date: new Date().toISOString().slice(0, 10),
        affects: "Kostnadsuppskattningar som bygger på beräkning (systematisk kvalitetshöjning)",
        what:
          "Sättet vi uppskattar kostnader på har förbättrats. Nya uppskattningar jämförs nu med liknande, redan publicerade löften så att samma politik hamnar i samma storleksordning, och varje uppskattning får en stegvis, öppet redovisad uträkning. För äldre uppskattningar har uträkningen räknats om i efterhand och lagts till där den nya beräkningen bekräftar det tidigare beloppet. Där beräkningen pekade på ett annat belopp ändrades ingenting automatiskt — de löftena ses över för hand. Uträkningar som lagts till i efterhand är märkta som rekonstruerade.",
        why:
          "Tidigare sparades aldrig uträkningen bakom en uppskattning, och uppskattningar för snarlik politik kunde skilja sig åt utan skäl. Nu finns både spårbarhet och konsekvens. Denna post samlar hela kvalitetshöjningen i en enda rättelse i stället för en per löfte — det är en förbättring av rutinen, inte en enskild felrättning.",
      });
      writeFileSync(rPath, JSON.stringify(rattelser, null, 1) + "\n");
    }
  }
  console.log(`\nSkrivet: ${near} uträkningar → promises.json; ${diverge} → calculation_review.json.`);
}

const isCli = process.argv[1]?.endsWith("calculation-backfill.mts");
if (isCli) main().catch((e: unknown) => { console.error(e); process.exit(1); });
