/**
 * Rekonstruerar kostnadsförslag för separat granskning. Ändrar aldrig publicerade
 * löften, rättelser eller changelog. Närhet till befintligt belopp prioriterar
 * granskningen; den innebär inget sakligt eller mänskligt godkännande.
 * pnpm calc:backfill --sample=10 --dry-run; pnpm calc:backfill --all
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { estimateCost, type CostEstimate } from "../src/cost.ts";
import {
  findComparableCosts,
  type ComparablePromiseLite,
} from "../src/similarity.ts";
import { kalkylPosthash, lasKalkylko, sparaKalkylko } from "../src/kalkylko.ts";
import { OpenRouterClient, type LlmClient } from "../src/llm.ts";
import { byggLed } from "../src/cli-run.ts";

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
/**
 * Tidsbudget i minuter. Körning 30191490153 slog i GitHubs 6-timmarstak och
 * DÖDADES — uppladdningsstegen hann aldrig köra, så flera timmars LLM-arbete
 * gick förlorat. Skriptet slutar nu ta nya löften när budgeten är slut och
 * skriver ut det som hunnits. Eftersom det är idempotent betar upprepade
 * körningar av resten. Default 240 min ger gott om marginal till taket.
 */
const MAX_MINUTES = Math.max(1, Number(arg("max-minutes") ?? "240"));
const DEADLINE = Date.now() + MAX_MINUTES * 60_000;

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
  const model = process.env.MODEL_EXTRACT;
  if (!model) throw new Error("Saknar MODEL_EXTRACT.");
  // Samma kedja som pipelinen: primär → sekundär → extra, allt ur variabler.
  // Backfillen anropar bara extract-rollen, så bara den efterfrågas — ett led
  // som saknar MODEL_EXTRACT för sitt suffix hoppas över.
  const llm = new OpenRouterClient({ led: byggLed(process.env, { extract: model }) });
  return { llm, model };
}

async function main(): Promise<void> {
  const promises = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as PromiseEntry[];
  const pool: ComparablePromiseLite[] = promises.map((p) => ({
    id: p.id, title: p.title, parties: p.parties, category: p.category,
    group_id: (p.group_id as string | null) ?? null,
    msek_base: p.cost.msek_base, period: p.cost.period, basis: p.cost.basis, status: p.status,
  }));

  const { llm, model } = buildLlm();
  const befintligaForslag = lasKalkylko(DATA);
  const targets = promises.filter(
    (p) => p.status !== "tillbakadragen" && p.cost.basis === "llm_estimat" && !p.cost.calculation && !befintligaForslag.some((f) => f.version === "calculation-proposal/1" && f.model === model && f.fore_hash === kalkylPosthash(p)),
  );
  const selected = ALL ? targets : sample(targets, SAMPLE, SEED);

  console.log(
    `Backfill uträkning — mål: ${targets.length} löften utan calculation. ` +
      `Kör: ${selected.length} (${ALL ? "alla" : `slump N=${SAMPLE}, seed=${SEED}`})` +
      `${DRY ? "  [DRY-RUN]" : ""}${STUB ? "  [STUB]" : ""}\n`,
  );

  let near = 0, diverge = 0, skip = 0;
  const divergences: Array<Record<string, unknown>> = [];
  const skipReasons = new Map<string, number>();

  /**
   * Ett löfte: returnerar true om det behandlades (förslag sparat för granskning), false om det hoppades.
   *
   * Skip-orsaken YTAS. I körning 30028792947 föll 243 av 357 löften bort och
   * loggades alla som "modellen gav ingen uträkning" — men det var API:et som
   * var otillgängligt i början och slutet av körningen (misslyckade anrop tog
   * ~5 s mot ~28 s för riktiga svar). estimateCost sväljer anropsfel och
   * returnerar ett tomt estimat, så felet syntes aldrig. method_note bär
   * orsaken ("LLM-kostnadsanrop misslyckades", "ogiltig JSON", …) och skrivs
   * nu ut, så nästa bortfall går att diagnostisera direkt ur loggen.
   */
  async function handleOne(p: PromiseEntry): Promise<boolean> {
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

    if (t.near) near++; else diverge++;
    divergences.push({
      version: "calculation-proposal/1", status: "needs_review",
      id: p.id, model, fore_hash: kalkylPosthash(p),
      published: structuredClone(p), reestimated: structuredClone(est),
      near: t.near, factor: t.factor, reason: t.reason,
    });
    return true;
  }

  // Checkpointing: skriv löpande så inget arbete går förlorat om körningen
  // dödas (6-timmarstaket, nätfel, OOM). save() är en no-op i dry-run.
  if (!DRY) save = (() => sparaKalkylko(DATA, divergences));

  // Runnern skickar SIGTERM innan den dödar jobbet — sista chansen att spara.
  let saving = false;
  const saveAndExit = (sig: string) => {
    if (saving) return;
    saving = true;
    console.log(`\n${sig} mottagen — sparar ${near} nära och ${diverge} avvikande förslag innan avslut.`);
    try { save(); } catch (e) { console.error("Kunde inte spara vid avbrott:", e); }
    process.exit(0);
  };
  process.on("SIGTERM", () => saveAndExit("SIGTERM"));
  process.on("SIGINT", () => saveAndExit("SIGINT"));

  let pending = selected;
  let outOfTime = false;
  let notAttempted = 0;
  let sinceSave = 0;
  // Bortfallet är tidsklustrat (API otillgängligt i perioder), inte knutet till
  // enskilda löften — därför är ett nytt varv över just de som föll bort värt
  // mycket mer än att ge upp. Varvet avbryts när det inte längre räddar något.
  for (let round = 1; round <= ROUNDS && pending.length > 0 && !outOfTime; round++) {
    if (round > 1) {
      console.log(`\n— Omtag ${round - 1}: ${pending.length} löften som föll bort, ny chans —\n`);
      skipReasons.clear();
    }
    const failed: PromiseEntry[] = [];
    for (const [i, p] of pending.entries()) {
      if (Date.now() > DEADLINE) {
        // Sluta ta NYA löften — men låt körningen skriva ut det som hunnits,
        // annars kastas allt arbete bort när runnern dödas vid takgränsen.
        notAttempted = pending.length - i;
        console.log(
          `\nTidsbudget slut (${MAX_MINUTES} min). ${notAttempted} löften ej försökta — ` +
            `sparar det som hunnits och avslutar snyggt. Kör igen för resten (idempotent).`,
        );
        outOfTime = true;
        break;
      }
      if (!(await handleOne(p))) failed.push(p);
      // Checkpoint var 10:e löfte: billigt mot ~28 s per LLM-anrop, och gör att
      // ett hårt avbrott aldrig kostar mer än en handfull löften.
      if (!DRY && ++sinceSave >= 10) {
        sinceSave = 0;
        save();
        console.log(`   [checkpoint sparad — ${near} nära och ${diverge} avvikande förslag]`);
      }
    }
    if (!outOfTime && failed.length === pending.length && round > 1) {
      console.log(`\nOmtaget räddade inget — avbryter (API troligen fortsatt otillgängligt).`);
      pending = failed;
      break;
    }
    pending = failed;
  }
  skip = pending.length + notAttempted;

  console.log(`\nSummering: ${near} nära och ${diverge} avvikande — samtliga till granskning, ${skip} hoppade.`);
  if (skipReasons.size > 0) {
    console.log("Skip-orsaker (sista varvet):");
    for (const [why, n] of [...skipReasons.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${why.slice(0, 120)}`);
    }
  }

  if (DRY) { console.log("\n[DRY-RUN] Inget skrivet."); return; }

  save();
  console.log(`\nSkrivet: ${near + diverge} förslag → calculation_review.json. Publicerade data är oförändrade.`);
}

/**
 * Skriver ALLT arbete som gjorts hittills till disk. Anropas löpande under
 * körningen (checkpoint) och vid avbrottssignal — inte bara på slutet.
 *
 * Bakgrund: körning 30191490153 slog i GitHubs 6-timmarstak och dödades. Allt
 * skrevs först efter loopen, så flera timmars LLM-arbete försvann. Nu ligger
 * förslag på disk efter varje checkpoint. En ny körning hoppar poster där
 * samma modell redan har lämnat ett förslag för exakt samma publicerade post.
 *
 * Sätts av main() innan loopen startar.
 */
let save: () => void = () => {};

const isCli = process.argv[1]?.endsWith("calculation-backfill.mts");
if (isCli) main().catch((e: unknown) => { console.error(e); process.exit(1); });
