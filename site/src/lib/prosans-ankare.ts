/**
 * Ankarregistret — prosans påståenden om koden, kopplade till en mätning.
 *
 * VARFÖR DET HÄR FINNS
 *
 * Vi har grindar för datats kvalitet — citatgrindarna, invarianterna,
 * `provningar:status --tak`, `test-og.mts` — och hade ingen alls för prosans.
 * Metodsidan påstod att vikt-raden «skrivs av datorn efter en fast mall» och
 * att «samma belopp ger ordagrant samma rad». Det var sant när det skrevs.
 * Det blev osant den dag det nionde löftet fick en modellskriven rad
 * godkänd, och ingenting sa till. Felet hittades för att en människa läste
 * texten och koden bredvid varandra.
 *
 * Prosan påstår något om koden, prosan har inget ankare i koden, koden
 * flyttar sig. Registret är ankaret.
 *
 * SÅ FUNGERAR EN POST
 *
 * Varje post binder en **mening som står på en publicerad sida** till en
 * **mätning av vad koden eller datat faktiskt gör**. Grinden
 * `site/scripts/test-prosan.mts` gör två saker med varje post:
 *
 *   1. Kräver att `pastaende` fortfarande står **ord för ord** i `sida`.
 *      Skrivs meningen om måste ankaret röras. Det är citatgrinden vänd mot
 *      vår egen text: ingen tyst omformulering bort från kontrollen.
 *   2. Kör `prov`. Faller det är påståendet inte längre sant.
 *
 * TVÅ REGLER SOM ÄR BINDANDE
 *
 * **Provet ska mäta undantaget prosan inte nämner.** Ett prov som bara
 * upprepar vad meningen säger mäter ingenting. Det intressanta är kanten:
 * hur många bär den modellskrivna raden, hur många talade källor saknar
 * tidpunkt, vilken våg rötbevakningen faktiskt täcker.
 *
 * **Varje prov ska bevisligen kunna falla, och `fallprov` säger mot vilket
 * infört fel det provats.** Ett prov som inte kan fälla är värre än inget —
 * det ger grönt sken. Repot har gjort det misstaget två gånger: klippgrinden
 * bet inte mot ett infört fel, och invarianterna prövade egna kopior av
 * summorna och gav grönt med gapfelet återinfört.
 *
 * VAD REGISTRET INTE GÖR
 *
 * Det vet aldrig att ett påstående är **sant** — bara att en bestämd mätning
 * fortfarande håller. Ett fel prov ger falsk trygghet, vilket är hela skälet
 * till `fallprov`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPromises, getParties } from "./data.ts";
import { provaVantan, type Vantan } from "../../../pipeline/src/arkivvantan.ts";
import { ordnaEfterTackning, partiForUrl } from "../../../pipeline/src/skordeordning.ts";
import { getIssuesFile, getStances } from "./stances.ts";
import { harTidpunkt } from "./prosans-tal.ts";

const ROT = resolve(import.meta.dirname, "../../..");

/**
 * Blänk repot för grinden som prövar att proven biter.
 *
 * Ett prov som svarar «ja» på ett tomt repo mäter ingenting — det är
 * klippgrindens fel och invarianternas fel, en tredje gång. Med den här
 * satt får varje prov läsa tomma filer, och då ska det falla. Se
 * `test-prosan.mts`.
 */
let blankat = false;
export function blankaRepot(pa: boolean): void {
  blankat = pa;
}

/** Läser en fil ur repot. Ankaren mäter källkod lika ofta som data. */
export function repofil(relativ: string): string {
  if (blankat) return "";
  return readFileSync(resolve(ROT, relativ), "utf8");
}

export interface Ankare {
  /** Stabilt id. Ändras aldrig — det är så en post går att följa över tid. */
  id: string;
  /** Sidfilen påståendet står i, relativt repots rot. */
  sida: string;
  /** Meningen ord för ord som den står på sidan. */
  pastaende: string;
  /** Mäter vad koden eller datat faktiskt gör. Falskt ⇒ grinden fäller. */
  prov: () => boolean;
  /** Vilket infört fel som bevisligen fäller provet. */
  fallprov: string;
  /** Kort om vad mätningen visade när ankaret skrevs eller senast rördes. */
  matt?: string;
}

const METOD = "site/src/pages/metod.astro";
const OM = "site/src/pages/om.astro";
const PRESS = "site/src/pages/press.astro";
const API = "site/src/pages/api.astro";
const HV_METOD = "handlingsvagen/site/src/pages/metod.astro";
const HV_NEUTRALITET = "handlingsvagen/site/src/pages/neutralitet.astro";

const aktiva = () => getPromises().filter((p) => p.status === "aktiv");

export const ANKARE: Ankare[] = [
  /* ───────────────────────────────────────── Fläskvågens metodsida ── */
  {
    id: "metod-atta-partier",
    sida: METOD,
    pastaende: "Och vi räknar på exakt samma sätt för alla åtta riksdagspartier.",
    prov: () => getParties().length === 8,
    fallprov: "Ta bort ett parti ur parties.json — provet faller på 7.",
    matt: "8 partier 2026-08-09",
  },
  {
    id: "metod-viktraden-partiet-paverkar-inte",
    sida: METOD,
    pastaende: "<strong>Vilket parti som lovat påverkar aldrig raden.</strong>",
    // dryLine() får hela löftet, så inget hindrar att någon läser p.parties i
    // den. Provet mäter källkoden: rör funktionen partiet är meningen osann.
    //
    // Kravet att funktionen ska FINNAS är inte pynt. Första utkastet var bara
    // negationen, och då svarade provet «ja» på ett tomt repo — det kunde
    // inte skilja «dryLine rör inte partiet» från «dryLine finns inte».
    // Blänkgrinden i test-prosan.mts fällde det, vilket är hela dess poäng.
    prov: () => {
      const kod = repofil("site/src/lib/aggregates.ts");
      const start = kod.indexOf("export function dryLine");
      if (start < 0) return false;
      const kropp = kod.slice(start);
      const slut = kropp.indexOf("\n}");
      if (slut < 0) return false;
      return !/\bpart(y|ies|i)\b/iu.test(kropp.slice(0, slut));
    },
    fallprov: "Låt dryLine() läsa promise.parties — provet faller.",
    matt: "dryLine() rör inte partiet 2026-08-09",
  },
  {
    id: "metod-viktraden-tre-saker",
    sida: METOD,
    pastaende:
      "Tre andra saker gör det, och alla tre står i datat: beloppet, ämnesområdet",
    // Undantaget prosan tidigare inte nämnde: raden beror också på
    // financing_claimed. Provet kräver att alla tre ingångarna finns kvar —
    // försvinner en är meningen för generös, tillkommer en är den för snäv.
    prov: () => {
      const kod = repofil("site/src/lib/aggregates.ts");
      const kropp = kod.slice(kod.indexOf("export function dryLine"));
      const slut = kropp.indexOf("\n}");
      const f = kropp.slice(0, slut);
      return (
        f.includes("financing_claimed") &&
        f.includes("promise.category") &&
        f.includes("promiseTotalMsek")
      );
    },
    fallprov:
      "Ta bort finansieringsledet ur dryLine() — provet faller, för meningen räknar upp tre saker.",
    matt: "belopp, kategori och finansiering 2026-08-09",
  },
  {
    id: "metod-quip-ett-par-procent",
    sida: METOD,
    pastaende:
      "<strong>Ett par procent av löftena</strong> bär i stället en rad som en språkmodell skrivit och en människa godkänt.",
    // Planens ursprungliga prov — «antalet quip är 0» — hörde till den GAMLA
    // lydelsen, som inte nämnde undantaget alls. Nu nämner prosan det, så
    // provet är vänt: undantaget ska finnas, och det ska förbli litet.
    // Båda riktningarna kan fälla.
    prov: () => {
      const a = aktiva();
      const medQuip = a.filter((p) => p.quip).length;
      return medQuip > 0 && medQuip / a.length < 0.05;
    },
    fallprov:
      "Nolla alla quip — stycket beskriver ett undantag som inte finns. Sätt quip på var tionde löfte — «ett par procent» håller inte.",
    matt: "9 av 553 = 1,6 % 2026-08-09",
  },
  {
    id: "metod-djuren",
    sida: METOD,
    pastaende: "Svaret uttrycks i djur — blåvalar, elefanter, giraffar.",
    prov: () => {
      const kod = repofil("site/src/lib/aggregates.ts");
      return ["blåval", "elefant", "giraff"].every((d) => kod.includes(d));
    },
    fallprov: "Byt ut giraffen mot ett annat djur — provet faller.",
  },
  {
    id: "metod-orimligt-stora-loften",
    sida: METOD,
    pastaende:
      "<strong>Orimligt stora löften granskas för hand.</strong> Ett enskilt löfte med en osannolikt hög prislapp publiceras inte automatiskt",
    // Tröskeln är den prosan vilar på. Försvinner spärren är meningen tom.
    prov: () => {
      const kod = repofil("pipeline/src/gates.ts");
      return (
        /export const R5_CAP_MSEK = 1_500_000;/u.test(kod) &&
        kod.includes("passesAmountCapR5")
      );
    },
    fallprov: "Ta bort R5-spärren ur gates.ts — provet faller.",
    matt: "taket 1 500 000 msek 2026-08-09",
  },
  {
    id: "metod-uppskattning-granskas-av-manniska",
    sida: METOD,
    pastaende:
      "Varje egen uppskattning granskas av en människa innan den publiceras",
    // Grinden VAR raden i index.ts som skickade varje llm_estimat till kön,
    // och provet läste det villkoret. Sedan 2026-08-18 finns inget villkor:
    // varje kandidat går till kön, oavsett grund. Påståendet är alltså sant
    // med större marginal än förut — men provet mätte kodens FORM, och när
    // formen försvann föll det. Det är rätt beteende av grinden och skälet
    // till att den finns.
    //
    // Provet mäter nu saken i stället för formen: att pipelinen inte har
    // någon väg som publicerar, och att spärren som säger ifrån står kvar.
    // Håller det, går varje egen uppskattning till en människa — det följer
    // av att ALLT gör det.
    prov: () => {
      const kod = repofil("pipeline/src/index.ts");
      const ingenPublicering = !/processedCandidates\.push\s*\(/u.test(kod);
      const spärr =
        /if\s*\(processedCandidates\.length\s*>\s*0\)\s*\{[\s\S]{0,400}?throw new Error/u.test(
          kod,
        );
      const kandidatenNarKon = /reviewItems\.push\s*\(/u.test(kod);
      return ingenPublicering && spärr && kandidatenNarKon;
    },
    fallprov:
      "Lägg tillbaka en processedCandidates.push i pipelinen — provet faller, " +
      "och ett gissat belopp hade kunnat publiceras oläst.",
    matt: "438 av 553 aktiva löften har basis llm_estimat 2026-08-09"
  },
  {
    id: "metod-andra-oberoende-datorn",
    sida: METOD,
    pastaende:
      "<strong>Citatet läses av en andra, oberoende dator</strong>",
    // Det gamla felet: sidan påstod att den andra datorn dubbelkollade
    // BELOPPET. Den läser citatet. Provet mäter att kravet på två skilda
    // modeller står kvar i koden — utan det är «oberoende» ett ord.
    prov: () => repofil("pipeline/src/cli-run.ts").includes(
      "MODEL_VERIFY måste vara en annan modell än MODEL_EXTRACT",
    ),
    fallprov:
      "Ta bort kravet i cli-run.ts — provet faller, och samma modell kan då kontrollera sig själv.",
  },
  {
    id: "metod-prislappen-ingen-dator",
    sida: METOD,
    pastaende:
      "<strong>Själva prislappen kontrolleras inte av en dator alls.</strong>",
    // «Kontrolleras» är här beslutet om publicering, inte om en dator får
    // föreslå en beräkning. `estimateCost` använder redan en språkmodell när
    // källan saknar belopp; kandidatens prislapp blir ändå aldrig publik direkt.
    // Det gamla provet blandade ihop de två och föll när kostnadsrollen blev
    // separat. Här mäts i stället den faktiska spärren i pipelinen: inget
    // kostnadsförslag får fylla publiceringslistan.
    prov: () => {
      const kod = repofil("pipeline/src/index.ts");
      return (
        kod.includes("const cost = await estimateCost(accepted, ctx.llm, ctx.models.kostnad") &&
        !/processedCandidates\.push\s*\(/u.test(kod)
      );
    },
    fallprov:
      "Lägg tillbaka processedCandidates.push i pipelinen — provet faller, för då kan datorns kostnadsförslag publiceras utan mänsklig kontroll.",
  },
  {
    id: "metod-talade-kallor-tidpunkt",
    sida: METOD,
    pastaende:
      "Av de {talade.totalt} löften som kommer ur tal har {talade.medTidpunkt} en tidpunkt.",
    // Talen slås upp vid bygget. Provet vaktar att de FORTSATT slås upp och
    // inte skrivs in som siffror — det var just det som gjorde meningen osann.
    prov: () => {
      const sida = repofil(METOD);
      return sida.includes("taladeKallorTal") && sida.includes("{talade.totalt}");
    },
    fallprov:
      "Skriv in siffrorna 32 och 14 i texten i stället för platshållarna — provet faller.",
    matt: "14 av 32 hade tidpunkt 2026-08-09",
  },
  {
    id: "metod-avskriften-hallen-ej-publik",
    sida: METOD,
    pastaende:
      "<strong>Textversionen har vi sparad, men vi publicerar den inte.</strong>",
    // Ovanligt ankare: det vaktar en INRÖMMELSE, och det är andra gången den
    // skrivs om. Förra lydelsen — «Textversionen sparar vi inte» — var osann
    // från den dag valvet fylldes, och provet såg det inte: det mätte bara om
    // det fanns en PUBLIK länk till en avskrift, aldrig om det fanns en sparad.
    // Ett prov som bara kan falla åt ena hållet vaktar ingenting åt det andra.
    // Nu mäts båda leden: varje talat citat ska bära en hållen avskrift, och
    // inget löfte får bära en publik utan att meningen skrivs om igen.
    prov: () => {
      const talade = aktiva().filter(
        (p) => p.source.kind === "tal" && !p.source.archive_url,
      );
      if (talade.length === 0) return false;
      const hallen = talade.every((p) => p.source.transcript_held?.video_id);
      const ingenPublik = aktiva().every(
        (p) => !(p.source as { transcript_url?: string }).transcript_url,
      );
      // Tredje ledet, och det som gör provet till ett prov: förbehållet måste
      // nå läsaren. En sparad avskrift som ingen får veta att vi har är samma
      // sak som ingen avskrift, och ett prov som bara läser datat kan inte se
      // skillnaden — det svarar ja även när sidan tiger.
      const citat = repofil("site/src/components/Citat.astro");
      const syns =
        citat.includes("transcriptHeld") && citat.includes("avskrift kontrollerad, ej publik");
      return hallen && ingenPublik && syns;
    },
    fallprov:
      "Ta bort transcript_held från ett talat löfte, eller sätt transcript_url på ett — provet faller åt var sitt håll, och meningen ska skrivas om till det som då gäller.",
    matt: "14 av 14 talade källor bar en hållen avskrift, 0 av 719 en publik, 2026-08-17",
  },
  {
    id: "metod-rotkontroll-varje-vecka",
    sida: METOD,
    pastaende:
      "Sedan öppnar vi källorna igen <strong>varje vecka</strong> — både löftenas och partibeskedens — och jämför mot citatet.",
    // Fyndet som byggde om workflowen: verktyget fanns, takten fanns inte.
    // Provet mäter arbetsflödet, inte att kommandot existerar.
    prov: () => {
      const wf = repofil(".github/workflows/rot-watch.yml");
      return (
        wf.includes("stances:rot-check") &&
        wf.includes("promises:rot-check") &&
        /cron:\s*"[^"]*\*\s*\*\s*[0-6]"/u.test(wf)
      );
    },
    fallprov:
      "Ta bort Fläskvågens steg ur rot-watch.yml — provet faller, precis som det hade gjort 2026-08-09.",
    matt: "båda vågarna, måndagar 04.40 UTC",
  },
  {
    id: "metod-reformutrymmet",
    sida: METOD,
    pastaende:
      "knappt 80 miljarder kronor per år, utöver försvar och stöd till Ukraina",
    prov: () => {
      const k = JSON.parse(repofil("data/constants.json")) as {
        reformutrymme_msek_per_ar: { value: number };
      };
      return k.reformutrymme_msek_per_ar.value === 80_000;
    },
    fallprov: "Ändra konstanten till 90 000 — provet faller.",
  },
  {
    id: "metod-mandatperioden-fyra-ar",
    sida: METOD,
    pastaende: "över hela mandatperioden (fyra år, alltså cirka 320 miljarder)",
    prov: () => repofil("site/src/lib/aggregates.ts").includes("as number) * 4"),
    fallprov: "Ändra multiplikatorn till 5 — provet faller, och 320 blir 400.",
  },
  {
    id: "metod-spannet-fyra-av-fem",
    sida: METOD,
    pastaende: "som täcker det troliga utfallet i ungefär fyra fall av fem",
    prov: () => /level = 0\.8/u.test(repofil("site/src/lib/aggregates.ts")),
    fallprov: "Ändra level till 0.95 — provet faller, och meningen borde säga nitton av tjugo.",
  },
  {
    id: "metod-spannet-snavas-inte-in",
    sida: METOD,
    pastaende: "så vi snävar inte till spannet ända in",
    // ρ = 0 vore att anta att felen är helt oberoende, alltså att snäva in
    // ända in. Meningen lever på att ρ är större än noll.
    prov: () => {
      const m = /rho = ([\d.]+)/u.exec(repofil("site/src/lib/aggregates.ts"));
      return m !== null && Number(m[1]) > 0;
    },
    fallprov: "Sätt rho = 0 — provet faller.",
  },
  {
    id: "metod-fragorna-valjs-av-valjarna",
    sida: METOD,
    pastaende:
      "Novus (\"Viktigaste politiska frågan\", topp 10, någon av de två senaste mätningarna räknas) och den nationella SOM-undersökningen (topp 15)",
    // Prosan ska säga samma sak som datat säger om sig självt.
    prov: () => {
      const n = (
        JSON.parse(repofil("data/issues.json")) as { criteria_note: string }
      ).criteria_note;
      return n.includes("topp 10") && n.includes("topp 15") && n.includes("Novus");
    },
    fallprov: "Ändra kriteriet i issues.json till topp 5 — provet faller.",
  },
  {
    id: "metod-fragor-tas-aldrig-bort",
    sida: METOD,
    pastaende: "Frågor tas aldrig bort före valdagen.",
    prov: () => {
      const f = JSON.parse(repofil("data/issues.json")) as {
        criteria_note: string;
        issues: unknown[];
      };
      return f.criteria_note.includes("Frågor tas aldrig bort före valdagen") &&
        f.issues.length >= 10;
    },
    fallprov: "Ta bort en fråga ur issues.json — provet faller på antalet.",
    matt: "10 frågor 2026-08-09",
  },

  {
    id: "metod-arkivkopia-nastan-varje",
    sida: METOD,
    pastaende:
      "<strong>Kopian godtas bara om citatet står ordagrant i själva ögonblicksbilden</strong>",
    // Meningen sade förut «Varje citat vi publicerar har en arkivkopia».
    // Mätt 2026-08-11 efter löfteskön: 26 av 620 saknade en, 15 av dem filmer.
    // Provet vaktar det som texten faktiskt säger: att den sammanlagda luckan
    // förblir under fem procent. Vanliga webbsidor utan bärande kopia skrivs
    // nu uttryckligen ut som undantag i stället för att döljas bakom filmerna.
    //
    // Ommätt 2026-08-12 efter de 86 godkännandena ur löfteskön: luckan var som
    // störst 110 av 674 (16,3 %) innan kopiorna hämtades, och grinden föll —
    // rätt, för meningen var då osann. Två omgångar backfill tog den till 24 av
    // 674. Kvar är 14 filmer och 10 webbsidor vars kopia finns men inte bär
    // citatet ordagrant; de får ingen länk hellre än en som inte styrker något.
    //
    // 2026-08-17: taket fick ett undantag, och undantaget har en klocka.
    // Internet Archive låg nere hela morgonen (502/503 på både availability
    // och CDX), samma morgon som 47 löften godkändes ur granskningskön.
    // Luckan gick till 11,88 procent av ett skäl som inte hade med datat att
    // göra, och grinden kunde inte skilja «kopian finns inte» från «vi nådde
    // inte fram». Nu kan den: `data/arkivvantan.json` bokför varför varje
    // källa står utan kopia, och en lucka över taket godtas **bara** när den
    // består av källor som väntar på ett tyst arkiv OCH ingen väntat längre
    // än fjorton dygn. Passerar en enda den gränsen faller bygget ändå.
    // Regeln ligger i `pipeline/src/arkivvantan.ts` och prövas där; den
    // kopieras aldrig hit, för två kopior av en regel glider isär tyst.
    prov: () => {
      const a = aktiva();
      const utan = a.filter((p) => !p.source.archive_url);
      if (utan.length / a.length < 0.05) return true;
      const rad = repofil("data/arkivvantan.json");
      if (!rad) return false; // blänkt repo, eller ingen bokförd väntan
      const besked = provaVantan(JSON.parse(rad) as Vantan, new Date().toISOString());
      if (!besked.godtas) return false;
      // Interimet räcker bara så långt som väntan faktiskt förklarar luckan.
      // Källor som saknar kopia av ANDRA skäl får inte åka snålskjuts.
      const vantandeUrl = new Set(besked.vantande.map((p) => p.url));
      const oforklarade = utan.filter((p) => !vantandeUrl.has(p.source.url.split("#")[0]!));
      return oforklarade.length / a.length < 0.05;
    },
    fallprov:
      "Nolla archive_url på tio webbkällor utan att bokföra dem som väntande i data/arkivvantan.json — provet faller när arkivtäckningen går under 95 procent och luckan inte förklaras av ett tyst arkiv. Sätt `forsta` på en väntande post femton dygn bakåt — provet faller på åldersgränsen.",
    // Ommätt 2026-08-14 (ATTGORA E1): luckan är 14 av 690 = 2,03 procent, och
    // **samtliga fjorton är filmer**. Ingen vanlig webbsida saknar längre en
    // kopia — de 20 som stod i kö när strypningen bet har fyllts. Kvar är bara
    // de talade källorna, som väntar på avskrifter (E2) och inte på arkivet.
    matt: "14 av 690 utan kopia, samtliga filmer, 2026-08-14",
  },
  {
    id: "metod-vantan-har-en-bortre-grans",
    sida: METOD,
    pastaende: "räknas väntan inte längre som en förklaring",
    // Meningen lovar läsaren att undantaget tar slut. Ett undantag utan
    // bortre gräns är ingen interimlösning utan en sänkt grind med bättre
    // ordval, och det är precis vad den här posten finns för att hindra.
    //
    // Provet mäter det prosan INTE säger: inte att gränsen står skriven
    // någonstans, utan att den **biter**. En väntan som passerat gränsen
    // måste göra `provaVantan` avvisande — annars är meningen tom.
    prov: () => {
      const rad = repofil("pipeline/src/arkivvantan.ts");
      if (!rad) return false;
      const nu = "2026-08-17T00:00:00.000Z";
      const gammal = new Date(Date.parse(nu) - 15 * 86_400_000).toISOString();
      const fersk = new Date(Date.parse(nu) - 1 * 86_400_000).toISOString();
      const post = (forsta: string) => ({
        url: "https://x.se/" + forsta, forsta, senaste: forsta, forsok: 1,
        utfall: "arkivet_svarade_inte" as const,
      });
      // Färsk väntan godtas; en som passerat gränsen gör det inte. Båda
      // riktningarna prövas — ett prov som bara visar det ena kan vara sant
      // om en funktion som alltid svarar likadant.
      return provaVantan({ poster: [post(fersk)] }, nu).godtas
        && !provaVantan({ poster: [post(gammal)] }, nu).godtas;
    },
    fallprov:
      "Höj TAK_DYGN i pipeline/src/arkivvantan.ts till 30, eller ta bort åldersfiltret i provaVantan — provet faller, för då tar väntan aldrig slut.",
    matt: "gränsen är 14 dygn; 15 dygns väntan avvisas, 1 dygns godtas, 2026-08-17",
  },
  {
    id: "metod-tackning-minst-last-gar-forst",
    sida: METOD,
    pastaende: "Läsningen tar det parti först som vi läst minst av",
    // Meningen är hela löftet till läsaren om att snedfördelningen krymper.
    // Står den utan mätning är den en avsiktsförklaring, och avsiktsför-
    // klaringar åldras — det var precis så den förra ordningen kunde ligga
    // kvar och ge KD hela budgeten körning efter körning utan att någon såg.
    //
    // Provet mäter det prosan INTE säger: inte att en sorteringsfunktion
    // finns, utan att den vänder på den ordning som faktiskt rådde. Fallet
    // är det verkliga: KD alfabetiskt först och bäst täckt, SD sist och sämst.
    prov: () => {
      const kod = repofil("pipeline/src/skordeordning.ts");
      if (!kod) return false;
      const artiklar = [
        "https://kristdemokraterna.se/var-politik/a",
        "https://kristdemokraterna.se/var-politik/b",
        "https://sd.se/vad-vi-vill/a",
        "https://sd.se/vad-vi-vill/b",
      ];
      const last = new Map([["kd", 233], ["sd", 15]]);
      const ordnad = ordnaEfterTackning(artiklar, (u) => u, () => 0, last);
      // Båda riktningarna: det sämst täckta först OCH det bäst täckta inte
      // först. Ett prov som bara visar det ena kan vara sant om en funktion
      // som alltid svarar likadant.
      return (
        partiForUrl(ordnad[0]!) === "sd" &&
        partiForUrl(ordnad[ordnad.length - 1]!) === "kd"
      );
    },
    fallprov:
      "Sortera artiklarna på adress i stället för på täckning i ordnaEfterTackning — provet faller, för då går kristdemokraterna.se först igen precis som före 2026-08-17.",
    matt: "kd 233 lästa sidor mot sd 15; sd får första platsen, kd sista, 2026-08-17",
  },
  {
    id: "metod-tackning-varje-parti-har-en-vag-in",
    sida: METOD,
    pastaende: "Varje parti har nu en registrerad väg in till hela sin politikavdelning",
    // Undantaget prosan inte nämner: det räcker inte att NÅGON källa finns
    // per parti — en RSS med nyheter är inte en väg in till politiken, och
    // det var just skillnaden mellan en enkelsida och en genomsökt katalog
    // som skapade snedfördelningen. Provet kräver en politikkälla, alltså
    // page, index eller sitemap, för var och en av de åtta.
    prov: () => {
      const yaml = repofil("data/sources.yaml");
      if (!yaml) return false;
      const partier = new Set<string>();
      for (const block of yaml.split(/\n\s*- id:/u).slice(1)) {
        const typ = /\n\s*type:\s*(\S+)/u.exec(block)?.[1];
        const url = /\n\s*url:\s*"([^"]+)"/u.exec(block)?.[1];
        if (!typ || !url) continue;
        // «Hela sin politikavdelning» — inte en enda sida. Det kravet är
        // hela skillnaden: en katalog ger hundratals sidor, en enkelsida en.
        // Godtas page-källor här mäter provet inte det meningen lovar.
        const arKatalog =
          typ === "sitemap" ||
          (typ === "index" &&
            (/\n\s*max_articles:/u.test(block) || /\n\s*follow_depth:\s*2/u.test(block)));
        if (!arKatalog) continue;
        const parti = partiForUrl(url);
        if (parti) partier.add(parti);
      }
      return ["s", "m", "sd", "c", "v", "kd", "l", "mp"].every((p) => partier.has(p));
    },
    fallprov:
      "Ta bort källan s-politik-index ur data/sources.yaml — provet faller, för då har S ingen katalogkälla alls och vi når bara partiets förstasida. Att bara stryka follow_depth fäller INTE provet: källan är en katalog ändå, fast en grundare, och alla partiers kataloger är inte i två våningar.",
    matt: "alla åtta riksdagspartier har en katalogkälla: sitemap, eller index med eget tak eller två våningar, 2026-08-17",
  },
  {
    id: "metod-videokopian-ar-inget-ordagrant-belagg",
    sida: METOD,
    pastaende: "ett skydd mot att beviset försvinner, inte ett ordagrant belägg",
    // Meningen skiljer två sorters bevis åt, och det är hela skälet till att
    // videokopian fick ett EGET fält. Ett fel här ser ut som en förbättring:
    // en videoadress i `archive_url` hade fått löftet att se ut att ha ett
    // ordagrant belägg det inte har, och citatgrinden hade inte kunnat pröva
    // det — det finns ingen text i en film att pröva mot.
    //
    // Provet mäter undantaget prosan inte nämner: att skillnaden inte bara är
    // beskriven utan hålls i datat.
    prov: () => {
      const rad = repofil("data/promises.json");
      if (!rad) return false;
      const alla = JSON.parse(rad) as Array<{
        source: { url: string; archive_url: string | null; video_archive_url?: string | null };
      }>;
      const arVideo = (u: string | null | undefined) =>
        Boolean(u && /(^|\/\/)ghostarchive\.org\/varchive\//.test(u));
      const film = (u: string) => /youtube\.com|youtu\.be/.test(u);
      // Ingen videokopia i archive_url, och ingen videokopia på en webbsida.
      return alla.every((p) => !arVideo(p.source.archive_url))
        && alla.every((p) => !p.source.video_archive_url || film(p.source.url));
    },
    fallprov:
      "Flytta en ghostarchive.org/varchive/-adress från video_archive_url till archive_url — provet faller, för då påstår löftet ett ordagrant belägg som inte går att pröva.",
    matt: "0 videokopior i archive_url av 801 löften, 2026-08-17",
  },
  {
    id: "metod-uppskattning-bar-ungefartecken",
    sida: METOD,
    pastaende: "Den märks alltid med ett ungefär-tecken och ett spann",
    prov: () => repofil("site/src/lib/calc.ts").includes("≈"),
    fallprov: "Ta bort ungefär-tecknet ur formateringen — provet faller.",
  },
  {
    id: "metod-skattesankning-ar-kostnad",
    sida: METOD,
    pastaende: "<strong>Skattesänkningar räknas som en kostnad.</strong>",
    // Undantaget prosan inte nämner: `besparing` och `intäktsökning` räknas
    // åt andra hållet. Provet kräver att alla fyra slagen finns kvar.
    prov: () => {
      const kod = repofil("site/src/lib/aggregates.ts");
      return (
        kod.includes("intäktsminskning") &&
        kod.includes("besparing") &&
        kod.includes("intäktsökning")
      );
    },
    fallprov:
      "Ta bort intäktsminskning ur summeringen — provet faller, och sänkt skatt slutar kosta något.",
    matt: "63 intäktsminskning, 19 besparing, 3 intäktsökning bland aktiva 2026-08-09",
  },
  {
    id: "metod-basisniva-syns-pa-loftessidan",
    sida: METOD,
    pastaende: "Vilken av nivåerna en siffra kommer från syns alltid på löftessidan.",
    prov: () =>
      repofil("site/src/pages/lofte/[...path].astro").includes(
        "formatBasisLabel(promise.cost.basis)",
      ),
    fallprov: "Ta bort källnivån från löftessidan — provet faller.",
  },
  {
    id: "metod-citatet-ordagrant",
    sida: METOD,
    pastaende:
      "Varje citat vi publicerar måste stå <strong>ordagrant</strong> i källan.",
    prov: () =>
      repofil("pipeline/src/gates.ts").includes(
        "Citatet återfinns inte ordagrant i källtexten",
      ),
    fallprov: "Ta bort ordagrannhetskontrollen ur gates.ts — provet faller.",
  },
  {
    id: "metod-kronikorna-avpublicerade",
    sida: METOD,
    pastaende:
      "De sex krönikorna är avpublicerade sedan den 14 augusti 2026.",
    // Tre led, därför att meningen påstår tre saker: att de är sex, att de är
    // borta från sajten, och att de finns kvar. Det sista ledet är det som
    // gör påståendet ärligt — «avpublicerad» betyder inte «raderad».
    //
    // Undantaget prosan inte nämner, och som provet därför mäter: att ingen
    // SIDA renderar dem. Ett prov som bara läste `archived`-flaggan hade
    // svarat ja även den dag någon bygger en ny krönikesida som läser filen
    // förbi flaggan — och det var precis så krönikornas platshållarmekanism
    // kunde ligga oanvänd i fyra månader.
    prov: () => {
      const kronikor = JSON.parse(repofil("data/chronicles.json")) as Array<{ archived?: boolean }>;
      const allaArkiverade = kronikor.length === 6 && kronikor.every((k) => k.archived === true);
      const genereringenAv = /export const KRONIKOR_PAUSADE = true;/u.test(
        repofil("pipeline/src/chronicle.ts"),
      );
      const noten = repofil("site/src/pages/veckans-flask/index.astro");
      const ingenRenderar =
        !noten.includes("getChronicles") && noten.includes("Veckans fläsk är borttagen");
      return allaArkiverade && genereringenAv && ingenRenderar;
    },
    fallprov:
      "Ta bort archived på en krönika, eller låt sidan rendera dem igen — provet faller på båda.",
    matt: "6 av 6 arkiverade, ingen sida renderar dem, 2026-08-14",
  },
  {
    id: "metod-kronikorna-finns-kvar",
    sida: METOD,
    pastaende:
      "Texterna är inte raderade — de ligger kvar i kodförrådet tillsammans med all annan data",
    // «Avpublicerad» är bara ärligt så länge texten faktiskt går att läsa
    // någonstans. Provet kräver därför att alla sex ligger kvar MED sin text —
    // en post som tömts på `body_md` är raderad i allt utom namnet, och då är
    // meningen ovan osann utan att någon rört den.
    prov: () => {
      const k = JSON.parse(repofil("data/chronicles.json")) as Array<{ body_md?: string }>;
      return k.length === 6 && k.every((x) => typeof x.body_md === "string" && x.body_md.trim().length > 200);
    },
    fallprov: "Töm body_md på en krönika — provet faller, för då är texten borta på riktigt.",
    matt: "6 krönikor med sin text i behåll, 2026-08-14",
  },
  {
    id: "metod-fragorna-tva-oberoende-matningar",
    sida: METOD,
    pastaende:
      "De väljs av väljarnas egna prioriteringar i två oberoende opinionsmätningar, inte av oss och inte av en modell.",
    prov: () => {
      const f = JSON.parse(repofil("data/issues.json")) as {
        issues: Array<{ selection_sources?: unknown[] }>;
      };
      return f.issues.every((i) => (i.selection_sources ?? []).length >= 2);
    },
    fallprov:
      "Ta bort ena källbelägget från en fråga — provet faller på att den bara vilar på en mätning.",
  },

  {
    id: "metod-atta-av-tio-prislappar",
    sida: METOD,
    pastaende:
      "<strong>Åtta av tio prislappar, och texten som förklarar dem.</strong>",
    // Andelen står i klartext på sidan och är ett påstående om datat. Den var
    // «de flesta» förut, vilket bär allt mellan 51 och 99 procent, och sedan
    // «fyra av fem». Andelen STIGER när kön betas av: kö-posterna bär
    // modellens uppskattning, och ett godkännande som inte ändrar beloppet
    // behåller den. 2026-08-22 publicerades 501 löften ur kön och andelen gick
    // från 79 till 90 procent. När beståndet senare växte till 3 211 aktiva
    // löften föll andelen till 82 procent; påståendet är därför åter åtta av
    // tio. Provet ska följa mätningen, även när det innebär en mindre
    // smickrande formulering.
    prov: () => {
      const a = aktiva();
      const andel = a.filter((p) => p.cost?.basis === "llm_estimat").length / a.length;
      return andel >= 0.8 && andel < 0.85;
    },
    fallprov:
      "Sätt basis till granskare på hälften av löftena — provet faller, och «åtta av tio» ska då skrivas om.",
    matt: "2 636 av 3 211 = 82 % 2026-08-25",
  },
  {
    id: "metod-forslagen-kontrolleras-av-oberoende",
    sida: METOD,
    pastaende:
      "föreslås av en språkmodell och kontrolleras av en annan, oberoende, innan en människa avgör saken",
    prov: () => {
      const kod = repofil("pipeline/src/cli-run.ts");
      return kod.includes("MODEL_VERIFY måste vara en annan modell än MODEL_EXTRACT");
    },
    fallprov: "Ta bort kravet på skilda modeller — provet faller.",
  },
  {
    id: "metod-summorna-ar-deterministiska",
    sida: METOD,
    pastaende:
      "Samma data ger alltid samma siffra, hur många gånger man än kör om det.",
    // Summorna får inte bero på något utanför datat. En klocka eller ett
    // slumptal i uträkningen gör meningen osann utan att något ser fel ut.
    //
    // Provet siktar på de funktioner meningen räknar upp, inte på hela
    // filen. Första utkastet läste filen rakt av och föll på `generated_at:
    // new Date()` i buildSummary — en tidsstämpel på svaret, inte ett tal i
    // en summa. Ett prov som fäller på fel sak är lika illa som ett som
    // inte fäller alls.
    prov: () => {
      const kod = repofil("site/src/lib/aggregates.ts");
      const summerare = [
        "partyTotalMsek", "financingGap", "totalFlasket",
        "promiseTotalMsek", "categoryBreakdown", "dryLine",
      ];
      return summerare.every((namn) => {
        const start = kod.indexOf(`export function ${namn}`);
        if (start < 0) return false; // funktionen ska finnas kvar
        const kropp = kod.slice(start, start + kod.slice(start).indexOf("\n}"));
        return !/Math\.random|Date\.now|new Date\(/u.test(kropp);
      });
    },
    fallprov:
      "Låt en summa bero på dagens datum — provet faller, och samma data ger då olika siffra.",
  },
  {
    id: "metod-sparren-granskningskon",
    sida: METOD,
    pastaende:
      "<strong>inget nytt löfte och inget belopp når sajten utan att en människa släppt igenom det.</strong>",
    // Stycket som skrevs om 2026-08-09. Den gamla lydelsen påstod att bara
    // en människa kunde slå ihop ändringen — mätt var 2 013 av 2 661
    // commits på main robotpushar, och regeln på main ger boten undantag
    // alltid. Den nya lydelsen vilar på etikettgrinden i stället, och det
    // är den provet mäter.
    //
    // **Skärpt 2026-08-18, och skälet är dyrköpt.** Provet mätte BARA
    // etikettvillkoret — alltså den ena vägen in i datat. Pipelinen hade en
    // egen väg förbi kön: löften med uttryckligt belopp i källtexten
    // publicerades utan godkännande, och tjugo löften nådde sajten så. Sju kom
    // i en enda körning, sex av dem höll inte. Meningen ovan var alltså osann
    // i tio veckor medan provet lyste grönt, för det mätte inte undantaget
    // prosan inte nämner.
    //
    // Provet mäter nu båda vägarna: etikettvillkoret som förut, OCH att
    // pipelinen inte har någon publiceringsväg kvar. Andra ledet läses ur
    // koden som faktiskt kör: `runPipeline` ska kasta om något hamnar i
    // `processedCandidates`, och den gren som förut lade dit kandidater ska
    // vara borta.
    prov: () => {
      const wf = repofil(".github/workflows/review-apply.yml");
      const etikettgrind =
        wf.includes("apply-labeled-decisions.mts") &&
        wf.includes("startsWith(github.event.label.name, 'beslut:')");

      const pipeline = repofil("pipeline/src/index.ts");
      // Spärren finns och säger ifrån.
      const spärr =
        /if\s*\(processedCandidates\.length\s*>\s*0\)\s*\{[\s\S]{0,400}?throw new Error/u.test(
          pipeline,
        );
      // Och ingen kod fyller listan igen. `.splice(0)` och `.length` räknas
      // inte — det är läsningar, inte påfyllning.
      const ingenPåfyllning = !/processedCandidates\.push\s*\(/u.test(pipeline);

      return etikettgrind && spärr && ingenPåfyllning;
    },
    fallprov:
      "Ta bort etikettvillkoret ur review-apply, ELLER lägg tillbaka en " +
      "processedCandidates.push i pipelinen — provet faller åt båda hållen, " +
      "för då kan ett löfte nå sajten utan att en människa släppt igenom det.",
  },
  {
    id: "metod-sparren-vad-den-inte-ar",
    sida: METOD,
    pastaende:
      "Det ska sägas lika rakt vad spärren <em>inte</em> är: sajten byggs om automatiskt",
    // Inrömmelsen ska stå kvar så länge robotar skriver till kodförrådet.
    // Slutar de göra det ska texten skrivas om till det bättre — och då
    // faller provet och tvingar fram omskrivningen.
    //
    // Provet läste tidigare namnet på den identitet arbetsflödet committar
    // som. Det mätte fel sak: när identiteten döptes om 2026-09-03 föll
    // provet, fast robotarna pushade precis lika mycket som förut. Ett namn
    // är inte det påståendet handlar om. Nu mäts det som faktiskt gör
    // inrömmelsen sann — att ett schemalagt arbetsflöde pushar utan att en
    // människa rör det.
    prov: () => {
      const wf = repofil(".github/workflows/rot-watch.yml");
      return wf.includes("git push") && wf.includes("schedule:");
    },
    fallprov:
      "Ta bort robotens pushar ur arbetsflödena — provet faller, och sidan ska då sluta be om ursäkt för dem.",
  },

  /* ─────────────────────────────────────────────────── Om-sidan ── */
  {
    id: "om-ingen-reklam",
    sida: OM,
    pastaende: "<strong>Sajten har ingen reklam och inga intäkter.</strong>",
    // Mätbart som: sidan får inte hämta något från en annan värd.
    prov: () => {
      const h = repofil("site/public/_headers");
      return h.includes("default-src 'self'") && h.includes("script-src 'self'");
    },
    fallprov:
      "Öppna script-src för en annan värd — provet faller, för då kan ett annonsskript laddas.",
  },

  /* ───────────────────────────────────────────────── Press-sidan ── */
  {
    id: "press-delningsbild-per-parti",
    sida: PRESS,
    pastaende: "Exempel: <code>/og/parti-s.png</code>",
    prov: () =>
      repofil("site/scripts/generate-og.mts").includes("`parti-${party.code}.png`"),
    fallprov: "Byt filnamnsmönstret i generate-og.mts — provet faller.",
  },

  /* ─────────────────────────────────────────────────── API-sidan ── */
  {
    id: "api-varje-svar-bar-kontrollnummer",
    sida: API,
    pastaende:
      "Varje svar innehåller <code>generated_at</code> och <code>data_hash</code>.",
    // Fyndet: issues.json saknade data_hash och bara den. Provet läser ALLA
    // ändpunkter, så nästa som byggs utan hash fäller bygget.
    prov: () => {
      const dir = "site/src/pages/api/v1";
      const filer = [
        "summary", "promises", "parties", "comparisons",
        "changelog", "issues", "stances", "integrity", "constants",
      ];
      return filer.every((f) => {
        const kod = repofil(`${dir}/${f}.json.ts`);
        return kod.includes("generated_at") && kod.includes("data_hash");
      });
    },
    fallprov:
      "Ta bort data_hash ur issues.json.ts — provet faller, precis som det gjorde 2026-08-09.",
    matt: "9 av 9 bär båda efter rättelsen",
  },

  {
    id: "api-schemas-finns-i-repot",
    sida: API,
    pastaende:
      "JSON Schemas (draft 2020-12) finns i <code>pipeline/schemas/</code> i repot.",
    // Läses genom repofil och inte readdirSync, så att blänkgrinden i
    // test-prosan.mts kan pröva att provet biter. Draftversionen står i
    // schemat självt — sidan namnger den, alltså ska den mätas.
    prov: () => {
      const s = repofil("pipeline/schemas/promises.schema.json");
      return s.includes("json-schema.org/draft/2020-12/schema");
    },
    fallprov:
      "Byt draftversion i promises.schema.json — provet faller, för sidan namnger draft 2020-12.",
  },

  /* ──────────────────────────────────────── Handlingsvågens metod ── */
  {
    id: "hv-manniska-godkanner-varje-koppling",
    sida: HV_METOD,
    pastaende:
      "Ingenting visas förrän en person läst\n        citatet och godkänt det.",
    // Planen väntade sig att det här skulle falla. Det gör det inte:
    // 702 av 702. Provet mäter DATAT, inte en avsikt i koden.
    prov: () => {
      const k = JSON.parse(repofil("handlingsvagen/data/kopplingar.json")) as Array<{
        status: string;
        bevis?: { citat?: string };
        extraction?: { verified_by?: string };
      }>;
      const a = k.filter((x) => x.status === "aktiv");
      return (
        a.length > 0 &&
        a.every((x) => x.extraction?.verified_by === "owner" && Boolean(x.bevis?.citat))
      );
    },
    fallprov:
      "Sätt verified_by till modellnamnet på en aktiv koppling — provet faller.",
    matt: "702 av 702 aktiva 2026-08-09",
  },
  {
    id: "hv-motioner-per-ledamot-slas-upp",
    sida: HV_METOD,
    pastaende:
      "<b>Partier arbetar olika mycket med motioner.</b> {motionsflitet}",
    // Talen stod som fasta siffror («ungefär 50», «ungefär 15») på en sida
    // där grannmeningarna redan slogs upp. Mätt 2026-08-09: 48 och 18.
    prov: () => repofil("handlingsvagen/site/src/lib/metodtal.ts").includes(
      "motionerPerLedamot",
    ),
    fallprov:
      "Skriv tillbaka siffrorna i texten — provet faller på att platshållaren försvinner.",
    matt: "C 48, L 18 (median enskilda motioner) 2026-08-09",
  },
  {
    id: "hv-propositioner-vags-inte",
    sida: HV_METOD,
    pastaende: "Registret väger motioner men inte propositioner",
    prov: () => {
      const k = JSON.parse(repofil("handlingsvagen/data/kopplingar.json")) as Array<{
        status: string;
        handling_id: string;
      }>;
      const h = JSON.parse(repofil("handlingsvagen/data/handlingar.json")) as Array<{
        id: string;
        kind: string;
      }>;
      const props = new Set(h.filter((x) => x.kind === "proposition").map((x) => x.id));
      return k
        .filter((x) => x.status === "aktiv")
        .every((x) => !props.has(x.handling_id));
    },
    fallprov: "Koppla ett löfte till en proposition — provet faller.",
    matt: "0 av 702 aktiva kopplingar pekar på en proposition 2026-08-09",
  },

  /* ────────────────────────────────── Neutralitetskontraktet (HV) ── */
  {
    id: "webmcp-fixed-english-aliases",
    sida: "site/src/pages/webmcp.astro",
    pastaende:
      "Common English topic words use a fixed Swedish matching list; all returned quotes and sources remain Swedish.",
    prov: () => {
      const client = repofil("site/src/scripts/webmcp.ts");
      return client.includes("const englishQueryAliases") &&
        client.includes("housing: [\"bostad\"]") &&
        client.includes("healthcare: [\"sjukvard\"]") &&
        client.includes("electricity: [\"energi\"]") &&
        client.includes("englishQueryAliases[term]");
    },
    fallprov:
      "Ta bort bostads- eller byggaliaset ur klienten — provet faller, eftersom sidan då påstår en sökyta som inte finns.",
  },

  {
    id: "hv-neutralitet-atta-partier",
    sida: HV_NEUTRALITET,
    pastaende: "Samma regler för alla åtta partier, utan undantag.",
    prov: () =>
      (JSON.parse(repofil("handlingsvagen/data/parties.json")) as unknown[]).length === 8,
    fallprov: "Ta bort ett parti — provet faller.",
  },
  {
    id: "hv-neutralitet-beslutsloggen",
    sida: HV_NEUTRALITET,
    pastaende:
      "Loggen ligger öppet i kodförrådet, tillsammans med koden den beskriver.",
    // Meningen sade förut «Loggen är publik» — sant i den meningen att repot
    // är publikt, men ingen sida når den. Lydelsen är skärpt till vad som
    // gäller; provet mäter att loggen faktiskt finns och bär sina fält.
    prov: () => {
      const b = JSON.parse(repofil("handlingsvagen/data/beslutslogg.json")) as Array<{
        date?: string;
        why?: string;
        alternatives?: unknown[];
      }>;
      return b.length > 0 && b.every((p) => Boolean(p.date && p.why && p.alternatives));
    },
    fallprov:
      "Ta bort `why` ur en post — provet faller, för kontraktet lovar datum, skäl och förkastade alternativ.",
    matt: "39 poster, alla med datum, skäl och alternativ, 2026-08-09",
  },
  {
    id: "hv-neutralitet-ordagrant-bevis",
    sida: HV_NEUTRALITET,
    pastaende:
      "Räcker citatet inte till blir det ingen koppling, och rutan står tom.",
    prov: () => {
      const k = JSON.parse(repofil("handlingsvagen/data/kopplingar.json")) as Array<{
        status: string;
        bevis?: { citat?: string };
      }>;
      return k
        .filter((x) => x.status === "aktiv")
        .every((x) => (x.bevis?.citat ?? "").trim().length > 0);
    },
    fallprov: "Töm citatet på en aktiv koppling — provet faller.",
  },
  {
    id: "hv-neutralitet-program-raknar",
    sida: HV_NEUTRALITET,
    pastaende:
      "Ingen skriver ett omdöme för hand. Det räknas fram av ett program ur de kopplingar som godkänts",
    // Omdömena ska härledas ur kopplingarna. Pekar en dom på en koppling
    // som inte finns är den handskriven, vad den än påstår om sig själv.
    prov: () => {
      const kod = repofil("handlingsvagen/site/src/lib/data.ts");
      return kod.includes("getDomar") && kod.includes("getKopplingar");
    },
    fallprov:
      "Låt domarna läsas ur en egen handskriven fil utan kopplingar — provet faller.",
  },
  {
    id: "hv-neutralitet-franvaro",
    sida: HV_NEUTRALITET,
    pastaende: "vi räknar bara ja, nej och nedlagd röst",
    prov: () => {
      const kod = repofil("handlingsvagen/site/src/pages/metod.astro");
      return kod.includes("Frånvaro är därför sällan ett ställningstagande");
    },
    fallprov: "Ta bort frånvaroundantaget ur metodsidan — provet faller.",
  },
  {
    id: "metod-inriktning-bar-aldrig-belopp",
    sida: METOD,
    pastaende: "Det finns ingen åtgärd att räkna på, så beloppet är noll",
    // Meningen påstår att sorten och nollan hänger ihop. Det är just vad
    // provet i pipelinen mäter — en inriktning som bär ett basbelopp fäller
    // bygget. Utan den grinden vore meningen bara en avsikt.
    prov: () => {
      // Två halvor. Datat får inte bryta mot regeln, OCH grinden som håller
      // regeln måste finnas — annars vilar meningen på dagens tillstånd i
      // stället för på något som fångar morgondagens.
      const inriktningar = getPromises().filter((p) => p.loftestyp === "inriktning");
      const brott = inriktningar.filter((p) => p.cost.msek_base !== 0);
      const provet = repofil("pipeline/tests/loftestyp.test.ts");
      return (
        inriktningar.length > 0 &&
        brott.length === 0 &&
        provet.includes("ett inriktningslöfte bär aldrig ett basbelopp")
      );
    },
    fallprov: "Ge ett inriktningslöfte ett basbelopp skilt från noll — provet faller.",
    matt: "0 inriktningslöften med basbelopp 2026-08-22",
  },
  {
    id: "metod-varje-lofte-bar-en-sort",
    sida: METOD,
    pastaende:
      "Båda är löften. De är bara olika sorters löften, och vi märker ut vilken sort varje löfte är",
    prov: () => {
      const alla = getPromises();
      const utan = alla.filter(
        (p) => p.loftestyp !== "reform" && p.loftestyp !== "inriktning",
      );
      const schema = repofil("pipeline/schemas/promises.schema.json");
      return (
        alla.length > 0 &&
        utan.length === 0 &&
        // Sorten är obligatorisk i schemat, inte bara ifylld i dag.
        /"required":\s*\[[^\]]*"loftestyp"/u.test(schema)
      );
    },
    fallprov: "Ta bort loftestyp från ett löfte i promises.json — provet faller.",
  },
  {
    id: "metod-lanad-niva-namnger-sitt-ankare",
    sida: METOD,
    pastaende:
      "<strong>Då står det vilket löfte nivån är hämtad från, med en länk dit.</strong>",
    // Två halvor: fältet finns i datat och pekar på löften som existerar, och
    // löftessidan renderar det som en länk med det andra löftets rubrik.
    // Faller endera halvan är meningen osann.
    prov: () => {
      const alla = getPromises();
      const ids = new Set(alla.map((p) => p.id));
      const medAnkare = alla.filter((p) => (p.cost.anchor_ids ?? []).length > 0);
      const pekarRatt = medAnkare.every((p) =>
        (p.cost.anchor_ids ?? []).every((id) => ids.has(id)),
      );
      const sida = repofil("site/src/pages/lofte/[...path].astro");
      return (
        medAnkare.length > 0 &&
        pekarRatt &&
        sida.includes("lånat som riktmärke från") &&
        sida.includes("{a.title}")
      );
    },
    fallprov:
      "Ta bort ankarlänken ur löftessidan, eller låt ett anchor_ids peka på ett löfte som inte finns — provet faller.",
  },
  {
    id: "metod-samma-atgard-kostar-lika",
    sida: METOD,
    pastaende:
      "<strong>samma åtgärd ska kosta lika mycket oavsett vilket parti som lovar den.</strong>",
    // Prosan namnger poliserna som exempel, så provet mäter just dem: alla
    // partiers löften om fler poliser utan angivet antal ska bära samma
    // basbelopp. Glider ett av dem isär är meningen inte längre sann.
    prov: () => {
      const poliser = getPromises().filter(
        (p) =>
          p.status === "aktiv" &&
          p.group_id === "g-fler-poliser" &&
          p.cost.msek_base > 0,
      );
      if (poliser.length < 2) return false;
      const forsta = poliser[0].cost.msek_base;
      const lika = poliser.every((p) => p.cost.msek_base === forsta);
      // Regeln står i kostnadsprompten. Faller den är exemplet en tillfällighet.
      const prompt = repofil("pipeline/prompts/A5-cost.md");
      return (
        lika &&
        // Regeln står radbruten i prompten, så mellanslag normaliseras först.
        prompt.replace(/\s+/gu, " ").includes(
          "Samma åtgärd utan nivå ska prissättas lika oavsett vilket parti som lovar den.",
        )
      );
    },
    fallprov: "Ändra basbeloppet på ett av löftena om fler poliser — provet faller.",
    matt: "1 500 msek per år hos varje parti 2026-08-22",
  },
];

/** Ett besked är inte belagt utan sin källa; mätt så att prosan kan hänvisa. */
export function beskedMedArkivkopia(): { totalt: number; medKopia: number } {
  const alla = getStances().flatMap((c) => c.statements ?? []);
  return {
    totalt: alla.length,
    medKopia: alla.filter((s) => s.source?.archive_url).length,
  };
}

/** Antalet frågor Frågevågen följer — används av flera ankare. */
export function antalFragor(): number {
  return getIssuesFile().issues.length;
}
