/**
 * Nyckelordsindexet (b-0014, andra halvan) — deterministisk termutvinning
 * ur riksdagsdokumentens fulltexter.
 *
 * Indexet har två användningar: sajtens fritextsök över handlingar, och
 * kandidaturvalet i förslagssteget (som annars bara ser handlingens TITEL
 * och därför missar dokument vars innehåll gäller något annat än rubriken).
 *
 * Allt här är rena funktioner utan nätverk och utan språkmodell — samma
 * text ger alltid samma termer, och indexet är granskningsbart i
 * git-historiken. Fulltexterna hämtas vid indexbygget och lagras ALDRIG
 * (b-0014); det som checkas in är de utvunna termerna.
 *
 * Termerna lagras som ORDSTAMMAR (se stam.ts). Svensk böjning gör annars
 * att "bygga" och "byggas", "höja" och "höjas" räknas som skilda termer,
 * så ett löfte i en böjningsform aldrig möter ett dokument i en annan.
 * Löftets ord stammas på samma sätt vid jämförelsen.
 */
import { stamma, VOKALER } from "./stam.ts";

/**
 * Allmänna svenska stoppord. Korta ord (< 4 tecken) faller redan på
 * längdregeln, så listan tar det som är långt men innehållslöst.
 */
const STOPPORD = new Set([
  "att", "och", "det", "som", "för", "med", "till", "ska", "skall", "inte",
  "den", "de", "man", "har", "kan", "bör", "från", "om", "en", "ett", "är",
  "av", "på", "eller", "samt", "vår", "våra", "alla", "mer", "fler", "detta",
  "denna", "sig", "sina", "vara", "blir", "genom", "under", "över", "efter",
  "innan", "sedan", "även", "också", "andra", "annat", "sådan", "sådana",
  "samma", "varje", "vilket", "vilka", "vilken", "dessa", "deras", "sitt",
  "hans", "hennes", "något", "några", "ingen", "inget", "inga", "mycket",
  "många", "flera", "därför", "eftersom", "medan", "utan", "mellan", "både",
  "finns", "gäller", "göra", "gör", "ligger", "kommer", "skulle", "kunna",
  "måste", "behöver", "vill", "vilja", "bland", "hela", "helt", "olika",
  "stor", "stort", "stora", "större", "mindre", "bland", "enligt", "samt",
  "inom", "inklusive", "samtidigt", "dessutom", "exempelvis", "respektive",
  "omkring", "cirka", "samtliga", "delvis", "endast", "redan", "ännu",
  "alltid", "aldrig",
]);
// Medvetet INTE stoppord: "särskilt", "ytterligare", "stöd" m.fl. — de bär
// sakinnehåll i löftesspråket ("särskilt stöd till barn i riskzon").

/**
 * Riksdagens egen formelsvenska. Fraser som "Riksdagen ställer sig bakom
 * det som anförs i motionen och tillkännager detta för regeringen" står i
 * praktiskt taget varje motion — utan den här filtreringen ser alla
 * dokument likadana ut och termerna skiljer ingenting.
 *
 * Ordvikten (`idf` nedan) dämpar visserligen allmänna ord av sig själv,
 * men först efter att termen tagit plats i dokumentets topplista. Därför
 * rensas formelspråket redan vid utvinningen.
 */
const FORMELORD = new Set([
  "riksdagen", "riksdag", "riksdagens", "motion", "motionen", "motionens",
  "motionär", "motionärer", "motionärerna", "yrkande", "yrkanden", "yrkar",
  "tillkännager", "tillkännagivande", "tillkännagivandet", "anförs", "anför",
  "bakom", "ställer", "regeringen", "regering", "regeringens", "utskottet",
  "utskottets", "utskott", "proposition", "propositionen", "propositionens",
  "betänkande", "betänkandet", "beslut", "beslutar", "beslutat", "förslag",
  "förslaget", "föreslår", "föreslås", "avslår", "avslag", "bifaller",
  "bifall", "punkt", "punkten", "kapitel", "stycket", "lagen", "lag",
  "ändring", "ändringar", "därmed", "vidare", "således", "följande",
  "avseende", "gällande", "fråga", "frågan", "frågor", "svar", "svarar",
  "statsrådet", "minister", "ministern", "interpellation", "interpellationen",
  "votering", "voteringen", "kammaren", "ledamot", "ledamöter", "sverige",
  "svensk", "svenska", "svenskt", "landet", "arbete", "arbetet", "insatser",
  "åtgärder", "åtgärd", "behov", "möjlighet", "möjligheter", "syfte", "syftet",
]);

/** Ett dokuments utvunna termer, som de lagras i indexet. */
export interface DokumentTermer {
  /** Ordstammar, mest utmärkande först (filtrerade och avkortade). */
  t: string[];
  /**
   * Visningsform per stam, i samma ordning som `t`. Stammar är till för
   * att matcha, inte att läsa — "vårdplat" och "bost" säger en läsare
   * ingenting. Här ligger den vanligaste böjningsform ordet faktiskt hade
   * i dokumentet, så sajten kan visa "vårdplatser" i stället för stammen.
   */
  y?: string[];
  /** Totalt antal räknade ord i dokumentet — grov längdsignal. */
  n: number;
}

/** Indexskärva: handling-id → termer. */
export interface Skarva {
  version: 1;
  handlingar: Record<string, DokumentTermer>;
}

/**
 * Delar upp en text i ord enligt samma regler som förslagsstegets
 * kandidaturval (gemener, ≥ 4 tecken) så att löftets och dokumentets ord
 * är jämförbara.
 */
export function taOrd(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zåäöéü0-9-]+/u)
    .filter((w) => w.length >= 4);
}

/**
 * Räknar hur ofta varje TERMSTAM förekommer, efter stoppords- och
 * formelrensning.
 *
 * Stopporden filtreras på det oböjda ordet, inte på stammen. Det är
 * medvetet: stammar krockar ibland över ordgränser ("varor" och "vara"
 * ger båda "var"), och att sålla på stammen skulle då tysta ett
 * innehållsord för att ett funktionsord råkar dela stam. Böjda
 * funktionsord som slinker igenom dämpas ändå av ordvikten — de står i
 * nästan varje dokument och väger därför nära noll.
 */
export function raknaTermer(text: string): Map<string, number> {
  const räkning = new Map<string, number>();
  for (const [stam, former] of raknaTermerMedFormer(text)) {
    let summa = 0;
    for (const n of former.values()) summa += n;
    räkning.set(stam, summa);
  }
  return räkning;
}

/**
 * Som `raknaTermer`, men behåller vilka böjningsformer varje stam kom
 * ifrån och hur ofta — underlaget för en läsbar visningsform.
 */
export function raknaTermerMedFormer(
  text: string,
  namnord?: ReadonlySet<string>,
): Map<string, Map<string, number>> {
  const räkning = new Map<string, Map<string, number>>();
  for (const ord of taOrd(text)) {
    if (STOPPORD.has(ord) || FORMELORD.has(ord)) continue;
    if (namnord?.has(ord)) continue;
    if (/^[0-9-]+$/u.test(ord)) continue; // rena tal/bindestreck säger inget
    const stam = stamma(ord);
    const former = räkning.get(stam) ?? new Map<string, number>();
    former.set(ord, (former.get(ord) ?? 0) + 1);
    räkning.set(stam, former);
  }
  return räkning;
}

/**
 * Den form av ett ord som ska visas för en läsare: den vanligaste i
 * dokumentet, och vid lika antal den kortaste (närmast grundformen).
 */
export function visningsForm(former: Map<string, number>): string {
  return [...former.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0], "sv"),
  )[0]![0];
}

/**
 * Namnorden i ett dokuments egen undertecknarlista, som ska hållas utanför
 * termerna.
 *
 * En motion avslutas med sina undertecknare, en interpellation namnger sitt
 * statsråd. De namnen står i varje dokument personen skrivit under, och i
 * nästan inga andra — alltså precis det mönster ordvikten belönar högst.
 * Utan filtret blir ett partis mest utmärkande "ämnesord" dess egna
 * ledamöters efternamn, vilket säger en läsare ingenting om politiken.
 *
 * Filtret är avsiktligt smalt: bara namnen i DETTA dokument rensas, inte en
 * global namnlista. Ett ord som "strand" eller "berg" bär sakinnehåll och
 * ska finnas kvar överallt utom i de enstaka dokument där någon som heter så
 * råkar ha skrivit under.
 */
export function namnOrd(personer: readonly { name: string }[]): Set<string> {
  const ut = new Set<string>();
  for (const p of personer) for (const ord of taOrd(p.name)) ut.add(ord);
  return ut;
}

/**
 * Dokumentets mest utmärkande termer. Sorteringen är deterministisk:
 * frekvens fallande, därefter bokstavsordning — samma text ger alltid
 * samma lista, oavsett hur räkningen råkade byggas.
 *
 * `namnord` är dokumentets egna undertecknare (se `namnOrd`) och hålls
 * utanför termerna.
 */
export function utvinnTermer(
  text: string,
  max = 40,
  namnord?: ReadonlySet<string>,
): DokumentTermer {
  const medFormer = raknaTermerMedFormer(text, namnord);
  const valda = [...medFormer.entries()]
    .map(([stam, former]) => {
      let summa = 0;
      for (const n of former.values()) summa += n;
      return { stam, summa, former };
    })
    .sort((a, b) => b.summa - a.summa || a.stam.localeCompare(b.stam, "sv"))
    .slice(0, max);
  return {
    t: valda.map((v) => v.stam),
    y: valda.map((v) => visningsForm(v.former)),
    n: taOrd(text).length,
  };
}

/**
 * Skärvnyckel för ett handling-id (h-<år>-<nnnn>). Tusental ger ~24
 * skärvor för dagens ~23 600 handlingar — små nog att läsa selektivt,
 * få nog att inte dränka git-trädet. Okända id-former hamnar i "ovrigt".
 */
export function skarvaFor(handlingId: string): string {
  const m = handlingId.match(/^h-\d{4}-(\d+)$/u);
  if (!m) return "ovrigt";
  return String(Math.floor(Number(m[1]) / 1000)).padStart(2, "0");
}

/**
 * Ordvikt (idf): en term som står i nästan varje dokument skiljer
 * ingenting, en som står i få är utmärkande. Logaritmisk, så att en
 * halvering av förekomsten ger ett jämnt tillskott.
 */
export function ordvikt(antalDokMedTermen: number, antalDok: number): number {
  if (antalDokMedTermen <= 0) return 0;
  return Math.log(antalDok / antalDokMedTermen);
}

/** Antal dokument varje term förekommer i — underlaget för ordvikten. */
export function dokumentfrekvenser(
  index: Map<string, DokumentTermer>,
): Map<string, number> {
  const df = new Map<string, number>();
  for (const { t } of index.values()) {
    for (const term of new Set(t)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  return df;
}

/**
 * Poäng för hur väl ett dokuments termer möter en uppsättning måltermer
 * (löftets ord). Varje delad term bidrar med sin ordvikt, så att ett
 * ovanligt gemensamt ord väger tyngre än ett vanligt.
 */
export function termPoang(
  malTermer: Set<string>,
  dok: DokumentTermer,
  df: Map<string, number>,
  antalDok: number,
): number {
  let poäng = 0;
  for (const term of new Set(dok.t)) {
    if (!malTermer.has(term)) continue;
    poäng += ordvikt(df.get(term) ?? 1, antalDok);
  }
  return poäng;
}

/**
 * Slår ihop skärvor till ett uppslagsverk. Rena data in, rena data ut —
 * inläsningen från disk görs av anroparen (skript/sajt), inte här.
 */
export function slaIhopSkarvor(skarvor: Skarva[]): Map<string, DokumentTermer> {
  const index = new Map<string, DokumentTermer>();
  for (const s of skarvor) {
    for (const [id, termer] of Object.entries(s.handlingar)) index.set(id, termer);
  }
  return index;
}

/** Bygger det inverterade indexet (term → handling-id) för sajtens sök. */
export function inverteraIndex(
  index: Map<string, DokumentTermer>,
): Map<string, string[]> {
  const inv = new Map<string, string[]>();
  for (const [id, { t }] of index) {
    for (const term of new Set(t)) {
      const lista = inv.get(term) ?? [];
      lista.push(id);
      inv.set(term, lista);
    }
  }
  // Deterministisk ordning i varje stolpe.
  for (const lista of inv.values()) lista.sort();
  return inv;
}

/**
 * Stammar att söka på för ett inskrivet ord — sökningens sida av
 * stamningen.
 *
 * Snowballs svenska algoritm har två luckor som slår igenom just när en
 * läsare skriver in ett ord: bestämd ändelse på a-ord stryks inte
 * ("skolan" blir "skolan", medan "skolor" blir "skol"), och den
 * övertolkar ibland grundformen ("försvar" blir "försv", medan
 * "försvaret" blir "försvar"). Följden är att den form läsaren råkar
 * skriva avgör om träffen kommer — vilket vore godtyckligt.
 *
 * Därför prövas ordet i några närliggande former och alla deras stammar
 * söks. Det breddar bara INOM samma ord; flera sökord skär fortfarande
 * snittet. Att en variant inte finns i indexet kostar ingenting — den
 * ger noll träffar.
 *
 * Detta rör bara sökningen. Indexet lagrar en stam per ord som förr.
 */
export function sokStammar(ord: string): string[] {
  const bestamd = (w: string) => /(?:an|en|et)$/u.test(w);

  // Steg 1: grundformerna. Ordet som det skrevs, plus det ordet blir när en
  // bestämd ändelse avlägsnas.
  const baser = new Set<string>([ord]);
  if (ord.endsWith("an")) baser.add(ord.slice(0, -1)); // skolan → skola
  if (ord.endsWith("et")) baser.add(ord.slice(0, -2)); // försvaret → försvar
  if (ord.endsWith("en")) baser.add(ord.slice(0, -2)); // bilen → bil

  // Steg 2: samma regler framåt från varje grundform. Att gå åt BÅDA hållen
  // från samma grundformer är vad som gör sökningen symmetrisk — "vård" och
  // "vården" landar på samma mängd oavsett vilken läsaren skrev.
  //
  // Ändelser staplas aldrig: "kommunen" + "et" blir "kommunenet", vars stam
  // är "kommunen" — en påhittad stam som råkar krocka med indexet och gör
  // sökningen osymmetrisk igen. Och "et" bara efter konsonant; "skolaet" är
  // inget svenskt ord.
  const former = new Set<string>(baser);
  for (const bas of baser) {
    if (bestamd(bas)) continue;
    if (bas.endsWith("a")) former.add(`${bas}n`);
    else if (!VOKALER.has(bas.slice(-1))) former.add(`${bas}et`);
  }

  const stammar = new Set<string>();
  for (const form of former) {
    if (form.length >= 3) stammar.add(stamma(form));
  }
  return [...stammar].sort();
}
