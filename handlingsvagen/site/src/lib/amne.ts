/**
 * Ämnessök och ordtrender (b-0014) — byggtidsmodellen bakom `/amnen`.
 *
 * Nyckelordsindexet (`data/nyckelord/`) bär dokumentens utvunna ordstammar.
 * Här skivas det till nyttolaster sajten kan hämta på begäran: ett
 * inverterat index (ordstam → handlingar) skärvat på ordets två första
 * tecken, och handlingarnas visningsdata skärvat på handling-id. 23 600
 * handlingar får aldrig plats i en enda nyttolast — budgetgrinden mäter.
 *
 * HEDERLIGHETEN: indexet SÖKER, det dömer aldrig. Att ett ord står i en
 * motion säger ingenting om huruvida partiet är för eller emot ett löfte.
 * "För/mot" kommer bara ur en godkänd koppling (som bär riktning) eller ur
 * en votering (som bär faktiska röster) — aldrig ur ordförekomst.
 *
 * Saknas indexet (workflowen inte körd än) returnerar allt tomt, och sidan
 * säger det rent ut i stället för att låtsas.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { aktorsPartier } from "../../../pipeline/src/handlingar.ts";
import {
  BETANKANDENYCKEL,
  type DokumentTermer,
  type Skarva,
} from "../../../pipeline/src/nyckelord.ts";
import { stamma } from "../../../pipeline/src/stam.ts";
import { partiMask, type Roster } from "./delat.ts";
import {
  getBetankanden,
  getHandlingMap,
  getKopplingar,
  getParties,
  getPersoner,
} from "./data.ts";

function indexKatalog(): string {
  return resolve(process.cwd(), "../data/nyckelord");
}

let _index: Map<string, DokumentTermer> | undefined;

/** Läser in nyckelordsindexets alla skärvor (en gång per bygge). */
export function getTermIndex(): Map<string, DokumentTermer> {
  if (_index) return _index;
  const katalog = indexKatalog();
  const index = new Map<string, DokumentTermer>();
  if (existsSync(katalog)) {
    for (const fil of readdirSync(katalog)) {
      if (!fil.endsWith(".json")) continue;
      const skarva = JSON.parse(readFileSync(resolve(katalog, fil), "utf8")) as Skarva;
      for (const [id, termer] of Object.entries(skarva.handlingar)) index.set(id, termer);
    }
  }
  _index = index;
  return index;
}

export function indexFinns(): boolean {
  return getTermIndex().size > 0;
}

/**
 * Bär indexet förkortningar ännu?
 *
 * Regeln som släpper in tvåställiga och treställiga versalord kom med
 * `b-0033`, men den syns först när indexet byggts om — och omindexeringen
 * tar timmar. Under tiden vore det fel att skriva på sidan att man kan söka
 * på NPF: sajten ska aldrig lova mer än datat bär.
 *
 * Kontrollen är billig och gör texten självrättande. Innan omkörningen är
 * klar står meningen inte där; efter den dyker den upp av sig själv vid
 * nästa bygge, utan att någon behöver komma ihåg att ändra tillbaka.
 */
export function forkortningarIIndexet(): boolean {
  const index = getTermIndex();
  for (const { t } of index.values()) {
    for (const term of t) {
      if (term.length <= 3 && /^[a-zåäöéü]+$/u.test(term) && KANDA_FORKORTNINGAR.has(term)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Stickprovet: förkortningar som bevisligen står i riksdagsmaterialet och
 * som INTE kan uppstå av att ett längre ord stammats ner — annars vore
 * svaret ja redan före omindexeringen.
 */
const KANDA_FORKORTNINGAR: ReadonlySet<string> = new Set([
  "npf", "lss", "sfi", "csn", "bnp", "hvb", "lvu", "eu",
]);

/** Skärvnyckel för en ordstam: två första tecknen, så varje hämtning blir liten. */
export function ordSkarva(stam: string): string {
  return stam.slice(0, 2) || "_";
}

/**
 * Alla ordskärvor som ska byggas (en JSON-fil per nyckel). Listan skickas
 * också med till sidan, så sökrutan kan låta bli att hämta skärvor som
 * inte finns — annars ger varje sökning på ett okänt ord ett 404 i
 * webbläsarkonsolen.
 */
export function ordSkarvor(): string[] {
  const nycklar = new Set<string>();
  for (const { t } of getTermIndex().values()) for (const stam of t) nycklar.add(ordSkarva(stam));
  return [...nycklar].sort();
}

/**
 * Hur många handlingar en ordstam som mest bär med sig i nyttolasten.
 * Ett ord som står i tiotusen dokument är ändå för brett för att bläddra
 * igenom — och listan skulle ensam spränga skärvan. Antalet redovisas
 * alltid i sin helhet, så läsaren ser att urvalet är ett urval.
 */
export const MAX_PER_ORD = 300;

/**
 * Hur många betänkanden en ordstam bär med sig. Betänkandena är få (drygt
 * 1 400 totalt) och driver röstsammanställningen, så de har ett eget tak —
 * annars trängs de undan av handlingarna, som är femton gånger fler.
 */
export const MAX_BET_PER_ORD = 250;

/**
 * En ordstams förekomster: hela antalet, och de senaste dokumenten.
 *
 * Handlingar och betänkanden hålls isär och kapas var för sig. Slogs de
 * ihop i en lista skulle kapningen ta bort betänkandena först — id:n
 * sorteras fallande som text, och `h-2026-…` ligger alltid före
 * `202526:…`. Röstfrågorna skulle då tyst sluta svara på vanliga ord.
 */
export interface OrdPost {
  /** totalt antal handlingar med ordet */ n: number;
  /**
   * Handlingarna, de senaste först. Ett tal betyder skärvans id-förled plus
   * talet (`12469` med förledet `h-2026-` är `h-2026-12469`); en sträng är
   * ett id som helhet. Förkortningen är ingen finess: id:n är den tyngsta
   * posten i skärvan, och `"h-2026-12469"` blir `12469`.
   */
  i: (number | string)[];
  /**
   * Handlingarnas aktörspartier, ett tvåsiffrigt hexatal per id i `i` och i
   * samma ordning. Ligger här — inte i handlingsskärvan — för att sidan ska
   * kunna filtrera på parti FÖRE den kapar träfflistan. Hämtades partierna
   * ur handlingsskärvorna skulle ett filter bara kunna gallra det som redan
   * visas, och då ljuger antalet.
   */
  p: string;
  /** totalt antal betänkanden med ordet */ bn: number;
  /** betänkandenycklar, de senaste först */ b: string[];
}

/** Handlingens partier som två hexsiffror — parallellt med `OrdPost.i`. */
function hexMask(koder: readonly string[]): string {
  return partiMask(koder).toString(16).padStart(2, "0");
}

/** En ordskärvas nyttolast: id-förledet en gång, och stammarnas förekomster. */
export interface OrdSkarva {
  /** gemensamt förled för de förkortade handlings-id:na */ pre: string;
  /** löpnumrets minsta bredd — id:n är nollfyllda (`h-2026-0868`) */ bredd: number;
  /** ordstam → förekomster */ o: Record<string, OrdPost>;
}

const FORLED = /^(h-\d{4}-)(\d+)$/u;

let _forled: { pre: string; bredd: number } | undefined;

/**
 * Förledet och löpnumrets bredd, om alla indexerade handlingar delar dem.
 *
 * Id:na är nollfyllda — `h-2026-0868` är inte `h-2026-868` — så talet ensamt
 * räcker inte för att skriva tillbaka id:t. Därför prövas hela vägen fram
 * och tillbaka för VARJE id här: går ett enda inte att återskapa exakt
 * lämnas förledet tomt och skärvan bär hela id-strängar i stället. Större
 * nyttolast, men aldrig fel — ett id som återskapas fel pekar ut en ANNAN
 * handling, och en sökträff som leder till fel dokument är värre än en
 * tung hämtning.
 */
function handlingsForled(): { pre: string; bredd: number } {
  if (_forled) return _forled;
  const forled = new Set<string>();
  let bredd = Number.POSITIVE_INFINITY;
  const ider: string[] = [];
  for (const id of getTermIndex().keys()) {
    const m = id.match(FORLED);
    if (!m) continue; // betänkanden ligger i sin egen lista
    forled.add(m[1]!);
    bredd = Math.min(bredd, m[2]!.length);
    ider.push(id);
  }
  const kandidat = { pre: forled.size === 1 ? [...forled][0]! : "", bredd: bredd || 0 };
  const gar = kandidat.pre !== "" && ider.every((id) => langtId(kortaId(id, kandidat), kandidat) === id);
  _forled = gar ? kandidat : { pre: "", bredd: 0 };
  return _forled;
}

/** Id:t förkortat till sitt löpnummer, när förledet stämmer. */
export function kortaId(id: string, forled: { pre: string; bredd: number }): number | string {
  if (!forled.pre || !id.startsWith(forled.pre)) return id;
  const rest = id.slice(forled.pre.length);
  return /^\d+$/u.test(rest) ? Number(rest) : id;
}

/** Löpnumret tillbaka till ett helt id — nollfyllningen måste följa med. */
export function langtId(kort: number | string, forled: { pre: string; bredd: number }): string {
  return typeof kort === "number"
    ? `${forled.pre}${String(kort).padStart(forled.bredd, "0")}`
    : kort;
}

/** Inverterat index för EN ordskärva: ordstam → förekomster. */
export function byggOrdSkarva(nyckel: string): OrdSkarva {
  const handlingar = getHandlingMap();
  const forled = handlingsForled();
  const ut = new Map<string, { h: string[]; b: string[] }>();
  for (const [id, { t }] of getTermIndex()) {
    const betankande = BETANKANDENYCKEL.test(id);
    for (const stam of new Set(t)) {
      if (ordSkarva(stam) !== nyckel) continue;
      const post = ut.get(stam) ?? { h: [], b: [] };
      (betankande ? post.b : post.h).push(id);
      ut.set(stam, post);
    }
  }
  const sorterat: Record<string, OrdPost> = {};
  for (const stam of [...ut.keys()].sort()) {
    // Id:n delas ut i skördeordning (stigande datum), så de sista är de
    // färskaste. Sorteras fallande och kapas — nyast är mest intressant.
    const post = ut.get(stam)!;
    const alla = post.h.sort().reverse();
    const visade = alla.slice(0, MAX_PER_ORD);
    const bet = post.b.sort().reverse();
    sorterat[stam] = {
      n: alla.length,
      i: visade.map((id) => kortaId(id, forled)),
      p: visade
        .map((id) => {
          const h = handlingar.get(id);
          // Saknas handlingen i registret vet vi inga partier — masken blir
          // tom, och ett partifilter släpper inte igenom den. Att gissa
          // partier för att träffen ska överleva filtret vore att hitta på.
          return h ? hexMask(aktorsPartier(h)) : "00";
        })
        .join(""),
      bn: bet.length,
      b: bet.slice(0, MAX_BET_PER_ORD),
    };
  }
  return { ...forled, o: sorterat };
}

/** Handlingens visningsdata i sökträffen — kort, för nyttolasten är stor. */
export interface HandlingKort {
  /** titel */ t: string;
  /** sort */ k: string;
  /** datum */ d: string;
  /** aktörspartier */ p: string[];
  /** utskott */ o?: string;
  /** riksdagens webbadress */ u: string;
}

/** Skärvnyckel för en handling — samma tusentalsindelning som indexet. */
export function handlingSkarva(id: string): string {
  const m = id.match(/^h-\d{4}-(\d+)$/u);
  if (!m) return "ovrigt";
  return String(Math.floor(Number(m[1]) / 1000)).padStart(2, "0");
}

export function handlingSkarvor(): string[] {
  const nycklar = new Set<string>();
  for (const id of getTermIndex().keys()) nycklar.add(handlingSkarva(id));
  return [...nycklar].sort();
}

export function byggHandlingSkarva(nyckel: string): Record<string, HandlingKort> {
  const handlingar = getHandlingMap();
  const ut: Record<string, HandlingKort> = {};
  for (const id of [...getTermIndex().keys()].sort()) {
    if (handlingSkarva(id) !== nyckel) continue;
    const h = handlingar.get(id);
    if (!h) continue;
    ut[id] = {
      t: h.titel,
      k: h.kind,
      d: h.datum,
      p: aktorsPartier(h),
      ...(h.organ ? { o: h.organ } : {}),
      u: h.url,
    };
  }
  return ut;
}

/** En voteringspunkt: när, hur det gick, och hur partierna röstade. */
export interface VoteringKort {
  /** punkt i betänkandet */ p: number;
  /** datum */ d: string;
  /** kammarens utfall: bifall eller avslag */ u: string;
  /** riksdagens webbadress */ url: string;
  /** parti → [ja, nej, avstår, frånvarande] */ r: Record<string, Roster>;
}

/** Ett betänkande med de voteringar kammaren höll om det. */
export interface BetankandeKort {
  /** titel */ t: string;
  /** utskott */ o: string;
  /** datum */ d: string;
  /** voteringspunkter, i punktordning */ v: VoteringKort[];
}

/** Röstskärvans nyckel: riksmötet ur betänkandenyckeln (`202223:SkU2`). */
export function voteringSkarva(nyckel: string): string {
  return nyckel.split(":")[0] || "ovrigt";
}

export function voteringSkarvor(): string[] {
  return [...new Set(Object.keys(byggAllaBetankanden()).map(voteringSkarva))].sort();
}

let _betKort: Record<string, BetankandeKort> | undefined;

/**
 * Betänkandena med sina voteringar, samlade en gång per bygge.
 *
 * Kopplingen är exakt, inte gissad: voteringens `dok_id` ÄR betänkandets
 * nyckel (`202223:SkU2`). Ett betänkande utan votering tas inte med — det
 * finns inget röstresultat att visa, och att lista det tomt vore att
 * antyda att kammaren röstat.
 */
function byggAllaBetankanden(): Record<string, BetankandeKort> {
  if (_betKort) return _betKort;
  const meta = new Map<string, ReturnType<typeof getBetankanden>[number]>(
    getBetankanden().map((b) => [`${b.rm.replace("/", "")}:${b.beteckning}`, b]),
  );
  const perBetankande = new Map<string, VoteringKort[]>();
  for (const h of getHandlingMap().values()) {
    if (h.kind !== "votering" || !h.rostfordelning || !h.dok_id) continue;
    const r: Record<string, Roster> = {};
    for (const [parti, f] of Object.entries(h.rostfordelning)) {
      r[parti] = [f.ja, f.nej, f.avstar, f.franvarande];
    }
    const lista = perBetankande.get(h.dok_id) ?? [];
    lista.push({ p: h.punkt ?? 0, d: h.datum, u: h.utfall ?? "", url: h.url, r });
    perBetankande.set(h.dok_id, lista);
  }
  const ut: Record<string, BetankandeKort> = {};
  for (const nyckel of [...perBetankande.keys()].sort()) {
    const b = meta.get(nyckel);
    const v = perBetankande.get(nyckel)!.sort((a, x) => a.p - x.p);
    ut[nyckel] = {
      // Är betänkandet inte skördat känner vi ändå voteringarna. Nyckeln
      // står som titel i stället för att hittas på.
      t: b?.titel ?? nyckel,
      o: b?.organ ?? "",
      d: b?.datum ?? v[0]?.d ?? "",
      v,
    };
  }
  _betKort = ut;
  return ut;
}

/** Röstskärva för ETT riksmöte: betänkandenyckel → betänkande med voteringar. */
export function byggVoteringSkarva(skarva: string): Record<string, BetankandeKort> {
  const ut: Record<string, BetankandeKort> = {};
  for (const [nyckel, kort] of Object.entries(byggAllaBetankanden())) {
    if (voteringSkarva(nyckel) === skarva) ut[nyckel] = kort;
  }
  return ut;
}

/**
 * De handlingar som HAR ett vägt utslag, och åt vilket håll. Bara dessa får
 * visa "stödjer/motverkar" i sökträffen — resten är dokument som råkar
 * innehålla ordet, ingenting annat.
 */
export function byggVagda(): Record<string, { riktning: string; lofte: string }> {
  const ut: Record<string, { riktning: string; lofte: string }> = {};
  for (const k of getKopplingar()) {
    if (k.status && k.status !== "aktiv") continue;
    ut[k.handling_id] = {
      riktning: k.riktning,
      lofte: k.promise_id ?? k.stance_id ?? "",
    };
  }
  return ut;
}

/** En parti-term i ordtrenden. */
export interface PartiOrd {
  stam: string;
  /** läsbar form — stammar som "vårdplat" säger en läsare ingenting */
  ord: string;
  /** antal handlingar från partiet där ordet står */
  antal: number;
  /**
   * Övervikt: hur många gånger oftare partiet använder ordet än de övriga
   * partierna tillsammans. 3 betyder tre gånger så ofta.
   */
  vikt: number;
}

export interface PartiTrend {
  kod: string;
  namn: string;
  /** antal handlingar med utvunna termer */
  handlingar: number;
  ord: PartiOrd[];
}

/**
 * Ordtrender per parti (b-0014): vilka ord ett parti använder MER än de
 * andra. Ingen modell, ingen tolkning — partiernas egna ord, räknade.
 *
 * Måttet är en ren jämförelse: andelen av partiets egna handlingar där
 * ordet står, delat med andelen av DE ÖVRIGA partiernas handlingar där det
 * står. Tre betyder att partiet använder ordet tre gånger så ofta som de
 * andra tillsammans.
 *
 * Att jämföra mot de övriga och inte mot hela materialet är avgörande för
 * att partierna ska gå att jämföra med varandra. S står för en tredjedel av
 * allt material, så S:s egna handlingar drar upp "snittet" och gör att S
 * knappt kan avvika från det — mot hela materialet toppade S på 2,8 gånger
 * medan KD nådde 18,7, vilket sade mer om partiernas storlek än om deras
 * politik. Mot övriga försvinner den snedvridningen.
 *
 * Ord som står i färre än `minAntal` av partiets handlingar utelämnas — de
 * säger mer om slumpen än om partiet. Nämnaren får ett påslag på ett så att
 * ett ord ingen annan använt ger ett stort men ändligt tal.
 */
/**
 * Ord som aldrig får stå som ett partis "ämne" — de säger något om hur
 * riksdagen skriver, inte om vad ett parti driver.
 *
 * Varför en andra lista, när utvinningen redan rensar formelspråk: de
 * listorna matchar på ORDFORMER ("avslår", "avslag"), medan indexet lagrar
 * ORDSTAMMAR. En böjning som inte råkar stå med i formlistan slinker
 * igenom, stammas, och dyker upp här. "avslå" och "avslås" är just sådana.
 * Den här listan är därför skriven på STAMMAR och fångar alla böjningar på
 * en gång — och den gör det utan att indexet behöver byggas om.
 *
 * Gränsdragningen är språklig, aldrig politisk:
 *
 *   · Ord om riksdagens FÖRFARANDE åker ut. Att ett parti ofta skriver
 *     "riksdagen bör avslå" är en följd av att det skriver många motioner,
 *     inte ett ämne det driver.
 *   · Ord UTAN sakinnehåll åker ut — "avgör", "däremot", "självklar".
 *   · Allt annat står kvar. Sakfrågor, platser, länder, och ord ett parti
 *     använder om sina motståndare rörs inte: att avgöra vad som är
 *     "riktig" politik vore precis den bedömning registret inte gör.
 *
 * Listan tillämpas lika på alla åtta partier. Ett ord som råkar vara
 * utmärkande för ett enda parti får aldrig läggas till här av det skälet.
 */
const INTE_AMNESORD: ReadonlySet<string> = new Set([
  // Riksdagens förfarande.
  "avslå", "avstyrk", "tillstyrk", "anfört", "återkomm", "ställ", "överväg",
  "utred", "utgiftsområd", "tillkännag", "yrkand", "bifall", "hemställ",
  // Ord utan sakinnehåll.
  "avgör", "byt", "däremot", "längr", "enkl", "beroend", "självkl",
  "intressant", "attraktivt", "fullkom", "olägen", "begångn", "fördyr",
  "dåtid", "poäng", "summ", "ändamål", "känn", "lik", "gör", "sats",
  "krång", "enhet", "flexibel", "system", "funktion", "egen", "mest",
]);

export function byggPartiTrender(maxOrd = 18, minAntal = 15): PartiTrend[] {
  const index = getTermIndex();
  const handlingar = getHandlingMap();
  const partinamn = new Map(getParties().map((p) => [p.code, p.namn]));

  // Hur många handlingar varje ord står i, totalt och per parti.
  const globalDf = new Map<string, number>();
  const perParti = new Map<string, Map<string, number>>();
  const antalPerParti = new Map<string, number>();
  // Vanligaste visningsformen per stam, räknad över hela materialet.
  const formRakning = new Map<string, Map<string, number>>();

  for (const [id, { t, y }] of index) {
    const h = handlingar.get(id);
    if (!h) continue;
    const stammar = new Set(t);
    t.forEach((stam, i) => {
      const form = y?.[i];
      if (!form) return;
      const k = formRakning.get(stam) ?? new Map<string, number>();
      k.set(form, (k.get(form) ?? 0) + 1);
      formRakning.set(stam, k);
    });
    for (const stam of stammar) globalDf.set(stam, (globalDf.get(stam) ?? 0) + 1);
    for (const parti of aktorsPartier(h)) {
      if (!partinamn.has(parti)) continue;
      antalPerParti.set(parti, (antalPerParti.get(parti) ?? 0) + 1);
      const karta = perParti.get(parti) ?? new Map<string, number>();
      for (const stam of stammar) karta.set(stam, (karta.get(stam) ?? 0) + 1);
      perParti.set(parti, karta);
    }
  }

  // Ledamöternas FÖRNAMN hålls utanför trenderna. Ett dokuments egna
  // undertecknare rensas redan vid utvinningen, men politiker nämns också i
  // VARANDRAS texter — Socialdemokraterna skriver om Jimmie Åkesson, och
  // "jimmie" blev därmed ett av S:s mest utmärkande ord. Att peka ut en
  // motståndares förnamn som ett partis ämne säger ingenting om politiken.
  //
  // Bara förnamn, och bara här. Efternamn krockar med sakord ("Strand",
  // "Berg", "Lind") och får inte tystas globalt. Och namnen rensas inte ur
  // indexet: att SÖKA på en politiker är en rimlig sak att vilja göra —
  // det är att presentera namnet som ett ämne som är fel.
  const fornamn = new Set<string>();
  for (const p of getPersoner()) {
    const forsta = p.namn.trim().split(/\s+/u)[0]?.toLowerCase();
    if (forsta && forsta.length >= 4) fornamn.add(stamma(forsta));
  }

  const antalDok = index.size;
  const trender: PartiTrend[] = [];
  for (const [kod, namn] of partinamn) {
    const karta = perParti.get(kod);
    const partiTotalt = antalPerParti.get(kod) ?? 0;
    if (!karta || partiTotalt === 0) {
      trender.push({ kod, namn, handlingar: 0, ord: [] });
      continue;
    }
    const ord: PartiOrd[] = [];
    const ovrigaTotalt = antalDok - partiTotalt;
    for (const [stam, antal] of karta) {
      if (antal < minAntal) continue;
      if (fornamn.has(stam)) continue;
      if (INTE_AMNESORD.has(stam)) continue;
      // Partiets andel delat med de övrigas andel av samma ord.
      const iOvriga = (globalDf.get(stam) ?? antal) - antal;
      const andel = antal / partiTotalt;
      const andelOvriga = (iOvriga + 1) / (ovrigaTotalt + 1);
      const vikt = andel / andelOvriga;
      const former = formRakning.get(stam);
      const visning = former
        ? [...former.entries()].sort(
            (a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0], "sv"),
          )[0]![0]
        : stam;
      ord.push({ stam, ord: visning, antal, vikt });
    }
    ord.sort((a, b) => b.vikt - a.vikt || a.stam.localeCompare(b.stam, "sv"));
    trender.push({ kod, namn, handlingar: partiTotalt, ord: ord.slice(0, maxOrd) });
  }
  trender.sort((a, b) => a.kod.localeCompare(b.kod, "sv"));
  return trender;
}
