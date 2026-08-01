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
import { termPoang, type DokumentTermer } from "./nyckelord.ts";
import { stamma } from "./stam.ts";
import type { LlmClient } from "./llm.ts";
import type { Utskottspunkt } from "./riksdagen.ts";
import { provaGrindarna, type GrindFel, type GrindKontext, type KopplingsForslag } from "./grindar.ts";

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
 * Ordstammar (gemener, ≥ 4 tecken, ej stoppord) ur en text —
 * deterministiskt. Stammarna gör att böjningsformer möts: ett löfte som
 * säger "höja" träffar ett dokument som säger "höjas". Samma reduktion
 * används när dokumentens termer utvinns till nyckelordsindexet, så att
 * de två sidorna är jämförbara.
 */
export function nyckelord(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-zåäöéü0-9-]+/u)
      .filter((w) => w.length >= 4 && !STOPPORD.has(w))
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
 * Tröskeln 12 kräver därmed ETT AV: två utpräglat ovanliga gemensamma
 * termer, eller fyra måttligt vanliga. En enstaka sällsynt term räcker
 * inte. Det speglar avsiktligt titelregelns krav på minst två
 * gemensamma ord — samma tanke, tillämpad på dokumentets text.
 *
 * Lägre tröskel fångar fler äkta kopplingar men kostar modellkvot på
 * fler par; högre missar fall som #174. Kandidatlistan kapas ändå av
 * `max` per löfte, så tröskeln styr bredden, inte taket.
 */
export const TEXT_TROSKEL = 12;

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
): Promise<ForslagResultat> {
  const svar = parseForslagSvar(
    await llm.complete(byggPrompt(lofte, handling, kalltext, betankande, punkt), {
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
  const grindfel = provaGrindarna(forslag, {
    handling,
    kalltext,
    malPartier: lofte.parties,
    fonster,
  });
  return { forslag, grindfel };
}
