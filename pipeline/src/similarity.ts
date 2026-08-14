/**
 * Lättviktig dublett-heuristik (§5.3-anda). Flaggar TROLIGA dubletter — t.ex. ett
 * partipressmeddelande och en tidning som skriver om samma löfte — för manuell
 * granskning. Slår aldrig ihop automatiskt; människan länkar (delad group_id) i review.
 */

export interface ExistingPromiseLite {
  id: string;
  title: string;
  parties: string[];
  category: string;
  group_id: string | null;
  /** Citatet löftet vilar på — nyckeln i den exakta dublettkollen nedan. */
  quote: string;
}

export interface DupKey {
  title: string;
  parties: string[];
  category: string;
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFC")
      .replace(/[^a-z0-9åäöéèü ]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/** Jaccard-likhet (0–1) på ordmängder — robust mot ordföljd och småord. */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Returnerar det mest lika befintliga löftet som troligen är SAMMA löfte:
 * partiöverlapp + samma kategori + titellikhet ≥ tröskel. Annars null.
 */
export function findPossibleDuplicate(
  candidate: DupKey,
  existing: ExistingPromiseLite[],
  // Lågt satt med flit: samma parti + kategori filtrerar redan hårt, och en
  // felflagg går bara till review (människan avgör). Hellre fånga än missa.
  threshold = 0.3,
): ExistingPromiseLite | null {
  const cparties = new Set(candidate.parties);
  let best: ExistingPromiseLite | null = null;
  let bestSim = threshold;
  for (const e of existing) {
    if (e.category !== candidate.category) continue;
    if (!e.parties.some((p) => cparties.has(p))) continue;
    const sim = titleSimilarity(candidate.title, e.title);
    if (sim >= bestSim) {
      best = e;
      bestSim = sim;
    }
  }
  return best;
}

/**
 * Skalar bort allt som inte är innehåll: versaler, skiljetecken och mellanrum.
 * Två återgivningar av samma yttrande skiljer sig ofta på ett kommatecken eller
 * ett radbrott, och den skillnaden säger ingenting om huruvida det är samma
 * löfte. HÅLLS SKILD från `tokens` — det här är en identitetsjämförelse, inte
 * en likhetsmätning.
 */
function quoteFingerprint(s: string): string {
  return s.toLowerCase().normalize("NFC").replace(/[^a-z0-9åäöéèü]+/giu, "");
}

/**
 * Kortare citat än så jämförs inte. "Vi vill förbjuda religiösa friskolor" är
 * bevisande; "det ska bort" är det inte, och två partier kan säga det oberoende
 * av varandra.
 *
 * Satt till 30 efter mätning: det citatet väger 32 tecken utan skiljetecken, och
 * ett golv på 40 hade släppt igenom det som en ny post trots att löftet redan
 * låg publicerat. Trettio tecken är ungefär fem ord i rad, ordagrant lika.
 */
const MIN_QUOTE_CHARS = 30;

/**
 * En delmängd räknas som träff bara om den utgör minst hälften av det längre
 * citatet. Utan det kravet hade en kort allmän mening kunnat matcha vilket långt
 * citat som helst som råkar innehålla den — och då vore två skilda löften
 * plötsligt ett.
 *
 * Hälften, inte mer: när utvinningen kapar ett citat olika långt faller en hel
 * avslutande mening ofta bort. Mätt på Sverigekortet ligger den kapade varianten
 * på 0,57 av den fulla, medan en lös mening ur samma citat ligger på 0,42.
 *
 * Att den här delen är en heuristik gör mindre än det låter: den styr bara
 * FLAGGNINGEN till granskning. Där en post tas bort ur kön utan att en människa
 * ser den (`publish.ts`) krävs att citaten är exakt lika.
 */
const MIN_SUBSET_RATIO = 0.5;

/**
 * SAMMA CITAT som ett redan publicerat löfte — alltså ordagrant samma yttrande,
 * inte bara samma politik. Fångar omskördar: en artikel som lästs om, eller en
 * nyhetstext och ett valmanifest som återger samma mening.
 *
 * Varför den behövs: `findPossibleDuplicate` jämför bara TITLAR, och titeln är
 * härledd. Samma citat kan bära titeln "Sverigekort för 499 kr/mån i
 * kollektivtrafik" i en körning och hela citatet som titel i en annan — då blir
 * titellikheten låg och dubbletten slinker igenom. Mätt 2026-08-03 på skarpa
 * data: 24 av 63 poster i granskningskön bar exakt samma citat som ett redan
 * publicerat löfte, och titelkollen hade missat samtliga. Sverigekortet låg i
 * kön tre gånger.
 *
 * Varken parti eller kategori filtrerar här. Ett citat på 40 tecken eller mer
 * som återkommer ordagrant ÄR samma yttrande; skiljer sig partiet är det ett fel
 * i datat som granskaren ska se, inte något som ska gömmas av ett filter.
 * Delmängd räknas som träff åt båda håll — utvinningen kapar ibland citatet
 * olika långt mellan körningar — men bara när delen utgör merparten av helheten.
 */
export function findQuoteDuplicate(
  candidate: { quote: string },
  existing: ExistingPromiseLite[],
): ExistingPromiseLite | null {
  const c = quoteFingerprint(candidate.quote ?? "");
  if (c.length < MIN_QUOTE_CHARS) return null;
  for (const e of existing) {
    const q = quoteFingerprint(e.quote ?? "");
    if (q.length < MIN_QUOTE_CHARS) continue;
    if (q === c) return e;
    const [kort, lang] = c.length <= q.length ? [c, q] : [q, c];
    if (lang.includes(kort) && kort.length >= lang.length * MIN_SUBSET_RATIO) return e;
  }
  return null;
}

/**
 * Samma politik hos ett ANNAT parti (inget partiöverlapp): samma kategori +
 * hög titellikhet. Fångar t.ex. att flera partier lovar 5 % av BNP till
 * försvaret — sådana ska group-länkas (R3: räknas en gång i totalen/koalitioner,
 * fullt i partijämförelsen). Högre tröskel än intra-parti eftersom partier
 * formulerar samma politik olika och flaggan bara ger ett --group-förslag i
 * review — men fortfarande hellre fånga än missa: människan avgör.
 */
export function findCrossPartyDuplicate(
  candidate: DupKey,
  existing: ExistingPromiseLite[],
  // 0.35: L/C:s "5 procent av BNP"-par — flaggskeppsfallet — ligger på 0.375
  // (partier ordval skiljer: "fem"/"5", "försvaret"/"försvarsanslagen").
  threshold = 0.35,
): ExistingPromiseLite | null {
  const cparties = new Set(candidate.parties);
  let best: ExistingPromiseLite | null = null;
  let bestSim = threshold;
  for (const e of existing) {
    if (e.category !== candidate.category) continue;
    if (e.parties.some((p) => cparties.has(p))) continue; // intra-parti hanteras ovan
    const sim = titleSimilarity(candidate.title, e.title);
    if (sim >= bestSim) {
      best = e;
      bestSim = sim;
    }
  }
  return best;
}

/**
 * Befintligt löfte med sitt belopp — underlag för kostnadsankring. Bär medvetet
 * INTE citatet: ankringen jämför politik via titlar, och ett obligatoriskt
 * citatfält här hade tvingat varje anropare att fylla i något som aldrig läses.
 * Citatet krävs bara där det faktiskt avgör något, i dublettkollen.
 */
export interface ComparablePromiseLite extends Omit<ExistingPromiseLite, "quote"> {
  msek_base: number;
  period: "per_ar" | "engang";
  basis: string;
  status: string;
}

/** Ett jämförbart löfte som riktmärke för ett nytt kostnadsestimat. */
export interface ComparableCost {
  id: string;
  title: string;
  party: string;
  msek_base: number;
  period: "per_ar" | "engang";
  basis: string;
}

/**
 * Lätt svensk avstympning (bara bestämd form/plural, längd ≥ 2) så att samma
 * sakord i olika böjning räknas lika: "mängdrabatten"→"mängdrabatt",
 * "brotten"→"brott". Medvetet konservativ och HÅLLS SKILD från duplettkollarnas
 * `tokens`/`titleSimilarity` så deras trösklar (0,3/0,35) inte rubbas.
 */
const SV_SUFFIXES = ["erna", "arna", "orna", "en", "et", "er", "ar", "or", "na"];
function stem(w: string): string {
  for (const suf of SV_SUFFIXES) {
    if (w.length - suf.length >= 4 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return w;
}
function stemmedTokens(s: string): Set<string> {
  return new Set([...tokens(s)].map(stem));
}

/** Delat sakord (stammat, längd ≥ detta) väger tungt — det är själva politiken. */
const SALIENT_MIN_LEN = 7;

/**
 * Likhetspoäng för ankring: Jaccard på stammade ord PLUS en bonus när titlarna
 * delar ett distinkt sakord. Jaccard ensamt straffar långa titlar som delar ett
 * enda nyckelord ("mängdrabatt") — men det är just det ordet som avgör att det
 * är samma politik. Poängen är intern (ej 0–1) och används för tröskel + rankning.
 */
export function comparableScore(a: string, b: string): number {
  const ta = stemmedTokens(a);
  const tb = stemmedTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  let salient = false;
  for (const t of ta) {
    if (tb.has(t)) {
      inter++;
      if (t.length >= SALIENT_MIN_LEN) salient = true;
    }
  }
  const jaccard = inter / (ta.size + tb.size - inter);
  return jaccard + (salient ? 0.5 : 0);
}

/**
 * Delar en löftestext i "åtaganden": segment avgränsade av komma eller "och",
 * där bara segment med ≥ 2 ord räknas (så "X och Y" i en normal mening inte
 * blåser upp antalet). Ett konkret löfte har ETT åtagande; en bred uppräkning
 * har flera.
 */
function commitmentSegments(s: string): number {
  return s
    .split(/,|\s+och\s+/i)
    .map((x) => x.trim())
    .filter((x) => x.split(/\s+/).length >= 2).length;
}

/**
 * Känner igen BREDA UPPRÄKNINGSLÖFTEN — "fler synliga poliser, fler lösta brott
 * och en rättskedja som fungerar" — till skillnad från ett konkret åtagande.
 *
 * Sådana löften är den vanligaste källan till dubbelräkning: partiet lovar
 * samma saker konkret på egna löften, och en prissatt sammanfattning räknar dem
 * en gång till. Titellikhet fångar dem INTE (sammanfattningen och dess delar
 * delar nästan inga ord — uppmätt 0,00–0,13 i likhet), så vi känner i stället
 * igen själva uppräkningsformen.
 *
 * Titeln väger tyngst (den är härledd och renare); citatet får väga in först
 * när titeln redan visar tecken på uppräkning, annars fastnar konkreta löften
 * med kommatecken i sitt citat. Flaggan är informativ — den sätter aldrig ett
 * belopp, den ber granskaren kontrollera överlapp.
 *
 * Kalibrerad mot publicerade data: flaggar ~10 % av löftena och fångar samtliga
 * fem sammanfattningar som nollades i genomgången 2026-07-24.
 */
export function looksLikeUmbrella(title: string, quote: string): boolean {
  const t = commitmentSegments(title);
  return t >= 3 || (t >= 2 && commitmentSegments(quote) >= 5);
}

/**
 * Partiets EGNA redan publicerade löften i samma kategori — underlag för
 * granskaren att bedöma överlapp när ett brett uppräkningslöfte dyker upp.
 * Listar, påstår inget: en människa avgör om politiken är dubbelräknad.
 */
export function findSamePartyInCategory(
  candidate: { parties: string[]; category: string },
  existing: ComparablePromiseLite[],
  maxN = 5,
): ComparableCost[] {
  const cparties = new Set(candidate.parties);
  return existing
    .filter(
      (e) =>
        e.category === candidate.category &&
        e.status !== "tillbakadragen" &&
        e.parties.some((p) => cparties.has(p)),
    )
    .sort((a, b) => b.msek_base - a.msek_base) // störst belopp först — mest att dubbelräkna
    .slice(0, maxN)
    .map((e) => ({
      id: e.id,
      title: e.title,
      party: e.parties[0] ?? "",
      msek_base: e.msek_base,
      period: e.period,
      basis: e.basis,
    }));
}

/**
 * Grannarna, inte kopiorna: redan publicerade löften om LIKNANDE politik (samma
 * kategori + likhetspoäng ≥ minSim), oavsett parti, med sitt belopp. Används för
 * att ankra ett nytt LLM-estimat så att samma politik hos olika partier hamnar i
 * samma storleksordning (glappet mängdrabatt 500 vs 1 500 vi rättade för hand).
 *
 * Rena dubbletter fångas separat och går till manuell länkning innan detta
 * anropas — här handlar det om jämförbara, inte identiska, löften. Lägre tröskel
 * än duplettkollarna eftersom vi vill ha ett riktmärke, inte ett påstående om
 * samma löfte; tillbakadragna löften utesluts men nollställda (belopp 0) tas med,
 * eftersom de är giltiga riktmärken för t.ex. ett nytt förbudslöfte.
 */
export function findComparableCosts(
  candidate: { title: string; category: string },
  existing: ComparablePromiseLite[],
  opts: { minSim?: number; maxN?: number } = {},
): ComparableCost[] {
  const minSim = opts.minSim ?? 0.2;
  const maxN = opts.maxN ?? 5;
  const scored: Array<{ e: ComparablePromiseLite; sim: number }> = [];
  for (const e of existing) {
    if (e.category !== candidate.category) continue;
    if (e.status === "tillbakadragen") continue;
    const sim = comparableScore(candidate.title, e.title);
    if (sim >= minSim) scored.push({ e, sim });
  }
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(0, maxN).map(({ e }) => ({
    id: e.id,
    title: e.title,
    party: e.parties[0] ?? "",
    msek_base: e.msek_base,
    period: e.period,
    basis: e.basis,
  }));
}

/* ─────────────────────────────────────────── samma politik, andra ord ── */

/**
 * SAMMA POLITIK hos samma parti, formulerad med andra ord.
 *
 * De tre kontrollerna ovan letar efter samma *text*. Löfteskön 2026-08-13 gav
 * noll på alla tre — och fyra av 23 poster var ändå dubbletter av publicerade
 * löften från samma parti. «Max 12 barn per grupp för treåringar i förskolan»
 * mot «Lag om max 12 barn i småbarnsgrupperna, och max 15 barn i
 * storbarnsgrupperna»: samma politik, inget delat citat, låg titellikhet. `[6]`
 * ensam bar 12 000 miljoner kronor.
 *
 * Den här kontrollen letar efter samma *uppgift* i stället, och den letar
 * **oavsett kategori och artikeladress** — dubbletterna låg ofta i olika
 * kategorier, vilket är just varför `findPossibleDuplicate` inte såg dem.
 *
 * Två signaler, och båda är valda mot mätning:
 *
 * - **Samma tal med sin enhet.** En ovanlig nivå i två löften från samma parti
 *   är nästan alltid samma nivå. Tröskeln gör jobbet: «12 barn» pekar rakt på
 *   originalet, medan «15» ensamt står i fjorton citat och säger ingenting.
 *   Enheten krävs — se `talen()` nedan, och de två felflaggor som gav den.
 * - **Samma uttryck.** Två innehållsord i rad som knappt förekommer någon
 *   annanstans — «säkra och lagliga vägar» ger «säkra laglig» och «laglig
 *   vägar». Ordföljd krävs; lösa ordträffar är brus.
 *
 * **Den tredje signalen gick inte att bygga, och det är mätt.** Åtgärdslistan
 * pekade också ut «samma måttstock» — «nordisk nivå» hos `[17]`. Ordstammen
 * `nordis` står i tre publicerade citat, alltså *vanligare* än `godkän`,
 * `kontro`, `vetens` och `riktas`, som står i ett var. En sällsynthetströskel
 * som släpper in måttstocken släpper in allt förvaltningsspråk med den, och en
 * flagga som fäller en tredjedel av kön är ingen flagga. Signalen finns, men
 * den skiljer sig från bruset på betydelse och inte på frekvens — och betydelse
 * mäter den här kontrollen inte.
 *
 * Kontrollen FÖRESLÅR. Den sätter `duplicateOf`, posten går till granskning med
 * förslaget, och en människa avgör.
 */

/** Ord som bär innehåll, stympade så att böjningar möts. */
function innehallsord(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^a-zåäöéèü0-9 ]/giu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !SMAORD.has(w))
    .map((w) => w.slice(0, 6));
}

/**
 * Ord som inte skiljer två löften åt. Listan är kort med flit: den ska fånga
 * satsbindningen, inte politiken.
 */
const SMAORD = new Set(
  ("och att det som en ett för med vill ska inte den de vi vår vårt våra av på till är kan " +
    "bör måste också samt eller men om så där här detta denna dessa alla varje mer fler mest " +
    "fram göra får har hade blir vara vid från under över mellan efter före genom utan andra " +
    "annan annat man sig sitt sin sina all bland exempelvis").split(" "),
);

/**
 * Ett tal räknas bara tillsammans med det det mäter. «12 barn» är en nivå;
 * «12» är ett tecken.
 *
 * Skillnaden är mätt mot kön 2026-08-14. Ett blott tal gav två felflaggor av
 * sex, och båda av samma slag: «85 procent» av ett bostadspris mot «personer
 * över 85 år», och «16» i en nedtrappning mot «16 timmar per vecka». Talen var
 * lika, sakerna hade ingenting med varandra att göra. Med enheten kvar faller
 * båda, och «12 barn» står kvar.
 */
function talen(s: string): Set<string> {
  const ord = s
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^a-zåäöéèü0-9 ]/giu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const ut = new Set<string>();
  for (let i = 0; i < ord.length; i++) {
    if (!/^\d+$/.test(ord[i]!)) continue;
    // Enheten är nästa ord som inte är ett tal. «30 000 gränspoliser» räknas
    // alltså som «30 gränspoliser» och «000 gränspoliser» — båda pekar på
    // samma sak, och det är pekningen som ska fånga dubbletten.
    let j = i + 1;
    while (j < ord.length && /^\d+$/.test(ord[j]!)) j++;
    const enhet = ord[j];
    if (enhet !== undefined && enhet.length >= 3) ut.add(`${ord[i]} ${enhet.slice(0, 6)}`);
  }
  return ut;
}

function bigramen(s: string): Set<string> {
  const w = innehallsord(s);
  const ut = new Set<string>();
  for (let i = 0; i + 1 < w.length; i++) ut.add(`${w[i]} ${w[i + 1]}`);
  return ut;
}

/**
 * Ett tal får förekomma i så här många publicerade citat och ändå räknas som
 * en nivå. Mätt: «12» står i 2, «15» i 14. Taket ligger mellan dem med marginal
 * åt det håll som missar hellre än flaggar fel.
 */
const MAX_TALFOREKOMST = 3;

/** Samma för ett uttryck. Två förekomster är fortfarande ett särdrag; fler är språk. */
const MAX_BIGRAMFOREKOMST = 2;

/**
 * Ett delat tal väger tyngre än ett delat uttryck: talet ÄR nivån, medan ett
 * uttryck kan vara en vändning partiet använder ofta. Tröskeln är satt så att
 * ett ensamt sällsynt tal räcker, men ett ensamt uttryck inte gör det — mätt
 * mot kön 2026-08-13 var det ensamma uttrycket «sverig kunna» kontrollens enda
 * felflagg.
 */
const TAL_VIKT = 3;
const UTTRYCK_VIKT = 2;
const POANGGRANS = 3;

export interface PolicyDuplicate {
  /** Det publicerade löftet kandidaten troligen upprepar. */
  match: ExistingPromiseLite;
  /** Vad de delar, skrivet så att det går att läsa i granskningen. */
  reason: string;
}

/**
 * Frekvenserna över hela beståndet, beräknade en gång per körning.
 * Utan dem betyder trösklarna ingenting.
 */
export function buildPolicyIndex(existing: ExistingPromiseLite[]): {
  tal: Map<string, number>;
  bigram: Map<string, number>;
} {
  const tal = new Map<string, number>();
  const bigram = new Map<string, number>();
  for (const e of existing) {
    for (const t of talen(e.quote ?? "")) tal.set(t, (tal.get(t) ?? 0) + 1);
    for (const b of bigramen(e.quote ?? "")) bigram.set(b, (bigram.get(b) ?? 0) + 1);
  }
  return { tal, bigram };
}

export function findPolicyDuplicate(
  candidate: { quote: string; parties: string[] },
  existing: ExistingPromiseLite[],
  index = buildPolicyIndex(existing),
): PolicyDuplicate | null {
  const parter = new Set(candidate.parties);
  const kTal = talen(candidate.quote ?? "");
  const kBigram = bigramen(candidate.quote ?? "");
  let bast: PolicyDuplicate | null = null;
  let bastPoang = 0;

  for (const e of existing) {
    if (!e.parties.some((p) => parter.has(p))) continue;
    const delatTal = [...talen(e.quote ?? "")].filter(
      (t) => kTal.has(t) && (index.tal.get(t) ?? Infinity) <= MAX_TALFOREKOMST,
    );
    const delatUttryck = [...bigramen(e.quote ?? "")].filter(
      (b) => kBigram.has(b) && (index.bigram.get(b) ?? Infinity) <= MAX_BIGRAMFOREKOMST,
    );
    const poang = delatTal.length * TAL_VIKT + delatUttryck.length * UTTRYCK_VIKT;
    if (poang < POANGGRANS || poang <= bastPoang) continue;
    const skal = [
      delatTal.length > 0 ? `samma tal: ${delatTal.join(", ")}` : null,
      delatUttryck.length > 0 ? `samma uttryck: «${delatUttryck.join("», «")}»` : null,
    ]
      .filter((x) => x !== null)
      .join(" · ");
    bastPoang = poang;
    bast = { match: e, reason: skal };
  }
  return bast;
}
