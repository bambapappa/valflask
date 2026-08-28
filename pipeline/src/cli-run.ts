import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { LiveSource, type SourceConfig, type SourceFeed } from "./fetch.ts";
import { OpenRouterClient, type LlmLed } from "./llm.ts";
import { createArchiveFn } from "./archive.ts";
import { runPipeline, type PipelineContext } from "./index.ts";

const DATA_DIR = resolve(process.cwd(), "../data");

function getEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const v = env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

/**
 * Filtrerar feeds mot SKORD_KALLOR — en kommaseparerad lista feed-id.
 *
 * Tomt/osatt värde ger alla feeds tillbaka orört, precis som utan flaggan.
 * Ett värde som inte matchar NÅGOT id är ett stavfel, inte en tom körning —
 * den ska stoppa körningen med besked, inte tyst hämta noll sidor.
 */
export function valjFeeds(feeds: readonly SourceFeed[], kallorRaw: string | undefined): SourceFeed[] {
  if (!kallorRaw) return [...feeds];
  const villa = new Set(kallorRaw.split(",").map((s) => s.trim()).filter((s) => s !== ""));
  const valda = feeds.filter((f) => villa.has(f.id));
  if (valda.length === 0) {
    throw new Error(`SKORD_KALLOR="${kallorRaw}" matchar inget feed-id i sources.yaml.`);
  }
  return valda;
}

/**
 * Läser SKORD_URLAR — en kommaseparerad lista exakta adresser.
 *
 * Tomt/osatt ger en tom lista: körningen tar hela urvalet, som utan flaggan.
 *
 * En adress som inte är en adress är ett stavfel, och ett stavfel ska stoppa
 * körningen. Alternativet är värre än ett fel: filtret matchar då ingenting,
 * skörden blir tom, och körningen rapporterar glatt att den är klar.
 */
export function valjUrlar(urlarRaw: string | undefined): string[] {
  if (!urlarRaw) return [];
  const delar = urlarRaw.split(",").map((s) => s.trim()).filter((s) => s !== "");
  for (const del of delar) {
    let parsad: URL;
    try {
      parsad = new URL(del);
    } catch {
      throw new Error(`SKORD_URLAR: "${del}" är ingen giltig adress.`);
    }
    if (parsad.protocol !== "http:" && parsad.protocol !== "https:") {
      throw new Error(`SKORD_URLAR: "${del}" är varken http eller https.`);
    }
  }
  return delar;
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
  valfria: ReadonlySet<string> = new Set(),
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
      if (varde) modeller[primarModell] = varde;
      // EN VALFRI ROLL FÄLLER INTE LEDET. Kostnadsrollen tillkom när de tre
      // andra redan var satta i alla led, och att kräva den överallt hade
      // stoppat pipelinen tills varje led fått sin variabel. Saknas den lånar
      // ledet sin egen utvinningsmodell — samma modell som gjorde jobbet före
      // rollen fanns, alltså oförändrat beteende tills någon sätter variabeln.
      else if (!valfria.has(roll)) saknade.push(namn);
    }
    for (const roll of valfria) {
      const primarModell = roller[roll];
      if (primarModell !== undefined && modeller[primarModell] === undefined) {
        const lanad = modeller[roller["extract"]!];
        if (lanad !== undefined) modeller[primarModell] = lanad;
      }
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
    // Bara de OBLIGATORISKA rollerna räknas här. Räknas de valfria med blir
    // ett helt osatt led aldrig noll, och då faller det på "halvt
    // konfigurerat" i stället för att hoppas över tyst.
    const obligatoriska = Object.keys(roller).filter((r) => !valfria.has(r));
    const antalSatta = 2 + obligatoriska.length - saknade.length;
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

  // KEDJAN BÄR TVÅ SLAGS RESERV, OCH BARA DEN ENA GÅR ATT MÄTA HÄR.
  //
  // Varje led har egen adress, egen nyckel och egna modellnamn. Två led som
  // kör SAMMA modell hos OLIKA konton är därför en fullgod reserv mot allt som
  // sitter i kontot — slut kvot, taktspärr, död nyckel, utebliven betalning.
  // Att de delar modellnamn är då ett medvetet val, inte ett misstag, och
  // ingenting att varna för. Den uppsättningen är projektets: två konton hos
  // samma leverantör med samma modeller, och ett tredje led med egna.
  //
  // Det enda som faktiskt är ett enda felställe är när rollen kör samma modell
  // i HELA kedjan. Då tar ett modellfel — avregistrerad, omdöpt, tillfälligt
  // borttagen, taktspärrad hos leverantören — varenda led på en gång, och
  // ingen reserv finns kvar oavsett hur många konton som står i ledet.
  //
  // Första versionen av den här varningen fällde på två led som delade modell
  // och bad om att de skulle göras olika. Det var fel råd: den hade tjatat vid
  // varje körning om en uppsättning som var riktig, och en varning som alltid
  // kommer slutar läsas. Den mäter nu bristen i stället för mönstret.
  //
  // Natten till 2026-08-18 fungerade kedjan som den skulle: utvinningsmodellen
  // svarade inte hos något av de två kontona, och det tredje ledet med en egen
  // modell gjorde hela skörden. Att just den rollen föll på båda kontona medan
  // verifiering och copy gick igenom på samma konton är signaturen för ett
  // modellfel — ett kontofel hade tagit alla tre rollerna.
  for (const roll of Object.keys(roller)) {
    const primarModell = roller[roll]!;
    const modeller = new Set(led.map((l) => l.modell?.[primarModell] ?? primarModell));
    if (led.length > 1 && modeller.size === 1) {
      console.warn(
        `LLM-kedjan: rollen ${roll} kör samma modell (${[...modeller][0]}) i HELA kedjan ` +
          `(${led.map((l) => l.namn).join(", ")}). Leden skyddar mot kontofel — slut kvot, ` +
          `taktspärr, död nyckel — men ett modellfel tar alla samtidigt, och då finns ingen ` +
          `reserv kvar. Ge minst ett led ett eget MODEL_${roll.toUpperCase()}-värde om rollen ` +
          `ska överleva att modellen försvinner.`,
      );
    }
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
  // KOSTNADEN ÄR EN EGEN ROLL SEDAN 2026-08-28. Den delade tidigare modell
  // med utvinningen — inte av ett val, utan för att `estimateCost` fick
  // `models.extract` inskickad. Följden var att statsfinansiella
  // uppskattningar gjordes av den snabbaste modellen i kedjan, vald för att
  // läsa text ur sidor. Genomgången av A-gruppen samma dag fann just de fel
  // det ger: engångsbelopp prissatta per år gånger fyra, spann som inte
  // hänger ihop med sin egen uträkning, och tal som är rätt räknade på fel
  // politik.
  //
  // Osatt betyder oförändrat: rollen faller tillbaka på utvinningsmodellen,
  // precis som förut. Sätts MODEL_KOSTNAD byter bara kostnadssteget modell.
  if (!extract) throw new Error("Saknad miljövariabel: MODEL_EXTRACT");
  if (!verify) throw new Error("Saknad miljövariabel: MODEL_VERIFY");
  if (!copy) throw new Error("Saknad miljövariabel: MODEL_COPY");
  const kostnad = getEnv(env, "MODEL_KOSTNAD") ?? extract;
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

  // SKORD_KALLOR: en riktad körning mot namngivna feed-id, i stället för hela
  // sources.yaml. Budgeten (maxNewArticles) delas annars på alla feeds i tur och
  // ordning, och en katalogbacklog hos ett enda parti får bara sin andel — även
  // med SKORD_RUNDGANG på, som bara jämnar ut ordningen INOM den delade budgeten.
  // Sätts flaggan töms budgeten mot exakt de feeds som anges, tills backlogen är
  // slut. En körningsinput, inte en repovariabel: den går inte att glömma på.
  const kallorRaw = getEnv(env, "SKORD_KALLOR");
  const feeds = valjFeeds(config.feeds, kallorRaw);
  if (kallorRaw) {
    console.log(`[skörd] riktad körning: ${feeds.length} feed(s) — ${feeds.map((f) => f.id).join(", ")}`);
  }

  // SKORD_URLAR: ännu snävare än SKORD_KALLOR — exakta adresser i stället för
  // hela källor. Finns för svansen: när en katalog är läst så när som på en
  // handfull sidor är det slöseri att gå igenom hela källan för deras skull.
  const urlarRaw = getEnv(env, "SKORD_URLAR");
  const urlar = valjUrlar(urlarRaw);
  if (urlar.length > 0) {
    console.log(`[skörd] riktade adresser: ${urlar.length} st — ${urlar.join(", ")}`);
  }

  const llm = new OpenRouterClient({
    led: byggLed(env, { extract, verify, copy, kostnad }, new Set(["kostnad"])),
  });

  const articleSource = new LiveSource({
    feeds,
    limits: config.limits,
    cacheDir: opts.cacheDir ?? null,
    urlar,
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
    samtidigaArtiklar: config.limits.samtidiga_artiklar,
    archiveFn: createArchiveFn(),
    models: { extract, verify, copy, kostnad },
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
      `extract=${ctx.models.extract} verify=${ctx.models.verify} copy=${ctx.models.copy} ` +
      `kostnad=${ctx.models.kostnad}${ctx.models.kostnad === ctx.models.extract ? " (ärvd)" : ""}`,
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
