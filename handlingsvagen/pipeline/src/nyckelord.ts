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

/**
 * Ord utan sakinnehåll — det som blir kvar när formelfraserna rensats men
 * prosan fortfarande inte säger vad texten HANDLAR om.
 *
 * Fulltexterna avslöjade behovet: de vanligaste termerna i hela materialet
 * var "anledning" (22 %), "avser" (22 %), "viktig" (19 %), "använda" (18 %).
 * Ett ämnesregister ska kunna svara på vad partierna sagt om skolan,
 * försvaret eller npf — inte visa att alla partier tycker att saker är
 * viktiga.
 *
 * Listan bär ORDFORMER, inte stammar, av samma skäl som stopporden: stammar
 * krockar över ordgränser. "viktig/viktigt/viktiga" delar stam med
 * substantivet "vikt", och att sålla på stammen skulle tysta båda. Därför
 * står böjningsformerna utskrivna, valda ur de former som faktiskt
 * förekommer i materialet.
 *
 * Gränsen går vid om någon skulle SÖKA på ordet. "arbetare" och "bidrag"
 * bär sakinnehåll och står kvar; verben "arbeta" och "bidra" gör det inte.
 */
const TOMORD = new Set([
  // "med anledning av prop. …" — följdmotionernas standardinledning
  "anledning", "anledningen", "anledningar", "anledningarna",
  "bakgrund", "bakgrunden", "motivering", "motiveringen",
  // interpellationernas och frågornas formel: "vad avser statsrådet …"
  "avser", "avses", "avse", "anser", "anses", "anse",
  // utskottsspråk (procedur, inte politik)
  "avstyrker", "avstyrkt", "avstyrkte", "avstyrktes", "tillstyrker",
  "avvisar", "avvisa", "avvisas", "avvisade", "avvisades", "avvisat",
  "sammantaget", "anslagsförslag", "anslagsfördelning", "riksdagsbeslut",
  "anförande", "anföranden", "anförandet",
  // allmänna omdömen och modalord
  "viktig", "viktigt", "viktiga", "viktigare", "viktigaste",
  "bättre", "bäst", "bästa", "borde", "bör", "krävs", "kräver",
  "betydande", "betydelse", "betydelsen", "betydligt", "betyder",
  "avgörande", "avgöra", "avgörs", "avgöras",
  "allvarlig", "allvarligt", "allvarliga", "allvarligare", "allvarligaste",
  "behövs", "behöva", "behövas", "behovet", "behoven",
  "förutsättningar", "förutsättningarna", "förutsättning", "förutsättningen",
  // allmänna verb utan riktning i sak
  "använda", "används", "användas", "använder", "använts",
  "innebär", "innebära", "bidra", "bidrar", "skapa", "skapar", "skapas",
  "agera", "agerar", "agerat", "agerande", "överväga", "överväger",
  "arbeta", "arbetar", "arbetat", "arbetade", "arbetas",
  // allmänna mängd-, tids- och pekord
  "allt", "alltmer", "annan", "annans", "båda", "bara", "dock", "fram",
  "idag", "dagens", "dags", "dagar", "dagen", "dagligen", "fall",
  "antalet", "antal", "delar", "dels", "dela", "delas", "delat",
  "sätt", "sätta", "sätter", "exempel", "härav", "därtill", "således",
]);

/**
 * Partinamnen. Ett parti nämner sig självt i sina egna dokument och nästan
 * ingen annan gör det, så namnet blir partiets mest "utmärkande ord" —
 * "vänsterpartiet" låg 10 000 gånger över de övrigas användning. Det säger
 * bara vem som skrivit dokumentet, vilket registret redan vet.
 *
 * Att söka fram ett visst partis handlingar är ett FILTER på parti, inte en
 * sökning på ett ord.
 */
const PARTINAMN = new Set([
  "socialdemokraterna", "socialdemokratiska", "socialdemokrat",
  "socialdemokrater", "moderaterna", "moderata", "moderat", "moderater",
  "sverigedemokraterna", "sverigedemokratiska", "sverigedemokrat",
  "sverigedemokrater", "centerpartiet", "centerpartiets", "centerpartist",
  "centerpartister", "vänsterpartiet", "vänsterpartiets", "vänsterpartist",
  "vänsterpartister", "kristdemokraterna", "kristdemokratiska",
  "kristdemokrat", "kristdemokrater", "liberalerna", "liberala", "liberal",
  "miljöpartiet", "miljöpartiets", "miljöpartist", "miljöpartister",
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
 * Partiernas bokstavskoder. Samma skäl som `PARTINAMN` ovan: koden säger
 * vem som skrivit dokumentet, inte vad det handlar om, och ett parti är
 * nästan ensamt om att skriva ut sin egen. Att söka fram ett partis
 * handlingar är ett filter på parti, inte en sökning på ett ord.
 *
 * De behövs för att förkortningsregeln nedan annars släpper in dem: `SD`,
 * `KD` och `MP` skrivs i versaler och är två–tre tecken. Mätt på 250
 * dokument stod de tre för 231 av 1 748 versalförekomster — var åttonde.
 * Enbokstavskoderna faller redan på tvåteckensgolvet men står med för att
 * listan ska vara läsbar som helhet.
 */
const PARTIKODER = new Set(["s", "m", "sd", "c", "v", "kd", "l", "mp"]);

/**
 * Korta svenska ord som kan stå i versaler utan att vara förkortningar —
 * en versal rubrik ("UR DEBATTEN") räcker för att de ska slinka igenom.
 *
 * Listan är kort med flit: mätt på 250 riktiga dokument var det bara `ur`
 * (7 förekomster) och `nu` (1) av 1 748 versalförekomster som var vanliga
 * ord. Versala rubriker är alltså sällsynta i materialet. Resten av listan
 * är sådant som rimligen kan dyka upp i en rubrik, inte en spekulation om
 * att det redan gör det.
 */
const KORTA_SMAORD = new Set([
  "ur", "nu", "så", "om", "av", "en", "ett", "är", "och", "att", "på", "de",
  "vi", "ni", "han", "hon", "kan", "har", "men", "ska", "för", "som", "det",
  "den", "vid", "mot", "åt", "ej", "ge", "se", "var", "vad", "där", "här",
  "hur", "än", "du", "jag", "mig", "dig", "sig", "med", "din", "min", "vår",
  "er", "ju", "bli", "blir", "dess", "ur",
]);

/**
 * Delar upp en text i ord enligt samma regler som förslagsstegets
 * kandidaturval, så att löftets och dokumentets ord är jämförbara.
 * `foreslag.ts` anropar den här funktionen — regeln finns på ett ställe.
 *
 * Grundregeln är ord på minst fyra tecken. **Undantaget är förkortningar:**
 * ett ord på två eller tre tecken släpps igenom om det står i VERSALER i
 * källtexten. Nästan varje svensk politikförkortning är precis tre
 * bokstäver — NPF, LSS, SFI, CSN, BNP, VAB, HVB, LVU, IVO, HFD, TLV — och
 * utan undantaget kunde ingen av dem sökas fram, hur ofta de än stod i
 * texten.
 *
 * Därför läses versalerna FÖRE `toLowerCase()`. Att göra tvärtom var vad
 * som gjorde det omöjligt förut: informationen som beslutet vilar på var
 * redan bortkastad när beslutet fattades.
 *
 * Fyrateckensgolvet står kvar för gemena ord, och av samma skäl som förut:
 * utan det fylls termlistorna av småord. Versalkravet är det som håller
 * dörren stängd för dem — ett vanligt ord skrivs inte i versaler.
 *
 * Inledande och avslutande bindestreck skalas av, så att "EU-" i "EU- och
 * utrikespolitiken" räknas som samma ord som "EU".
 */
export function taOrd(text: string): string[] {
  const ut: string[] = [];
  for (const rått of text.split(/[^A-Za-zÅÄÖÉÜåäöéü0-9-]+/u)) {
    const ord = rått.replace(/^-+|-+$/gu, "");
    if (ord.length === 0) continue;
    const gemen = ord.toLowerCase();
    if (gemen.length >= 4) {
      ut.push(gemen);
      continue;
    }
    if (gemen.length < 2) continue;
    if (ord !== ord.toUpperCase()) continue; // bara ord skrivna helt i versaler
    if (!/[A-ZÅÄÖÉÜ]/u.test(ord)) continue; // minst en bokstav; rena tal säger inget
    if (PARTIKODER.has(gemen) || KORTA_SMAORD.has(gemen)) continue;
    ut.push(gemen);
  }
  return ut;
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
    if (TOMORD.has(ord) || PARTINAMN.has(ord)) continue;
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
  // Betänkandena ligger i en egen skärva. De är inte handlingar utan
  // textkällan bakom voteringarna: en votering har ingen egen text, dess
  // sak står i betänkandet som röstningen gällde. Nyckeln är densamma som
  // voteringens dok_id ("202223:SkU2"), så de möts utan mellanled.
  if (BETANKANDENYCKEL.test(handlingId)) return "bet";
  const m = handlingId.match(/^h-\d{4}-(\d+)$/u);
  if (!m) return "ovrigt";
  return String(Math.floor(Number(m[1]) / 1000)).padStart(2, "0");
}

/** Nyckelform för ett betänkande: riksmöte utan snedstreck, kolon, beteckning. */
export const BETANKANDENYCKEL = /^\d{6}:[A-ZÅÄÖ][A-Za-zÅÄÖåäö]*\d+$/u;

/** Betänkandets nyckel ur riksmöte och beteckning ("2022/23" + "SkU2"). */
export function betankandeNyckel(rm: string, beteckning: string): string {
  return `${rm.replace("/", "")}:${beteckning}`;
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

  // Två tecken räcker: förkortningar indexeras från den längden (se `taOrd`),
  // och `EU` ska gå att söka på. `stamma()` lämnar så korta ord orörda.
  const stammar = new Set<string>();
  for (const form of former) {
    if (form.length >= 2) stammar.add(stamma(form));
  }
  return [...stammar].sort();
}
