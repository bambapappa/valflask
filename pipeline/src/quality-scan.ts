/**
 * Kvalitetssökningar över publicerade löften.
 *
 * Tre sökningar som bygger på fel som hittats manuellt, en per session, under
 * omräkningen 2026-07-27–28:
 *
 * 1. `findAmountMismatches` — beloppet stämmer inte med uträkningen i samma
 *    fält. Den gamla sökningen läste fragment ("Bas 2 500 kr per förlossning"
 *    lästes som basbeloppet 2 500) och letade bara efter belopp som såg för
 *    HÖGA ut. Fyra av sex fel som hittades i utbildnings- och välfärdsämnena
 *    var för LÅGA, så den här söker åt båda hållen och kräver att talet bär en
 *    penningenhet.
 * 2. `findUngroupedTwins` — löftet hör hemma i en befintlig grupp men ligger
 *    utanför den. Fyra sessioner i rad hittade ett sådant fall, och varje gång
 *    betydde det att samma politik prissattes olika hos olika partier.
 * 3. `findCompletedPolicyQuotes` — citatet beskriver genomförd politik utan
 *    åtagande om framtiden. Sju sådana har dragits tillbaka manuellt.
 *
 * Sökningarna FÖRESLÅR bara — de ändrar aldrig belopp. Ett träffat löfte kan
 * mycket väl vara rätt; det är en människa som avgör.
 */

export interface ScanPromise {
  id: string;
  title: string;
  quote: string;
  parties: string[];
  category: string;
  status: string;
  group_id?: string | null;
  cost: {
    msek_base: number;
    period: string;
    basis: string;
    calculation?: string;
  };
}

export interface Finding {
  id: string;
  parties: string[];
  detail: string;
}

export interface MismatchFinding extends Finding {
  base: number;
  stated: number;
  direction: "för lågt" | "för högt";
}

export interface TwinFinding extends Finding {
  groupId: string;
  overlap: string[];
  score: number;
}

/**
 * Alla mellanslagsvarianter som förekommer som tusentalsavskiljare i datat:
 * vanligt, hårt (U+00A0), siffer- (U+2007), smalt (U+2009) och smalt hårt
 * (U+202F). Det sista är det datat faktiskt använder — utan det i klassen
 * läses "bas 1 000" som talet 1, vilket ger ett falsklarm på tusen gånger.
 */
const SPACES = "     ";

/** "1 234,5" → 1234.5. Svenska tusentalsmellanslag och decimalkomma. */
function parseSwedishNumber(raw: string): number | null {
  const cleaned = raw.replace(new RegExp(`[${SPACES}]`, "g"), "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Tal med svenskt tusentalsmellanslag ELLER ett vanligt tal. Grupperingen med
 * mellanslag måste kräva minst en grupp (`+`, inte `*`) — annars matchar den
 * första alternativet bara de tre första siffrorna i "1000" och läser talet
 * som 100.
 */
const NUM_SRC = `\\d{1,3}(?:[${SPACES}]\\d{3})+(?:,\\d+)?|\\d+(?:,\\d+)?`;

/** "5–10 miljarder kronor": bara det andra talet bär enheten. */
const RANGE = /\d\s*[–—-]\s*\d/;

/**
 * Belopp i msek ur en text. Talet MÅSTE bära en penningenhet — annars fastnar
 * "1,9 miljoner barn" och "2 500 kr per förlossning" i nätet, vilket var precis
 * det som gjorde den gamla sökningen obrukbar.
 */
export function parseAmountsMsek(text: string): number[] {
  const re = new RegExp(`(${NUM_SRC})\\s*(miljarder kronor|miljoner kronor|mdkr|mkr)`, "gi");
  const out: number[] = [];
  for (const m of text.matchAll(re)) {
    const raw = m[1];
    const rawUnit = m[2];
    if (raw === undefined || rawUnit === undefined) continue;
    const n = parseSwedishNumber(raw);
    if (n === null) continue;
    const unit = rawUnit.toLowerCase();
    out.push(unit.startsWith("miljarder") || unit === "mdkr" ? n * 1000 : n);
  }
  return out;
}

/** Meningar som drar en slutsats om beloppet. */
const CONCLUSION = /\b(bas|basen|basbelopp|basbeloppet|basfall|basfallet|basantagand|basnivå|sammantaget|sammanlagt|totalt|totalkostnad|summan|summa|avrundat|avrundas)\b/i;

/** Uttryck där ett tal namnges som basbelopp utan att bära egen enhet. */
const BARE_BASE_PATTERNS = [
  new RegExp(`\\bbas(?:belopp|fall|nivå|antagande)?t?\\s*(?:är|blir|sätts till|läggs på|sätts)?\\s*(${NUM_SRC})(?!\\s*(?:%|procent))`, "i"),
  new RegExp(`(${NUM_SRC})\\s+som\\s+bas`, "i"),
  new RegExp(`\\bmed\\s+(${NUM_SRC})\\s+som\\s+basbelopp`, "i"),
];

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

/** Är meningen dominerad av miljarder? Då ska nakna tal skalas därefter. */
function sentenceScale(sentence: string): number {
  return /miljarder kronor|mdkr/i.test(sentence) && !/miljoner kronor|mkr/i.test(sentence)
    ? 1000
    : 1;
}

/**
 * Meningar som redovisar ett FÖRKASTAT belopp. De nämner en siffra som
 * uttryckligen inte gäller, och att läsa den som basbelopp är ett falsklarm.
 */
const REJECTED = /\b(avvisad|avvisades|förkastad|förkastades|tidigare uppskattning|tidigare belopp|tidigare beloppet|det tidigare|efterhandsberäkning|låg dessutom|stod på)\b/i;

/** Talet är ett styckpris, inte ett totalbelopp: "2 500 kr/förlossning". */
function isUnitPrice(sentence: string, numberText: string): boolean {
  const escaped = numberText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*(kr|kronor)\\s*(/|per\\b)`, "i").test(sentence);
}

/**
 * Vad uträkningen själv säger att basbeloppet är, i msek. Null när texten inte
 * drar någon slutsats — då finns inget att jämföra med och löftet flaggas inte.
 */
export function statedBaseMsek(calculation: string): number | null {
  const sentences = splitSentences(calculation)
    .filter((s) => CONCLUSION.test(s))
    .filter((s) => !REJECTED.test(s));
  if (sentences.length === 0) return null;

  // Sista slutsatsen väger tyngst: uträkningar räknar upp delar och summerar sist.
  // Steg 1: ett uttryckligt basbelopp ("med 650 som basbelopp", "bas 3 000").
  for (const sentence of [...sentences].reverse()) {
    for (const pattern of BARE_BASE_PATTERNS) {
      const m = sentence.match(pattern);
      if (!m) continue;
      const raw = m[1];
      if (raw === undefined) continue;
      const n = parseSwedishNumber(raw);
      if (n === null) continue;
      // "Bas 2 500 kr/förlossning" är ett styckpris, inte ett basbelopp i
      // miljoner. Det var den gamla sökningens mest kända falsklarm.
      if (isUnitPrice(sentence, raw)) continue;
      // Bär talet egen enhet fångas det redan av parseAmountsMsek — undvik
      // att skala det två gånger.
      const withUnit = new RegExp(
        `${raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(miljarder kronor|miljoner kronor|mdkr|mkr)`,
        "i",
      );
      if (withUnit.test(sentence)) {
        const amounts = parseAmountsMsek(sentence);
        const last = amounts[amounts.length - 1];
        if (last !== undefined) return last;
      }
      return n * sentenceScale(sentence);
    }
  }

  // Steg 2: en slutsatsmening med ETT ENDA belopp är entydig ("Sammantaget
  // omkring 500 miljoner kronor per år"). Innehåller meningen flera belopp är
  // det ett spann eller en jämförelse, och då går det inte att veta vilket som
  // är basbeloppet — då avstår vi hellre än gissar. Det var precis gissandet
  // som gjorde den gamla sökningen obrukbar.
  for (const sentence of [...sentences].reverse()) {
    // Ett spann skrivet "5–10 miljarder kronor" ser ut som ett enda belopp,
    // eftersom bara det andra talet bär enheten. Då är meningen inte entydig.
    if (RANGE.test(sentence)) continue;
    const amounts = parseAmountsMsek(sentence);
    const only = amounts[0];
    if (amounts.length === 1 && only !== undefined) return only;
  }
  return null;
}

/**
 * Löften där beloppsfältet och uträkningen säger olika saker. Söker åt BÅDA
 * hållen — hälften av felen i omräkningen var belopp som var för låga.
 */
export function findAmountMismatches(
  promises: readonly ScanPromise[],
  toleranceFactor = 1.35,
): MismatchFinding[] {
  const out: MismatchFinding[] = [];
  for (const p of promises) {
    if (p.status === "tillbakadragen") continue;
    const calc = p.cost.calculation;
    if (!calc) continue;
    const stated = statedBaseMsek(calc);
    if (stated === null) continue;
    // Nollor är beslut ("prissätts inte här"), inte räknefel.
    if (p.cost.msek_base === 0 || stated === 0) continue;

    const ratio = p.cost.msek_base / stated;
    if (ratio <= toleranceFactor && ratio >= 1 / toleranceFactor) continue;

    out.push({
      id: p.id,
      parties: p.parties,
      base: p.cost.msek_base,
      stated,
      direction: ratio > 1 ? "för högt" : "för lågt",
      detail:
        `beloppsfältet ${p.cost.msek_base} mot uträkningens ${stated} ` +
        `(${ratio > 1 ? "×" + ratio.toFixed(1) : "÷" + (1 / ratio).toFixed(1)}) — ${p.title.slice(0, 60)}`,
    });
  }
  return out.sort((a, b) => b.base - a.base);
}

const STOPWORDS = new Set([
  "och","att","för","med","som","till","den","det","vill","ska","vi","en","ett","av","på",
  "i","är","har","kan","om","så","de","alla","mer","fler","ökad","ökat","nya","ny","hela",
  "genom","samt","också","inte","men","där","när","från","varje","dess","sin","sina","deras",
  "vår","vårt","våra","man","får","göra","se","ge","bli","blir","landet","sverige","svenska",
  // Standardfraser ur riksdagsmotioner. Utan dem matchar varje motionslöfte
  // varje annat motionslöfte, oavsett vad de handlar om.
  "riksdagen","ställer","bakom","anförs","motionen","tillkännager","tillkännagivande",
  "regeringen","detta","bör","göras","framgår","yrkande","följande",
]);

/**
 * Grov böjningstålig stam: ordets fem första tecken. Trubbigt, men det är
 * precis vad som krävs för att "polisens", "poliser" och "polisutbildning"
 * ska mötas — exakt ordmatchning missade alla fyra fall som hittades manuellt.
 */
export function stem(word: string): string {
  return word.slice(0, 5);
}

/**
 * Innehållsord ur en text, som stam → ordet det kom från. Stammen används för
 * matchning, originalordet för att rapporten ska gå att läsa.
 */
export function contentWords(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const words = text
    .toLowerCase()
    .replace(/[^a-zà-öø-ÿ0-9\s-]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !STOPWORDS.has(w));
  for (const w of words) {
    if (!out.has(stem(w))) out.set(stem(w), w);
  }
  return out;
}

/**
 * Löften som delar åtgärd med en befintlig grupp men ligger utanför den.
 *
 * Söker på åtgärden i HELA datat i stället för bland gruppens medlemmar — det
 * var just därför de fyra manuella fynden aldrig syntes vid en genomgång ämne
 * för ämne.
 */
export function findUngroupedTwins(
  promises: readonly ScanPromise[],
  minOverlap = 3,
): TwinFinding[] {
  const active = promises.filter((p) => p.status !== "tillbakadragen");

  const groups = new Map<string, ScanPromise[]>();
  for (const p of active) {
    if (!p.group_id) continue;
    const list = groups.get(p.group_id) ?? [];
    list.push(p);
    groups.set(p.group_id, list);
  }

  // En grupps signatur: ord som återkommer hos flera medlemmar väger tyngst,
  // men i en tvåmedlemsgrupp räknas allt medlemmarna har gemensamt.
  const signatures = new Map<string, Set<string>>();
  for (const [gid, members] of groups) {
    if (members.length < 2) continue;
    const counts = new Map<string, number>();
    for (const m of members) {
      for (const s of contentWords(`${m.title} ${m.quote}`).keys()) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
    const shared = new Set(
      [...counts.entries()].filter(([, c]) => c >= 2).map(([s]) => s),
    );
    if (shared.size > 0) signatures.set(gid, shared);
  }

  const out: TwinFinding[] = [];
  for (const p of active) {
    const words = contentWords(`${p.title} ${p.quote}`);
    for (const [gid, signature] of signatures) {
      if (p.group_id === gid) continue;
      const overlap = [...words.keys()].filter((s) => signature.has(s));
      if (overlap.length < minOverlap) continue;
      const readable = overlap.map((s) => words.get(s) ?? s);
      const score = overlap.length / Math.min(words.size, signature.size);
      out.push({
        id: p.id,
        parties: p.parties,
        groupId: gid,
        overlap: readable.slice(0, 8),
        score,
        detail: `delar ${overlap.length} ord med gruppen (${readable.slice(0, 6).join(", ")}) — ${p.title.slice(0, 55)}`,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Markörer för genomförd politik: hjälpverb + supinum, dåtid, eller skryt. */
const COMPLETED = [
  // "har sänkt", "har polisen fått", "hade vi genomfört" — supinum inom några
  // ord efter hjälpverbet. Svenskt supinum slutar på fler sätt än -at/-it.
  // OBS: -st är medvetet uteslutet — det fångar superlativ ("har det allra
  // tuffast") och gav fler falsklarm än träffar.
  /\b(har|hade)\s+(?:[a-zà-öø-ÿ]+\s+){0,2}[a-zà-öø-ÿ]{2,}(at|it|tt|et|kt|rt|ft|gt|dd|ått)\b/i,
  /\bvi\s+(införde|sänkte|höjde|gav|byggde|skapade|genomförde|tog|lade)\b/i,
  /\bsedan\s+vi\b/i,
  /\b(halverades|sänktes|höjdes|infördes|avskaffades|genomfördes|byggdes|togs bort)\b/i,
  /\bden\s+(moderatledda\s+)?regeringen\s+(avsätter|har|inför|införde|satsar)\b/i,
  // Skryt utan verbform: ett påstående om nuläget som resultat av egen politik.
  // OBS: \b fungerar inte före å/ä/ö — de är inte ordtecken i JavaScripts
  // regexmotor, så mönstret måste börja på ett tecken där \b faktiskt biter.
  /(?:^|[\s(])än\s+någonsin|\baldrig\s+(förr|tidigare)\b|\bhögsta\s+någonsin/i,
];

/** Markörer för åtagande om framtiden. */
const COMMITMENT = [
  /\b(vill|ska|bör|kommer att|kommer vi|lovar|tänker|avser|föreslår|vi ämnar)\b/i,
  /\b(återinföra|återkomma|återställa)\b/i,
  /\bnästa mandatperiod\b/i,
  /\bska (bli|få|kunna|vara)\b/i,
];

export function looksLikeCompletedPolicy(quote: string): boolean {
  const completed = COMPLETED.some((re) => re.test(quote));
  if (!completed) return false;
  return !COMMITMENT.some((re) => re.test(quote));
}

/**
 * Citat som beskriver genomförd politik utan åtagande om framtiden. Sju sådana
 * har dragits tillbaka manuellt; extraktionen skiljer fortfarande inte på
 * löfte och skryt.
 */
export function findCompletedPolicyQuotes(promises: readonly ScanPromise[]): Finding[] {
  return promises
    .filter((p) => p.status !== "tillbakadragen" && looksLikeCompletedPolicy(p.quote))
    .map((p) => ({
      id: p.id,
      parties: p.parties,
      detail: p.quote.slice(0, 110),
    }));
}
