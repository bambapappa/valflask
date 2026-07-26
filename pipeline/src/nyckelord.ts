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
 * KÄND BEGRÄNSNING — ingen ordstamsreducering. Svensk böjning gör att
 * "bygga" och "byggas", "höja" och "höjas" räknas som skilda termer, så
 * ett löfte som säger den ena formen möter inte ett dokument som säger
 * den andra. Det sänker träffsäkerheten men aldrig hederligheten: en
 * missad kandidat blir en tom cell, aldrig en felaktig koppling. Att
 * införa stamreducering (Snowball för svenska) är en avvägning mellan
 * bättre täckning och risken att skilda ord slås ihop — ett eget beslut,
 * inte något som ska smygas in här.
 */

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
  /** Termer, mest utmärkande först (redan filtrerade och avkortade). */
  t: string[];
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

/** Räknar hur ofta varje term förekommer, efter stoppords- och formelrensning. */
export function raknaTermer(text: string): Map<string, number> {
  const räkning = new Map<string, number>();
  for (const ord of taOrd(text)) {
    if (STOPPORD.has(ord) || FORMELORD.has(ord)) continue;
    if (/^[0-9-]+$/u.test(ord)) continue; // rena tal/bindestreck säger inget
    räkning.set(ord, (räkning.get(ord) ?? 0) + 1);
  }
  return räkning;
}

/**
 * Dokumentets mest utmärkande termer. Sorteringen är deterministisk:
 * frekvens fallande, därefter bokstavsordning — samma text ger alltid
 * samma lista, oavsett hur räkningen råkade byggas.
 */
export function utvinnTermer(text: string, max = 40): DokumentTermer {
  const räkning = raknaTermer(text);
  const t = [...räkning.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "sv"))
    .slice(0, max)
    .map(([term]) => term);
  return { t, n: taOrd(text).length };
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
