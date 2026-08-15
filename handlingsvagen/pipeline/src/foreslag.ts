/**
 * Förslagssteget (HV2): språkmodellen läser ett löfte och ett
 * riksdagsdokument och får FÖRESLÅ en koppling med exakt citat.
 * Allt den föreslår prövas av grindarna H1–H5 (kod) och därefter av
 * en människa (H6). Modellen sätter aldrig domar och skriver aldrig data.
 *
 * Kandidaturvalet är deterministiskt (ordöverlapp) så att samma data
 * alltid ger samma kandidatlista — modellen väljer inte vad den får se.
 */

import type { Betankande } from "./betankanden.ts";
import { indexeraBetankanden } from "./betankanden.ts";
import { aktorsPartier, type Handling } from "./handlingar.ts";
import { taOrd, termPoang, type DokumentTermer } from "./nyckelord.ts";
import { stamma } from "./stam.ts";
import type { LlmClient } from "./llm.ts";
import type { Utskottspunkt, Yrkande } from "./riksdagen.ts";
import { provaGrindarna, type GrindFel, type GrindKontext, type KopplingsForslag } from "./grindar.ts";
import { motionensSlag } from "./yrkandeslag.ts";
import { fragansLydelser } from "./fragans-lydelse.ts";

/** Löftesfälten förslagssteget behöver (delmängd av valflask promises.json). */
export interface Lofte {
  id: string;
  title: string;
  quote: string;
  parties: string[];
  person?: string | null;
  category?: string;
  /** Varifrån löftet hämtades — bär dokument-id när källan är riksdagen. */
  source?: { url?: string | null } | null;
}

/**
 * Dokument-id:t i löftets källa, när löftet är hämtat UR ett
 * riksdagsdokument (t.ex. "HD024219" ur en motion).
 *
 * Ungefär ett löfte av sju kommer den vägen. Kopplas ett sådant löfte till
 * just det dokumentet svarar registret på frågan "höll partiet sitt löfte?"
 * genom att peka på papperet löftet stod skrivet på — citatet blir
 * ordagrant identiskt med löftescitatet, grindarna passerar, och läsaren
 * får veta ingenting. Handlingen ÄR löftet, inte ett agerande efter det.
 */
export function lofteskallaDokId(lofte: Lofte): string | null {
  const m = /data\.riksdagen\.se\/dokument\/([A-Za-z0-9]+)/u.exec(lofte.source?.url ?? "");
  return m ? m[1]! : null;
}

const STOPPORD = new Set([
  "att", "och", "det", "som", "för", "med", "till", "ska", "skall", "inte",
  "den", "det", "de", "vi", "man", "har", "kan", "bör", "från", "om", "en",
  "ett", "är", "av", "på", "i", "eller", "samt", "vår", "våra", "alla",
  "mer", "fler", "detta", "denna", "sig", "sina", "vara", "blir", "genom",
]);

/**
 * Ordstammar (ej stoppord) ur en text — deterministiskt. Stammarna gör att
 * böjningsformer möts: ett löfte som säger "höja" träffar ett dokument som
 * säger "höjas".
 *
 * Uppdelningen i ord görs av `taOrd` i `nyckelord.ts`, samma funktion som
 * dokumentens termer utvinns med. Det är inte en förenkling utan ett krav:
 * regeln för vilka ord som räknas måste vara EN, annars blir löftets ord
 * och dokumentets ord ojämförbara. Förut stod den skriven två gånger, och
 * en halv ändring hade slagit här — i vilka handlingar som alls kommer upp
 * för granskning — utan att synas i sökrutan man trodde man ändrade.
 *
 * Stopporden nedan är däremot förslagsstegets egna och avsiktligt en
 * kortare lista än indexets: här gäller det att hitta kandidater, inte att
 * beskriva ett dokuments ämne.
 */
export function nyckelord(text: string): Set<string> {
  return new Set(
    taOrd(text)
      .filter((w) => !STOPPORD.has(w))
      .map(stamma),
  );
}

export interface Kandidat {
  handling: Handling;
  poang: number;
}

/**
 * Nyckelordsindexet (b-0014): handling-id → dokumentets utvunna termer,
 * plus ordvikterna. Skickas in när det finns; utan det rankas bara på
 * titeln som förr.
 */
export interface TermIndex {
  termer: Map<string, DokumentTermer>;
  df: Map<string, number>;
  antalDok: number;
}

/**
 * Rankar dokumenthandlingar mot ett löfte. Voteringar utelämnas här — de
 * kopplas via betänkandetexten i ett senare steg.
 *
 * Utan index: ordöverlapp i TITELN, minst två gemensamma nyckelord.
 *
 * Med index (b-0014): dokumentets egna termer väger också in, viktade så
 * att ovanliga gemensamma ord räknas tyngre än vanliga. Titeln ensam är
 * en smal signal — en handling vars rubrik betonar en sak men vars
 * innehåll gäller en annan nådde tidigare aldrig rätt löfte (issue #174:
 * en motion om svensk krigssjukvård prövades bara mot Ukrainastöds-löftet
 * för att rubriken nämnde Ukraina). Urvalet förblir deterministiskt:
 * ingen modell är inblandad, samma data ger samma lista (b-0011).
 */
export function rankaKandidater(
  lofte: Lofte,
  handlingar: Handling[],
  max: number,
  index?: TermIndex,
): Kandidat[] {
  const mal = nyckelord(`${lofte.title} ${lofte.quote} ${lofte.category ?? ""}`);
  const kalla = lofteskallaDokId(lofte);
  const kandidater: Kandidat[] = [];
  for (const h of handlingar) {
    if (h.kind === "votering") continue;
    if (kalla && h.dok_id === kalla) continue; // löftets eget källdokument — cirkulärt
    // En proposition skrivs av ett departement och bär inget parti, så
    // aktörsgrinden fäller den alltid. Utan spärren här rankas den ändå som
    // kandidat och kostar ett modellanrop som aldrig kan leda någonstans —
    // 68 av de 645 par som återstod 2026-07-31 var av det slaget. Vägen till
    // regeringens handlingar går genom omröstningarna i stället.
    if (h.kind === "proposition") continue;
    // Aktörspartier, inte handling.parties: en fråga/interpellation bär
    // den tillfrågade ministerns parti i sin lista, men ministern är inte
    // aktör (samma spärr som H3).
    const aktorer = aktorsPartier(h);
    if (lofte.parties.length > 0 && aktorer.length > 0 && !lofte.parties.some((p) => aktorer.includes(p))) {
      continue; // fel aktör — H3 skulle ändå fälla
    }
    let titelTraffar = 0;
    for (const w of nyckelord(h.titel)) if (mal.has(w)) titelTraffar += 1;

    const dok = index?.termer.get(h.id);
    const textPoang = dok ? termPoang(mal, dok, index!.df, index!.antalDok) : 0;

    // Titelträffar väger som förr (ett poäng styck) och dokumentets
    // termer läggs till ovanpå. Tröskeln möts av två titelträffar SOM
    // FÖRR, eller — när indexet finns — av tillräckligt tung
    // textöverlappning. Utan index är beteendet oförändrat.
    const poang = titelTraffar + textPoang;
    if (titelTraffar >= 2 || (dok && textPoang >= TEXT_TROSKEL)) {
      kandidater.push({ handling: h, poang });
    }
  }
  return kandidater
    .sort((a, b) => b.poang - a.poang || a.handling.id.localeCompare(b.handling.id))
    .slice(0, max);
}

/**
 * Hur tung textöverlappningen måste vara för att ett dokument ska bli
 * kandidat på egen hand (utan två titelträffar).
 *
 * Kalibrerat mot den verkliga korpusen (~23 600 handlingar), där
 * ordvikten `ln(antalDok / antalDokMedTermen)` ger ungefär:
 *
 *   term i 1 dokument     ≈ 10,1     term i 1 000 dokument ≈ 3,2
 *   term i 100 dokument   ≈  5,5     term i 5 000 dokument ≈ 1,6
 *
 * Tröskeln 9 möts av en utpräglat ovanlig gemensam term plus en måttligt
 * vanlig (5,5 + 3,2), eller av tre måttligt vanliga. En enstaka sällsynt
 * term räcker inte. Det speglar avsiktligt titelregelns krav på minst två
 * gemensamma ord — samma tanke, tillämpad på dokumentets text.
 *
 * **Sänkt från 12 till 9 (mänskligt beslut 2026-08-05.)** Vid 12 hade 79 av
 * 467 aktiva löften aldrig prövats mot en enda handling. Orsaken var inte
 * att partierna saknade handlingar — vart och ett av de löftena hade mellan
 * 477 och 3 675 egna att pröva, och aktörsgränsen fällde inte ett enda av
 * dem. De låg strax under den här tröskeln: median 9,0 mot 12.
 *
 * Hela kurvan mättes torrt (inga modellanrop) över alla aktiva löften:
 *
 *   tröskel  fångar av de 80  nya par att pröva   par per fångat löfte
 *      12           1                  8                    —
 *      11          13                328                   27
 *      10          24                659                   30
 *       9          39               1034                   25
 *       8          49               1374                   34
 *       7          62               1723                   27
 *       6          73               2036                   28
 *       5          77               2236                   50
 *
 * Marginalkostnaden är påfallande jämn (25–34 par per räddat löfte) hela
 * vägen ner till 6, och skenar först vid 5. Valet av 9 styrs därför inte av
 * kurvan utan av två andra saker: den håller kvar principen om två
 * gemensamma ord (ett utmärkande plus ett vanligare), och de 1 034 nya
 * paren ryms i EN körning inom takets 300 minuter vid uppmätta ~4 par per
 * minut. Lägre trösklar spiller över flera dygn och släpper dessutom in par
 * som vilar på två ganska vanliga ord — och varje förslag som tar sig
 * igenom kostar en människas granskningstid, inte bara modellkvot.
 *
 * Kandidatlistan kapas ändå av `max` per löfte, så tröskeln styr bredden,
 * inte taket. Ska den omprövas: mät om kurvan först — den flyttar sig när
 * korpusen växer.
 */
export const TEXT_TROSKEL = 9;

/** En voteringskandidat: voteringen plus betänkandet vars text är källan. */
export interface VoteringsKandidat {
  handling: Handling;
  betankande: Betankande;
  poang: number;
}

/**
 * Rankar voteringar mot ett löfte på ordöverlapp i BETÄNKANDETS titel —
 * voteringens egen titel är bara beteckning och punkt. Samma deterministiska
 * regel som för dokument: minst två gemensamma nyckelord. Voteringar utan
 * betänkande i indexet utelämnas (tomt är ärligt); löftespartiet måste
 * förekomma i röstfördelningen — annars skulle H3 ändå fälla.
 */
export function rankaVoteringsKandidater(
  lofte: Lofte,
  handlingar: Handling[],
  betankanden: Betankande[],
  max: number,
): VoteringsKandidat[] {
  const index = indexeraBetankanden(betankanden);
  const mal = nyckelord(`${lofte.title} ${lofte.quote} ${lofte.category ?? ""}`);
  const kalla = lofteskallaDokId(lofte);
  const kandidater: VoteringsKandidat[] = [];
  for (const h of handlingar) {
    if (h.kind !== "votering") continue;
    const bet = index.get(h.dok_id);
    if (!bet) continue;
    // Källtexten för en voteringskoppling är BETÄNKANDETS, så cirkeln
    // uppstår om löftet självt är hämtat ur just det betänkandet.
    if (kalla && bet.dok_id === kalla) continue;
    const partier = h.rostfordelning ? Object.keys(h.rostfordelning) : [];
    if (lofte.parties.length > 0 && partier.length > 0 && !lofte.parties.some((p) => partier.includes(p))) {
      continue;
    }
    let poang = 0;
    for (const w of nyckelord(bet.titel)) if (mal.has(w)) poang += 1;
    if (poang >= 2) kandidater.push({ handling: h, betankande: bet, poang });
  }
  return kandidater
    .sort((a, b) => b.poang - a.poang || a.handling.id.localeCompare(b.handling.id))
    .slice(0, max);
}

/**
 * Motionstyp för ett förslag: riksdagens egen klassning (b-0015) i första
 * hand — den är facit. Saknas den (utgången motion m.m.) faller vi tillbaka
 * på en grov gissning ur antalet undertecknare. Granskaren kan alltid ändra.
 */
export function motionstypAvHandling(h: Handling): "parti" | "kommitte" | "enskild" | undefined {
  if (h.kind !== "motion") return undefined;
  if (h.motionstyp) return h.motionstyp;
  return h.persons.length > 1 ? "kommitte" : "enskild";
}

/** Modellens förväntade JSON-svar. */
export interface ForslagSvar {
  riktning: "stodjer" | "motverkar";
  citat: string;
  motivering: string;
  confidence: number;
}

/**
 * Läser riktningen ur svaret. Prompten ber om `stodjer` utan prickar, men
 * modellen stavar ibland svenska ordagrant ("stödjer") — samma svar, annan
 * stavning. Skillnaden är inte ett innehållsfel och får inte kosta ett par:
 * prickarna fälls in och skiftläge och blanktecken normaliseras innan
 * jämförelsen. Ett svar som betyder något annat faller fortfarande.
 */
function normaliseraRiktning(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const rensad = v.trim().toLowerCase().replace(/ö/gu, "o").replace(/ä/gu, "a").replace(/å/gu, "a");
  return rensad === "stodjer" || rensad === "motverkar" ? rensad : v;
}

/** Rensar ev. kodstaket och tolkar modellsvaret. null = ingen koppling. */
export function parseForslagSvar(raw: string): ForslagSvar | null {
  const utan = raw.replace(/^\s*```(?:json)?\s*/u, "").replace(/\s*```\s*$/u, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(utan);
  } catch {
    throw new Error(`ogiltigt JSON-svar: ${raw.slice(0, 120)}`);
  }
  const k = (parsed as { koppling?: unknown }).koppling;
  if (k === null || k === undefined) return null;
  const o = k as Record<string, unknown>;
  const riktning = normaliseraRiktning(o["riktning"]);
  const citat = o["citat"];
  const motivering = o["motivering"];
  const confidence = Number(o["confidence"]);
  if (riktning !== "stodjer" && riktning !== "motverkar") throw new Error(`okänd riktning i svaret: ${String(o["riktning"])}`);
  if (typeof citat !== "string" || typeof motivering !== "string") throw new Error("svaret saknar citat/motivering");
  return { riktning, citat, motivering, confidence: Number.isFinite(confidence) ? confidence : 0 };
}

/** Hur mycket av punktens beslutstext som får plats i prompten. */
const PUNKTTEXT_MAX = 1200;

export function byggPrompt(
  lofte: Lofte,
  handling: Handling,
  kalltext: string,
  betankande?: Betankande,
  punkt?: Utskottspunkt,
  yrkanden?: Yrkande[],
): string {
  return [
    `LÖFTE (${lofte.parties.join(", ").toUpperCase()}): ${lofte.title}`,
    `Exakt citat ur löfteskällan: "${lofte.quote}"`,
    "",
    `RIKSDAGSHANDLING (${handling.kind}, ${handling.datum}): ${handling.titel}`,
    ...(betankande
      ? [
          `Voteringen gällde punkt ${handling.punkt ?? "?"} i betänkandet ` +
            `${betankande.rm}:${betankande.beteckning} "${betankande.titel}". ` +
            "DOKUMENTTEXT nedan är betänkandets text — citatet ska stå där.",
        ]
      : []),
    // Punktens EGET beslut. Ett betänkande antar typiskt lagförslagen i
    // punkt 1 och avslår motioner i punkterna därefter; utan den här
    // upplysningen citeras gärna sammanfattningens beskrivning av
    // propositionen som bevis för en punkt som bara avslog motioner.
    ...(punkt
      ? [
          "",
          `DEN HÄR PUNKTEN — punkt ${punkt.punkt}: ${punkt.rubrik}`,
          `Punktens beslut: ${punkt.forslag.slice(0, PUNKTTEXT_MAX)}`,
          "VIKTIGT: beviset ska gälla DET beslutet, inte betänkandet i stort. " +
            "Avslår punkten bara motioner är det avslaget som är handlingen — " +
            "citera inte sammanfattningens beskrivning av lagförslagen som om " +
            "den vore vad den här punkten avgjorde. Räcker inte punktens egen " +
            "sak för att belägga löftet: svara att ingen koppling finns.",
        ]
      : []),
    // Motionens yrkanden — själva handlingen. Brödtexten argumenterar för
    // yrkandet; den är inte handlingen. Utan listan citerades gärna en
    // problembeskrivning ur brödtexten som bevis.
    ...(yrkanden && yrkanden.length > 0
      ? [
          "",
          `MOTIONENS YRKANDEN — DET HÄR ÄR HANDLINGEN (${yrkanden.length} st):`,
          ...yrkanden.map((y) => `  ${y.nummer}. ${y.lydelse}`),
          "VIKTIGT: citatet ska stå i ETT av yrkandena ovan. Brödtexten under " +
            "DOKUMENTTEXT argumenterar för yrkandena — den är inte handlingen, " +
            "och ett citat därifrån duger inte som bevis. Träffar inget yrkande " +
            "löftets sakfråga: svara att ingen koppling finns.",
        ]
      : []),
    "",
    "DOKUMENTTEXT:",
    kalltext,
  ].join("\n");
}

export interface ForslagResultat {
  forslag: KopplingsForslag | null;
  grindfel: GrindFel[];
}

/**
 * Betänkandets sammanfattning — utskottets egen redogörelse för vad det
 * föreslår, mellan rubrikerna "Sammanfattning" och "Utskottets förslag till
 * riksdagsbeslut". Hittas den inte blir svaret undefined.
 */
export function sammanfattning(kalltext: string): string | undefined {
  const m = /\bSammanfattning\b([\s\S]*?)\bUtskottets förslag till riksdagsbeslut\b/u.exec(kalltext);
  return m?.[1]?.trim() || undefined;
}

/** Antar punkten något, eller avslår den bara motioner? */
function punktenAntarNagot(punkt: Utskottspunkt): boolean {
  return /\bRiksdagen\s+(?:antar|godkänner|bifaller|anvisar|bemyndigar|fastställer|beslutar)\b/iu.test(punkt.forslag);
}

/**
 * Vilken del av dokumentet som ÄR handlingen, i den form H2 prövar mot.
 *
 * Voteringen går före: gäller paret en votering är källtexten betänkandets,
 * och då är punktens beslutstext handlingen — inte några yrkanden.
 *
 * **Punktens beslutstext räcker inte alltid.** En punkt som antar en
 * proposition lyder ofta bara "Riksdagen antar regeringens förslag till 1. lag
 * om ändring i lagen (1994:1776) om skatt på energi" — den visar att lagen
 * ändrades, inte åt vilket håll. Riktningen står i utskottets egen
 * sammanfattning: "Det innebär att energiskatten på bensin och diesel
 * tillfälligt sänks med 82 öre per liter." Propositionen ÄR underlaget till
 * voteringen, och sammanfattningen är utskottets redogörelse för vad punkten
 * antar — inte en beskrivning av något annat i ärendet.
 *
 * Därför öppnas sammanfattningen bara för en punkt som ANTAR något. Avslår
 * punkten bara motioner får sammanfattningen inte användas — då beskriver den
 * lagförslagen i en annan punkt, och det var precis det felet grinden kom
 * till för att stoppa (mänskligt beslut 2026-08-06).
 *
 * **En fråga har inga yrkanden, och det gjorde den osynlig för grinden.**
 * Handlingen är frågans egen lydelse — texten efter upptakten «…vill jag
 * fråga X:» — och den går att läsa ur källtexten. Därför krävs `slag`: utan
 * det går en interpellation inte att skilja från en motion vars yrkandelista
 * inte gick att hämta, och de två ska behandlas olika. Saknas slaget prövas
 * bara det ordagranna, som förut.
 */
export function byggHandlingstext(
  punkt?: Utskottspunkt,
  yrkanden?: Yrkande[],
  kalltext?: string,
  slag?: Handling["kind"],
): GrindKontext["handlingstext"] {
  if (punkt) {
    const delar = [punkt.forslag];
    const s = punktenAntarNagot(punkt) && kalltext ? sammanfattning(kalltext) : undefined;
    if (s) delar.push(s);
    return { sort: "beslutspunkt", delar };
  }
  if (yrkanden && yrkanden.length > 0) {
    const lydelser = yrkanden.map((y) => y.lydelse);
    // Brödtexten öppnas för en motion vars yrkanden bara anvisar medel enligt
    // en tabell — mänskligt beslut 2026-08-09, och samma form som
    // sammanfattningen ovan. Ett anslagsyrkande lyder «anvisar anslagen inom
    // utgiftsområde N enligt förslaget i tabell X» och godtar därför inget
    // citat alls: partiet skriver vad det faktiskt föreslår i brödtexten, och
    // hänvisningen till tabellen är just hur en budgetmotion begär det.
    // Grinden godkände förut ingenting ur de motionerna, vilket inte gjorde
    // beläggen bättre — det gjorde att de goda kopplingarna aldrig skapades.
    //
    // Villkoret är lika snävt som sammanfattningens: **bara** när yrkandena
    // uteslutande anvisar medel. Finns ett sakyrkande är det handlingen och
    // brödtexten är fortfarande argumentation för den; bär motionen bara
    // ramverksyrkanden pekas ingen enskild reform ut alls, och då öppnas
    // ingenting.
    if (motionensSlag(lydelser) === "bara_anslag" && kalltext) {
      return { sort: "yrkanden", delar: [...lydelser, kalltext], brodtextOppen: true };
    }
    return { sort: "yrkanden", delar: lydelser };
  }
  if ((slag === "interpellation" || slag === "skriftlig_fraga") && kalltext) {
    const lydelser = fragansLydelser(kalltext).map((f) => f.lydelse);
    // Hittas ingen frågelydelse vet vi inte var frågedelen börjar, och då ska
    // grinden inte gissa. Tom lista betyder «oprövat», precis som en
    // yrkandelista som inte gick att hämta — inte «citatet duger».
    if (lydelser.length > 0) return { sort: "frågans lydelse", delar: lydelser };
  }
  return undefined;
}

/**
 * Kör förslagssteget för ETT (löfte, handling)-par: fråga modellen, tolka
 * svaret, pröva grindarna. Källtexten skickas till både modellen och H2 —
 * samma text, samma sanning. För en votering är källtexten betänkandets
 * text: skicka med betänkandet, så bär beviset dess dok_id.
 */
export async function skapaForslag(
  llm: LlmClient,
  systemPrompt: string,
  model: string,
  lofte: Lofte,
  handling: Handling,
  kalltext: string,
  fonster: GrindKontext["fonster"],
  betankande?: Betankande,
  punkt?: Utskottspunkt,
  yrkanden?: Yrkande[],
): Promise<ForslagResultat> {
  const svar = parseForslagSvar(
    await llm.complete(byggPrompt(lofte, handling, kalltext, betankande, punkt, yrkanden), {
      systemPrompt,
      model,
      temperature: 0,
      responseFormat: { type: "json_object" },
    }),
  );
  if (!svar) return { forslag: null, grindfel: [] };

  const motionstyp = motionstypAvHandling(handling);
  const forslag: KopplingsForslag = {
    promise_id: lofte.id,
    handling_id: handling.id,
    riktning: svar.riktning,
    bevis: { citat: svar.citat, ...(betankande ? { kalla_dok_id: betankande.dok_id } : {}) },
    ...(motionstyp ? { motionstyp } : {}),
    method_note: svar.motivering,
    confidence: svar.confidence,
  };
  // Handlingens egen text, när vi har den: yrkandena för en motion, punktens
  // beslutstext för en votering, frågans lydelse för en interpellation eller
  // skriftlig fråga. H2 prövar att citatet står där och inte i brödtexten.
  // Saknas den prövas bara det ordagranna.
  const handlingstext = byggHandlingstext(punkt, yrkanden, kalltext, handling.kind);
  const grindfel = provaGrindarna(forslag, {
    handling,
    kalltext,
    malPartier: lofte.parties,
    fonster,
    ...(handlingstext ? { handlingstext } : {}),
  });
  return { forslag, grindfel };
}
