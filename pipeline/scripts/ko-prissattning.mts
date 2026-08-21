/**
 * Prissätter kö-poster som aldrig fick någon kostnad.
 *
 * VARFÖR DE SAKNAR EN. Pipelinen prissätter inte en kandidat som den redan
 * bestämt sig för att skicka till granskning: `dublettpost()` i `index.ts`
 * bygger kö-posten utan `cost`, och detsamma gäller kandidater som faller på en
 * grind eller på verifieringen. Kostnadssteget ligger efter den vägvalet.
 * Följden är en hög som ser omätt ut men aldrig ens blivit tillfrågad: 2026-08-21
 * bar 184 av 684 kö-poster ingen kostnad alls.
 *
 * VAD DEN GÖR. Kör samma estimator som pipelinen (A5 + grannkontroll) och
 * skriver resultatet PÅ KÖ-POSTEN. Ingenting publiceras, ingenting rörs i
 * promises.json. En människa godkänner fortfarande varje löfte.
 *
 * GRINDEN. Ett estimat fästs bara om `provaUtrakningen` — samma kontroll som
 * kösvepet och godkännandegrinden använder — inte har någon invändning. Det är
 * poängen med att låta modellen räkna men inte bestämma: en uträkning som inte
 * landar på sitt eget tal, eller som går förbi en siffra som står i citatet,
 * blir en anmärkning i rapporten i stället för ett belopp i kön. Regel 14 —
 * partiets egen siffra gäller — kan modellen inte förhandla bort.
 *
 *   pnpm ko:prissatt -- --sample=10 --dry-run   # kalibrering, skriver inget
 *   pnpm ko:prissatt -- --all                    # skarp körning
 *   Flaggor: --sample=N | --all, --dry-run, --seed=N, --rounds=N,
 *            --max-minutes=N, --stub
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { estimateCost, type CostEstimate } from "../src/cost.ts";
import { findComparableCosts, type ComparablePromiseLite } from "../src/similarity.ts";
import { provaUtrakningen, type Invandning, type UtrakningsLofte } from "../src/utrakningen.ts";
import { internaBeteckningar } from "../src/publicerad-text.ts";
import { OpenRouterClient, type LlmClient } from "../src/llm.ts";
import { byggLed } from "../src/cli-run.ts";
import { taLaset } from "../src/datalas.ts";

const DATA = resolve(import.meta.dirname, "../../data");
/** Samma tak som schemat och godkännandegrinden. */
const MAX_CALCULATION = 800;

interface KoPost {
  candidate: {
    title: string; parties: string[]; person: unknown; quote: string;
    category: string; amount_in_text_msek: number | null; financing_mentioned?: boolean;
  };
  articleUrl?: string;
  articleTitle?: string;
  cost?: Record<string, unknown>;
  costReason?: string;
  [k: string]: unknown;
}

function arg(namn: string): string | undefined {
  const träff = process.argv.find((a) => a === `--${namn}` || a.startsWith(`--${namn}=`));
  if (!träff) return undefined;
  const eq = träff.indexOf("=");
  return eq === -1 ? "" : träff.slice(eq + 1);
}
const DRY = arg("dry-run") !== undefined;
const ALLA = arg("all") !== undefined;
const STUB = arg("stub") !== undefined;
const URVAL = Number(arg("sample") ?? (ALLA ? "0" : "10"));
const FRO = Number(arg("seed") ?? "1");
const VARV = Math.max(1, Number(arg("rounds") ?? "3"));
const MAX_MINUTER = Math.max(1, Number(arg("max-minutes") ?? "240"));
const DEADLINE = Date.now() + MAX_MINUTER * 60_000;

/** Deterministisk PRNG (mulberry32) så urvalet går att återskapa via --seed. */
function rng(fro: number): () => number {
  let a = fro >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function urval<T>(arr: T[], n: number, fro: number): T[] {
  if (n <= 0 || n >= arr.length) return [...arr];
  const r = rng(fro);
  return arr.map((_, i) => i).sort(() => r() - 0.5).slice(0, n).sort((x, y) => x - y).map((i) => arr[i]!);
}

/**
 * Prövar estimatet som om det redan låg på ett löfte. Samma kontroll som
 * kösvepet, så att ett belopp som fästs i kön håller den mätsticka posten
 * ändå möts av vid godkännandet.
 */
export function provaEstimatet(post: KoPost, est: CostEstimate): Invandning[] {
  const lofte: UtrakningsLofte = {
    id: "(kö-post)",
    title: post.candidate.title,
    quote: post.candidate.quote,
    parties: post.candidate.parties,
    status: "aktiv",
    cost: {
      msek_base: est.msek_base, msek_low: est.msek_low, msek_high: est.msek_high,
      period: est.period, basis: est.basis, type: est.type,
      calculation: est.calculation, method_note: est.method_note,
    },
  } as UtrakningsLofte;
  const ut = provaUtrakningen(lofte);
  // Två krav som inte hör till uträkningens logik men som gäller vid
  // publiceringen, och som därför måste gälla redan här — annars fastnar posten
  // först när en människa försöker godkänna den.
  if ((est.calculation ?? "").length > MAX_CALCULATION) {
    ut.push({
      kontroll: "utrakningen_for_lang", roll: "journalisten",
      invandning: "Uträkningen visas på löftessidan och schemat vägrar längre text.",
      matt: `${(est.calculation ?? "").length} tecken; taket är ${MAX_CALCULATION}.`,
    });
  }
  const interna = internaBeteckningar({ calculation: est.calculation ?? null, method_note: est.method_note });
  if (interna.length > 0) {
    ut.push({
      kontroll: "intern_beteckning", roll: "journalisten",
      invandning: "Texten möter läsaren och bär en intern beteckning.",
      matt: interna.join("; "),
    });
  }
  return ut;
}

function byggLlm(): { llm: LlmClient; model: string } {
  if (STUB) {
    // Deterministisk stubb för lokal logiktest utan nyckel.
    const llm: LlmClient = {
      complete: async (prompt: string) => {
        const m = prompt.match(/"title":"([^"]+)"/);
        let h = 0; for (const c of m?.[1] ?? prompt) h = (h * 31 + c.charCodeAt(0)) | 0;
        const bas = 100 + (Math.abs(h) % 5000);
        return JSON.stringify({
          type: "utgift", period: "per_ar",
          msek_low: Math.round(bas * 0.5), msek_base: bas, msek_high: Math.round(bas * 1.8),
          confidence: 0.4, method_note: "stubb",
          calculation: `Stubbad uträkning: antag ~${bas} mkr per år utifrån jämförbara löften.`,
        });
      },
    };
    return { llm, model: "stub-model" };
  }
  const model = process.env.MODEL_EXTRACT;
  if (!model) throw new Error("Saknar MODEL_EXTRACT.");
  return { llm: new OpenRouterClient({ led: byggLed(process.env, { extract: model }) }), model };
}

async function main(): Promise<void> {
  // Sviten återställer data/ ur en säkerhetskopia. En kostnad skriven under
  // tiden försvinner spårlöst — samma skäl som review och arkivbackfillen tar
  // låset. Körningen är lång, så låset tas före första läsningen.
  const slappLas = DRY ? () => {} : taLaset(DATA, "ko:prissatt");
  try {
    await kor();
  } finally {
    slappLas();
  }
}

let spara: () => void = () => {};

async function kor(): Promise<void> {
  const poster = JSON.parse(readFileSync(join(DATA, "needs_review.json"), "utf8")) as KoPost[];
  const promises = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Array<Record<string, any>>;
  const pool: ComparablePromiseLite[] = promises
    .filter((p) => p.status !== "tillbakadragen")
    .map((p) => ({
      id: p.id, title: p.title, parties: p.parties, category: p.category,
      group_id: p.group_id ?? null, msek_base: p.cost.msek_base,
      period: p.cost.period, basis: p.cost.basis, status: p.status,
    }));

  const mal = poster.filter((p) => !p.cost && p.candidate?.quote);
  const valda = ALLA ? mal : urval(mal, URVAL, FRO);
  console.log(
    `Kö-prissättning — mål: ${mal.length} poster utan kostnad av ${poster.length} i kön. ` +
      `Kör: ${valda.length} (${ALLA ? "alla" : `slump N=${URVAL}, frö=${FRO}`})` +
      `${DRY ? "  [TORRKÖRNING]" : ""}${STUB ? "  [STUBB]" : ""}\n`,
  );

  const { llm, model } = byggLlm();
  let fasta = 0, anmarkta = 0;
  const anmarkningar: Array<Record<string, unknown>> = [];
  const hoppOrsaker = new Map<string, number>();

  async function enPost(p: KoPost): Promise<boolean> {
    const c = p.candidate;
    const jamforbara = findComparableCosts({ title: c.title, category: c.category }, pool);
    let est: CostEstimate;
    try {
      est = await estimateCost(
        { title: c.title, parties: c.parties, person: c.person, quote: c.quote,
          category: c.category, amount_in_text_msek: c.amount_in_text_msek ?? null,
          financing_mentioned: c.financing_mentioned ?? false } as never,
        llm, model, jamforbara,
      );
    } catch (e) {
      const varfor = `estimatfel: ${e instanceof Error ? e.message : e}`;
      console.log(`HOPPAS ${c.title.slice(0, 50)} — ${varfor}`);
      hoppOrsaker.set(varfor, (hoppOrsaker.get(varfor) ?? 0) + 1);
      return false;
    }
    if (!est.calculation) {
      // method_note skiljer ett misslyckat anrop från ett svar utan uträkning.
      const varfor = est.method_note || "modellen gav ingen uträkning";
      console.log(`HOPPAS ${c.title.slice(0, 50)} — ${varfor}`);
      hoppOrsaker.set(varfor, (hoppOrsaker.get(varfor) ?? 0) + 1);
      return false;
    }

    const invandningar = provaEstimatet(p, est);
    if (invandningar.length > 0) {
      anmarkta++;
      console.log(
        `ANMÄRKT [${c.parties.join(",")}] ${c.title.slice(0, 55)} — ` +
          `${est.msek_base} mkr, ${invandningar.map((i) => i.kontroll).join(", ")}`,
      );
      anmarkningar.push({
        titel: c.title, parti: c.parties, citat: c.quote, url: p.articleUrl ?? null,
        forslag: { type: est.type, period: est.period, msek_low: est.msek_low,
                   msek_base: est.msek_base, msek_high: est.msek_high,
                   calculation: est.calculation, method_note: est.method_note },
        invandningar,
      });
      return true;
    }

    fasta++;
    console.log(`FÄST    [${c.parties.join(",")}] ${c.title.slice(0, 55)} — ${est.msek_base} mkr/${est.period}`);
    if (DRY) { console.log(`         ${est.calculation}`); return true; }
    p.cost = {
      type: est.type, period: est.period,
      msek_low: est.msek_low, msek_base: est.msek_base, msek_high: est.msek_high,
      basis: est.basis, basis_url: est.basis_url ?? null,
      method_note: est.method_note, confidence: est.confidence,
      calculation: est.calculation,
    };
    p.costReason = `LLM-estimat (confidence ${est.confidence}) — bekräfta/justera belopp`;
    return true;
  }

  if (!DRY) spara = byggSpara(poster, anmarkningar);

  // Runnern skickar SIGTERM innan den dödar jobbet — sista chansen att spara.
  let sparar = false;
  const sparaOchAvsluta = (sig: string): void => {
    if (sparar) return;
    sparar = true;
    console.log(`\n${sig} mottagen — sparar ${fasta} kostnader och ${anmarkta} anmärkningar.`);
    try { spara(); } catch (e) { console.error("Kunde inte spara vid avbrott:", e); }
    process.exit(0);
  };
  process.on("SIGTERM", () => sparaOchAvsluta("SIGTERM"));
  process.on("SIGINT", () => sparaOchAvsluta("SIGINT"));

  let kvar = valda;
  let slutTid = false;
  let eiForsokta = 0;
  let sedanSpar = 0;
  // Bortfallet är tidsklustrat (API otillgängligt i perioder), inte knutet till
  // enskilda poster — därför är ett nytt varv över just de som föll bort värt
  // mer än att ge upp. Varvet avbryts när det inte längre räddar något.
  for (let varv = 1; varv <= VARV && kvar.length > 0 && !slutTid; varv++) {
    if (varv > 1) {
      console.log(`\n— Omtag ${varv - 1}: ${kvar.length} poster som föll bort, ny chans —\n`);
      hoppOrsaker.clear();
    }
    const foll: KoPost[] = [];
    for (const [i, p] of kvar.entries()) {
      if (Date.now() > DEADLINE) {
        eiForsokta = kvar.length - i;
        console.log(
          `\nTidsbudget slut (${MAX_MINUTER} min). ${eiForsokta} poster ej försökta — ` +
            "sparar det som hunnits. Kör igen för resten (idempotent).",
        );
        slutTid = true;
        break;
      }
      if (!(await enPost(p))) foll.push(p);
      if (!DRY && ++sedanSpar >= 10) {
        sedanSpar = 0;
        spara();
        console.log(`   [checkpoint sparad — ${fasta} fästa, ${anmarkta} anmärkta]`);
      }
    }
    if (!slutTid && foll.length === kvar.length && varv > 1) {
      console.log("\nOmtaget räddade inget — avbryter (API troligen fortsatt otillgängligt).");
      kvar = foll;
      break;
    }
    kvar = foll;
  }

  console.log(
    `\nSummering: ${fasta} kostnader fästa, ${anmarkta} anmärkta (ingen kostnad satt), ` +
      `${kvar.length + eiForsokta} hoppade.`,
  );
  if (hoppOrsaker.size > 0) {
    console.log("Hoppsorsaker (sista varvet):");
    for (const [varfor, n] of [...hoppOrsaker.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${varfor.slice(0, 120)}`);
    }
  }
  if (DRY) { console.log("\n[TORRKÖRNING] Inget skrivet."); return; }
  spara();
  console.log(
    `\nSkrivet: ${fasta} kostnader → needs_review.json; ` +
      `${anmarkta} → ko_prissattning_anmarkningar.json. Ingenting publicerat.`,
  );
}

/**
 * Skriver allt arbete som gjorts hittills. Anropas löpande (checkpoint) och vid
 * avbrottssignal — inte bara på slutet. Skälet är mätt: `calculation-backfill`
 * körning 30191490153 slog i GitHubs sextimmarstak och dödades med allt arbete
 * kvar i minnet. Körningen är idempotent, så nästa körning betar av resten.
 */
function byggSpara(poster: KoPost[], anmarkningar: Array<Record<string, unknown>>): () => void {
  return () => {
    writeFileSync(join(DATA, "needs_review.json"), JSON.stringify(poster, null, 2) + "\n");
    writeFileSync(
      join(DATA, "ko_prissattning_anmarkningar.json"),
      JSON.stringify(anmarkningar, null, 2) + "\n",
    );
  };
}

const arCli = process.argv[1]?.endsWith("ko-prissattning.mts");
if (arCli) main().catch((e: unknown) => { console.error(e); process.exit(1); });
