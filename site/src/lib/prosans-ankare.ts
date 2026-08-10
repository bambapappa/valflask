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
    // Grinden är raden i index.ts som skickar VARJE llm_estimat till kön.
    // Prosan vilar på att villkoret inte snävas in.
    prov: () => {
      const kod = repofil("pipeline/src/index.ts");
      return /cost\.basis === "llm_estimat"[\s\S]{0,40}reviewItems\.push|if \(cost\.basis === "llm_estimat" \|\| cost\.confidence < 0\.6\)/u.test(
        kod,
      );
    },
    fallprov:
      "Ändra villkoret till att bara låg confidence går till kön — provet faller, och 438 gissade belopp hade kunnat publiceras oläst.",
    matt: "438 av 553 aktiva löften har basis llm_estimat 2026-08-09",
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
    // Baksidan av samma mynt: meningen är sann bara så länge INGEN andra
    // modell läser beloppet. Bygger någon en sådan kontroll ska texten
    // uppdateras — det vore en förbättring, men prosan skulle bli osann.
    prov: () => {
      const kod = repofil("pipeline/src/index.ts");
      return kod.includes("estimateCost(accepted, ctx.llm, ctx.models.extract");
    },
    fallprov:
      "Låt estimateCost köra på ctx.models.verify — provet faller, och meningen ska då skrivas om.",
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
    id: "metod-avskriften-sparas-inte",
    sida: METOD,
    pastaende: "<strong>Textversionen sparar vi inte.</strong>",
    // Ovanligt ankare: det vaktar en INRÖMMELSE. Börjar vi spara avskrifter
    // ska sidan sluta be om ursäkt för att vi inte gör det.
    prov: () =>
      aktiva().every(
        (p) => !(p.source as { transcript_url?: string }).transcript_url,
      ),
    fallprov:
      "Sätt transcript_url på ett löfte — provet faller, och meningen ska skrivas om till det bättre.",
    matt: "0 av 553 bar transcript_url 2026-08-09",
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
    // Mätt 2026-08-09: 16 av 553 saknade en, 14 av dem filmer. Provet vaktar
    // att luckan förblir liten och nästan bara gäller talade källor — växer
    // den bland vanliga webbsidor är «nästan varje» inte längre sant.
    prov: () => {
      const a = aktiva();
      const utan = a.filter((p) => !p.source.archive_url);
      return utan.length / a.length < 0.05 &&
        utan.filter((p) => p.source.kind !== "tal").length <= 2;
    },
    fallprov:
      "Nolla archive_url på tio webbkällor — provet faller på att luckan inte längre är nästan bara filmer.",
    matt: "16 av 553 utan kopia, varav 14 filmer, 2026-08-09",
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
    id: "metod-kronikorna-pausade",
    sida: METOD,
    pastaende:
      "Genereringen är för närvarande pausad medan vi bygger om hur siffrorna i dem hålls färska.",
    // Fälls flaggan utan att meningen skrivs om står det «pausad» om något
    // som körs. Precis den sortens åldrande registret finns för.
    prov: () =>
      /export const KRONIKOR_PAUSADE = true;/u.test(
        repofil("pipeline/src/chronicle.ts"),
      ),
    fallprov: "Sätt KRONIKOR_PAUSADE till false — provet faller, som det ska.",
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
    id: "metod-fyra-av-fem-prislappar",
    sida: METOD,
    pastaende:
      "<strong>Fyra av fem prislappar, och texten som förklarar dem.</strong>",
    // Andelen står i klartext på sidan och är ett påstående om datat. Den var
    // «de flesta» förut, vilket bär allt mellan 51 och 99 procent.
    prov: () => {
      const a = aktiva();
      const andel = a.filter((p) => p.cost?.basis === "llm_estimat").length / a.length;
      return andel >= 0.7 && andel < 0.9;
    },
    fallprov:
      "Sätt basis till granskare på hälften av löftena — provet faller, och «fyra av fem» ska då skrivas om.",
    matt: "438 av 553 = 79 % 2026-08-09",
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
    prov: () => {
      const wf = repofil(".github/workflows/review-apply.yml");
      return (
        wf.includes("apply-labeled-decisions.mts") &&
        wf.includes("startsWith(github.event.label.name, 'beslut:')")
      );
    },
    fallprov:
      "Låt review-apply köra utan etikettvillkoret — provet faller, och då kan datat ändras utan ett mänskligt beslut.",
  },
  {
    id: "metod-sparren-vad-den-inte-ar",
    sida: METOD,
    pastaende:
      "Det ska sägas lika rakt vad spärren <em>inte</em> är: sajten byggs om automatiskt",
    // Inrömmelsen ska stå kvar så länge robotar skriver till kodförrådet.
    // Slutar de göra det ska texten skrivas om till det bättre — och då
    // faller provet och tvingar fram omskrivningen.
    prov: () => {
      const wf = repofil(".github/workflows/rot-watch.yml");
      return wf.includes("git push") && wf.includes("utlovat-bot");
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
        "changelog", "issues", "stances", "integrity",
      ];
      return filer.every((f) => {
        const kod = repofil(`${dir}/${f}.json.ts`);
        return kod.includes("generated_at") && kod.includes("data_hash");
      });
    },
    fallprov:
      "Ta bort data_hash ur issues.json.ts — provet faller, precis som det gjorde 2026-08-09.",
    matt: "8 av 8 bär båda efter rättelsen",
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
