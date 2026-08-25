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
  // «en miljard kronor» och «ett anslag på en miljon» skriver talet med ord när
  // det är exakt ett. Räkneordet är det enda som tas — «två miljarder» skrivs i
  // praktiken med siffra, och en full ordräknare skulle fånga «en» som artikel.
  const ord = raw.trim().toLowerCase();
  if (ord === "en" || ord === "ett") return 1;
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
/**
 * OBS: mönstret bär en ALTERNATION PÅ TOPPNIVÅ. Varje inbäddning måste ligga i
 * en grupp — `(${NUM_SRC})` eller `(?:${NUM_SRC})`. Utan den sprider sig
 * alternationen till hela uttrycket: ett mönster skrivet `${NUM_SRC}\\s*%`
 * betyder «tal ELLER tal ELLER ordet ett följt av procent», och matchar då
 * nästan vad som helst.
 */
const NUM_SRC = `\\d{1,3}(?:[${SPACES}]\\d{3})+(?:,\\d+)?|\\d+(?:,\\d+)?|\\ben\\b|\\bett\\b`;

/**
 * "5–10 miljarder kronor": bara det andra talet bär enheten. Ett ord får stå
 * mellan talen — "0–ca 5 miljoner kronor" är också ett spann.
 */
const RANGE = /\d\s*[–—-]\s*(?:[a-zà-öø-ÿ]+\s+)?\d/;

/**
 * Belopp i msek ur en text. Talet MÅSTE bära en penningenhet — annars fastnar
 * "1,9 miljoner barn" och "2 500 kr per förlossning" i nätet, vilket var precis
 * det som gjorde den gamla sökningen obrukbar.
 */
/**
 * Enheterna datat faktiskt använder — och det är fler än de tre uppenbara.
 *
 * Mätt 2026-08-08 genom att svepa uträkningarna: `mnkr` («8 mnkr/år»), `mn kr`
 * («≈ 1 375 mn kr/år») och `msek` («anger 13 000 msek/år») saknades alla i
 * listan, och varje uträkning som räknade i dem lästes som att den inte namngav
 * något belopp. Det gav tre falsklarm på uträkningar som var riktiga. Listan är
 * därför byggd ur datat, inte ur vad som verkar rimligt att skriva.
 */
/**
 * Singularformerna finns med för att de saknades, och luckan var inte teoretisk.
 *
 * Mönstret tog «miljarder kronor» men inte «miljard kronor», och Vänsterpartiets
 * glesbygdsmiljard skriver just «(totalt 1 miljard kronor nationellt): 500
 * miljoner kronor till Norrlands fem län». Parsern läste alltså bara 500, och
 * kontrollen som vaktar att partiets egen siffra används fällde posten för att
 * ha förbigått en siffra den själv var blind för. Beloppet 1 000 var rätt hela
 * tiden.
 *
 * «En miljard kronor» tas också: talet skrivs lika ofta med ord som med siffra
 * när det är exakt ett.
 */
const UNITS =
  "miljarder kronor|miljard kronor|miljoner kronor|miljon kronor|mdkr|mdr kr|mdr|mnkr|mn kr|msek|mkr";

export function parseAmountsMsek(text: string): number[] {
  const re = new RegExp(`(${NUM_SRC})\\s*(${UNITS})`, "gi");
  const out: number[] = [];
  for (const m of text.matchAll(re)) {
    const raw = m[1];
    const rawUnit = m[2];
    if (raw === undefined || rawUnit === undefined) continue;
    const n = parseSwedishNumber(raw);
    if (n === null) continue;
    const unit = rawUnit.toLowerCase();
    // Singularformen skalar förstås likadant som pluralen — «1 miljard kronor»
    // är 1 000 miljoner, inte 1. Att bara pluralen skalades var samma lucka som
    // att bara pluralen lästes.
    const miljard = unit.startsWith("miljard") || unit === "mdkr";
    out.push(miljard ? n * 1000 : n);
  }
  return out;
}

/**
 * Enheterna som betyder miljarder, och de som betyder miljoner. Härledda ur
 * `UNITS` och inte omskrivna för hand.
 *
 * VARFÖR DET MÅSTE VARA SÅ. `UNITS` byggdes ur datat sedan «mnkr», «mn kr» och
 * «msek» visat sig saknas. Men `statedBaseMsek` och `sentenceScale` bar var sin
 * EGEN, kortare lista — `miljarder kronor|miljoner kronor|mdkr|mkr` — och de
 * uppdaterades aldrig. Följden var inte att beloppet lästes som saknat utan att
 * det lästes FEL: en mening som säger «0,5–5 mdkr/år; bas 2 000 msek» hittade
 * ingen enhet intill basbeloppet, föll tillbaka på meningens skala, såg bara
 * «mdkr» och svarade 2 000 000. Fem av femton falska «belopp_avviker» 2026-08-25
 * kom ur just den luckan, och alla fem gällde uträkningar som var rätt.
 */
const MILJARDENHETER = /^(miljard|mdkr|mdr)/i;
const ENHET_ALT = UNITS.replace(/\s/gu, "\\s*");
/** Bär meningen en miljonenhet? Då ska nakna tal inte skalas som miljarder. */
const MILJONORD = new RegExp(`(?:${UNITS})`, "i");

/** Meningar som drar en slutsats om beloppet. */
const CONCLUSION =
  /\b(bas|base|basen|basbelopp|basbeloppet|basfall|basfallet|basantagand|basnivå|mitten|mittpunkt|mittvärde|medelvärde|sammantaget|sammanlagt|totalt|totalkostnad|summan|summa|avrundat|avrundas)\b/i;

/**
 * Ungefärsmarkörer före ett tal. «bas ~30», «bas ca 1 100», «bas ≈ 500».
 *
 * Utan dem misslyckades mönstret på just de meningar som skriver ut ett spann
 * och ett basbelopp i samma andetag — «Summa: låg ~5, bas ~30, hög ~100 msek» —
 * och steg 2 tog då meningens enda enhetsbärande tal, alltså HÖGVÄRDET.
 */
const UNGEFAR = "(?:~|≈|ca\\.?|cirka|omkring|drygt|knappt)?\\s*";

/** Uttryck där ett tal namnges som basbelopp utan att bära egen enhet. */
const BARE_BASE_PATTERNS = [
  // Blicken framåt måste också hindra att TALET kortas av. `(?!\s*%)` ensam
  // förkastar inte träffen — motorn backar och matchar en kortare siffra i
  // stället: «Bas 25 %» gav basbeloppet 2, för efter tvåan står «5 %» och inte
  // «%». Det larmade ×15 000 på ett löfte vars uträkning var riktig.
  //
  // «base» stavat på engelska tas med: prissättningen skriver det, och
  // mönstret som bara kände «bas» lämnade meningen åt steg 2, som svarade med
  // spannets lågvärde.
  new RegExp(`(?<![a-zà-öø-ÿ-])base?(?:belopp|fall|nivå|antagande)?(?:et|en|t)?\\s*(?::|=|är|blir|sätts till|läggs på|sätts)?\\s*${UNGEFAR}(${NUM_SRC})(?!\\d|\\s*(?:%|procent))`, "i"),
  // Basbeloppet uttryckt som en ANDEL, med svaret efter likhetstecknet: «Bas
  // 25 % ≈ 30 000 mkr». Procentsatsen är inte beloppet — men meningen bär
  // beloppet, och att bara förkasta träffen lämnade den åt steg 2.
  new RegExp(`(?<![a-zà-öø-ÿ-])base?(?:belopp|fall|nivå|antagande)?(?:et|en|t)?\\s*(?::|=)?\\s*${UNGEFAR}(?:${NUM_SRC})\\s*(?:%|procent)\\w*\\s*(?:[≈=→]|ger|blir|motsvarar)\\s*${UNGEFAR}(${NUM_SRC})`, "i"),
  new RegExp(`(${NUM_SRC})\\s+som\\s+bas`, "i"),
  new RegExp(`\\bmed\\s+(${NUM_SRC})\\s+som\\s+basbelopp`, "i"),
  // "sammanlagt 8 miljoner per år" — summeringen bär enhet men inte ordet
  // "kronor", så den fastnade inte i beloppsläsaren och meningens ENDA
  // "miljoner kronor"-tal lästes som slutsats i stället.
  new RegExp(`\\b(?:sammanlagt|sammantaget|totalt|summan blir)\\s+(${NUM_SRC})\\s*(miljoner|miljarder)`, "i"),
  // «= totalt ca 25 msek/år» — samma summering men med hela enhetslistan och
  // ett ungefärstecken. Den gamla raden tog bara orden «miljoner|miljarder».
  new RegExp(`(?:^|[^a-zà-öø-ÿ])(?:totalt|summa|sammanlagt|sammantaget)\\s+${UNGEFAR}(${NUM_SRC})\\s*(?:${ENHET_ALT})`, "i"),
  // ETIKETTEN EFTER TALET: «450 miljoner kronor per år som basbelopp». Formen
  // är lika vanlig som den omvända, och mönstret `(tal) som bas` krävde att de
  // stod intill varandra — vilket de aldrig gör när talet bär sin enhet.
  new RegExp(
    `(${NUM_SRC})\\s*(miljoner|miljarder)?(?:\\s*kronor)?[^.,;\\d]{0,20}?\\bsom\\s+bas(?:belopp|nivå|fall)?\\b`,
    "i",
  ),
  // Uppräkningen låg–mitt–hög med enheten först på slutet: «Sammanlagt: låg
  // ~150, mitten ~500, hög ~1 200 msek». Bara det sista talet bär enhet, så
  // steg 2 såg ett enda belopp och svarade med HÖGVÄRDET. Mittentalet är
  // basbeloppet, och «mitten» är lika giltigt ord för det som «bas».
  new RegExp(
    `\\b(?:låg|lägst)\\w*[^.]{0,40}?\\b(?:bas\\w*|base|mitten|mittpunkt|mitt)\\b[^\\d)]{0,12}?${UNGEFAR}(${NUM_SRC})[^.]{0,40}?\\b(?:hög|högst)\\w*`,
    "iu",
  ),
];

/** Mönstren som fångar en SUMMA, inte ett basbelopp. Se användningen nedan. */
const ARTOTAL = new Set([BARE_BASE_PATTERNS[4], BARE_BASE_PATTERNS[5]]);

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

/**
 * Är meningen dominerad av miljarder? Då ska nakna tal skalas därefter.
 *
 * Miljonenheterna läses ur `UNITS`, så att «msek» och «mnkr» räknas som de
 * miljonenheter de är. Gjorde de inte det skalades ett naket basbelopp i en
 * mening som nämnde bägge tusenfalt.
 */
function sentenceScale(sentence: string): number {
  if (!/miljard\w*\b|mdkr/iu.test(sentence)) return 1;
  const miljoner = [...sentence.matchAll(new RegExp(`(?:${UNITS})`, "giu"))].some(
    (m) => !MILJARDENHETER.test(m[0]!),
  );
  return miljoner || /miljon\w*\b|mkr/iu.test(sentence) ? 1 : 1000;
}

/**
 * Meningar som redovisar ett FÖRKASTAT belopp. De nämner en siffra som
 * uttryckligen inte gäller, och att läsa den som basbelopp är ett falsklarm.
 */
const REJECTED =
  /\b(avvisad|avvisades|förkastad|förkastades|tidigare uppskattning|tidigare belopp|tidigare beloppet|det tidigare|efterhandsberäkning|låg dessutom|stod på)\b|räknas (?:därför )?inte(?:\s+med)?\b|ingår inte\b|tas inte med\b/iu;

/**
 * Talet är en operand i en uträkning ("1 000 studenter à 50 000 kronor = …"),
 * inte uträkningens svar. Kollas på texten DIREKT EFTER träffen — samma tal
 * kan stå tidigare i meningen som operand utan att basbeloppet är det.
 */
/**
 * Tidsord efter «per» eller «/». «300 mkr/år» är en TAKT och är basbeloppet;
 * «1,2 mkr per barnmorska» är ett STYCKPRIS och är det inte.
 */
const TIDSORD = /^(år|åren|årligen|budgetår|månad\w*|vecka\w*|dag\w*|kvartal\w*|mandatperiod\w*)\b/iu;

/**
 * Bär talet en nämnare som inte är tid? Då är det ett styckpris.
 *
 * Samma fel som `isUnitPrice` fångar för kronor, men ett snäpp längre ut: ett
 * styckpris skrivet i MILJONER. «Bas 300 ≈ 250 barnmorskor à 1,2 mkr» och
 * «Basbeloppet är en miljon kronor per apotek, alltså 300 miljoner kronor per
 * år» lästes bägge som att basbeloppet vore styckpriset — 1,2 respektive 1 —
 * mot fältets 300. Det gav larm på ×250 och ×300 för löften som var rätt.
 */
function arStyckpris(efterEnheten: string): boolean {
  const m = /^\s*(?:\/|per\b)\s*(.*)$/iu.exec(efterEnheten);
  if (m === null) return false;
  return !TIDSORD.test(m[1] ?? "");
}

/**
 * Enheter som inte är pengar: talet är då en STORHET som räknas om till pengar
 * längre fram i meningen.
 */
const STORHETSENHET =
  /^\s*(?:[–-]\s*\d+(?:[.,]\d+)?\s*)?(GWh|TWh|kWh|MWh|ton|hektar|ha|kontor|platser|personer|elever|studenter|anställningar|anställda|årsarbetskraft\w*|årsarbetskrafter|tjänster|utredningar|centrum|ubåtar)\b/iu;

/**
 * Ledet talet står i: texten fram till nästa post i uppräkningen.
 *
 * Skiljetecknet måste vara ett SKILJETECKEN och inte en decimal. Ett led som
 * klipptes vid varje komma slutade mitt i «1,5», och då fanns inget belopp kvar
 * att läsa — «bas: 3 mdkr×1,5 %+15 mkr≈60 mkr» blev tomt i stället för 60.
 * Svenska skriver decimaler med komma, så regeln är: komma, semikolon eller
 * punkt som INTE följs av en siffra.
 */
function ledet(text: string): string {
  const m = /[,;.](?!\d)/u.exec(text);
  return m === null ? text : text.slice(0, m.index);
}

function isOperand(tail: string): boolean {
  // Pilen och ungefärstecknet är operatorer i de här texterna precis som
  // likhetstecknet: «Bas 100 GWh → 30 mkr» räknar om en storhet till pengar.
  // Kände funktionen dem inte lästes 100 — antalet gigawattimmar — som ett
  // belopp i miljoner kronor.
  // Kommat och semikolonet avslutar ledet. «bas=10, hög=20 msek» bär ett
  // likhetstecken efter basbeloppet, men det tecknet hör till NÄSTA post i
  // uppräkningen — läste funktionen det som basbeloppets egen operator svarade
  // den med högvärdet.
  const led = ledet(tail);
  // Aritmetiken följs alltid: ×, * och = räknar vidare på talet.
  if (/^[^=\u00d7*]{0,15}?[\u00d7*=]/u.test(led)) return true;
  if (/^.{0,15}?\s\u00e0\s/u.test(led)) return true;
  // Pilen och ungefärstecknet följs BARA när talet bär en storhetsenhet, alltså
  // när det inte är pengar: «Bas 100 GWh → 30 mkr». Utan det villkoret läste
  // funktionen «Bas 300 ≈ 250 barnmorskor à 1,2 mkr» som att 300 var en
  // mellanräkning och 1,2 svaret — men där är 300 svaret och resten dess
  // härledning. Tecknet betyder «vilket är», inte «ger».
  // «Bas: ~3–5 tjänster + systemkostnad ≈ 10 mkr/år»: talet är ett ANTAL och
  // svaret står efter räkneoperatorn. Plustecknet räknas med här men inte i
  // det generella fallet ovan — det är bara när talet bär en storhetsenhet vi
  // vet att det inte redan är svaret.
  return STORHETSENHET.test(tail) && /^.{0,40}?[\u2192\u2248+=]/u.test(led);
}

/**
 * Talet står i KRONOR, inte i miljoner: "2 500 kr/förlossning", "Bas 10 000 kr".
 *
 * Snedstrecket krävdes förut, och det var för snävt. «Bas 10 000 kr.» är ett
 * styckpris per deltagare skrivet utan nämnare, och lästes som basbeloppet
 * 10 000 miljoner kronor — tiotusen gånger fel. Ett tal vars egen enhet är
 * kronor är aldrig ett basbelopp i miljoner, med eller utan nämnare.
 */
function isUnitPrice(tail: string): boolean {
  return /^\s*(kr|kronor)\b(?!\s*(?:i\s+)?(?:miljon|miljard))/iu.test(tail);
}

/**
 * Svaret på uträkningen som talet ingår i: första penningbeloppet EFTER
 * operatorn.
 *
 * Den gamla vägen tog meningens SISTA belopp, och det är rätt bara när
 * meningen räknar en enda sak. Uträkningarna skriver oftast låg, bas och hög i
 * samma mening — «Låg: 10×1=10 mkr/år, bas: 20×1.5=30 mkr/år, hög: 30×2=60
 * mkr/år» — och då är sista beloppet HÖGVÄRDET. Fyra av femton falska larm
 * 2026-08-25 var precis det: sökningen larmade på sina egna rätträknade löften,
 * samma fälla som redan stod dokumenterad för det andra ledet i funktionen.
 */
/** Sista beloppet i texten som inte självt bär en nämnare skild från tid. */
function sistaTotalbeloppet(text: string): number | null {
  // Beloppet måste vara UTPEKAT som summan. Utan det kravet plockade
  // återvinningen upp vad som helst som stod efter styckpriset — «Bas: ~4 100
  // mkr per ubåt (två ubåtar ~8 200 mkr)» gav 8 200 fast löftet gäller EN ubåt.
  // En parentes är en upplysning vid sidan av, inte uträkningens svar.
  // `\b` biter inte efter å, ä eller ö — de är inte ordtecken i JavaScripts
  // regexmotor. `\balltså\b` matchade därför ALDRIG, och återvinningen gav upp
  // på just den vanligaste summeringsformen. Samma fälla står dokumenterad två
  // gånger i den här filen, för skrytmönstret och för «återinföra»; den var
  // aldrig lagad här.
  const m0 = /(?:^|[^a-zà-öø-ÿ])(?:alltså|vilket ger|det ger|summa|summan|totalt|sammanlagt|sammantaget)(?![a-zà-öø-ÿ])|=/iu.exec(text);
  if (m0 === null) return null;
  const efter = text.slice(m0.index).replace(/\([^)]*\)/gu, " ");
  const traffar = [...efter.matchAll(new RegExp(`(${NUM_SRC})\\s*(${ENHET_ALT})`, "giu"))].filter(
    (m) => !arStyckpris(efter.slice((m.index ?? 0) + m[0].length)),
  );
  const sista = traffar[traffar.length - 1];
  if (sista === undefined) return null;
  const n = parseSwedishNumber(sista[1]!);
  if (n === null) return null;
  return MILJARDENHETER.test(sista[2]!) ? n * 1000 : n;
}

function operandSvar(sentence: string, fran: number): number | null {
  // Kedjan slutar vid komma, semikolon eller punkt — där börjar nästa post i
  // uppräkningen. Inom kedjan gäller det SISTA beloppet: «Bas: 50 kontor × 10
  // mkr = 500 mkr/år» har svaret efter likhetstecknet, inte efter kryssbollen.
  const kedja = ledet(sentence.slice(fran));
  const traffar = [...kedja.matchAll(new RegExp(`(${NUM_SRC})\\s*(${ENHET_ALT})`, "giu"))];
  const sista = traffar[traffar.length - 1];
  if (sista === undefined) return null;
  const n = parseSwedishNumber(sista[1]!);
  if (n === null) return null;
  return MILJARDENHETER.test(sista[2]!) ? n * 1000 : n;
}

/**
 * En mening avfärdas också av NÄSTA mening, när den pekar tillbaka.
 *
 * «Samma budget vill slå ihop de riktade statsbidragen till ett sektorsbidrag
 * på totalt 17 miljarder kronor. Den summan räknas inte: att lägga ihop pengar
 * som redan betalas ut är omfördelning, inte ny kostnad.» Avfärdandet står i
 * meningen EFTER beloppet — det är så man skriver — och en filtrering som bara
 * läser den egna meningen tog 17 000 som basbelopp för ett löfte på 4 000.
 */
const AVFARDAR_FOREGAENDE =
  /^\s*(?:den|det|denna|dessa|de)\s+[a-zà-öø-ÿ]+\s+(?:räknas|tas|ingår|används)\b[^.]*\binte\b/iu;

export function statedBaseMsek(calculation: string): number | null {
  const alla = splitSentences(calculation);
  const sentences = alla
    .filter((s, i) => !AVFARDAR_FOREGAENDE.test(alla[i + 1] ?? ""))
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
      const tail = sentence.slice((m.index ?? 0) + m[0].length);
      // EN SUMMA SOM MENINGEN SJÄLV RÄKNAR OM. «Sammanlagt 150 miljarder
      // kronor, spritt över 15–20 byggår, vilket ger omkring 8 500 miljoner
      // kronor per år» — det är årsnivån som räknas mot mandatperioden, inte
      // livstidssumman. Bara TOTALmönstren behandlas så: ett basbelopp följt av
      // «vilket ger X över mandatperioden» är fortfarande basbeloppet.
      if (ARTOTAL.has(pattern) && /vilket ger|det ger|spritt över|fördelat på|per år/iu.test(tail)) {
        const svar = sistaTotalbeloppet(tail);
        if (svar !== null) return svar;
      }
      if (isUnitPrice(tail)) continue;
      // "Bas: 1 000 studenter à 50 000 kronor = 50 miljoner kronor" — talet
      // efter "Bas:" är då en OPERAND i uträkningen, inte svaret. Svaret står
      // efter likhetstecknet, så använd meningens sista penningbelopp.
      if (isOperand(tail)) {
        const svar = operandSvar(sentence, (m.index ?? 0) + m[0].length);
        if (svar !== null) return svar;
        continue;
      }
      // ETT NAKET TAL ÄR INGET BELOPP OM MENINGEN INTE HANDLAR OM PENGAR.
      // «Antag 10 000–20 000 nya första-anställningar/år (bas 15 000)» gav
      // basbeloppet 15 000 miljoner kronor — det är antalet anställningar.
      // Svaret stod i nästa mening: 15 000 × 94 tkr ≈ 1 400 mkr.
      const harPengar = new RegExp(`(?:${ENHET_ALT})`, "iu").test(sentence);
      // Och orden «en»/«ett» är räkneord bara intill en enhet. «basbeloppet är
      // en grov placeringssiffra» lästes som basbeloppet 1.
      const arRakneord = !/^(en|ett)$/iu.test(raw) ||
        new RegExp(`\\b${raw}\\s*(?:${ENHET_ALT})`, "iu").test(sentence);
      if (!harPengar || !arRakneord) continue;

      // Bär talet egen enhet fångas det redan av parseAmountsMsek — undvik
      // att skala det två gånger.
      // Bär basbeloppet en egen enhet ska DEN användas. Att i stället ta sista
      // beloppet i meningen läste "låg 500, bas 1 500, hög 5 000" som att
      // basbeloppet vore 5 000 — sökningen larmade på sina egna rätträknade
      // löften.
      const withUnit = sentence.match(
        new RegExp(`${raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(${ENHET_ALT})`, "i"),
      );
      // Bär mönstret själv en enhet (grupp 2) gäller den. Annars den enhet som
      // står intill talet. Att i stället gissa ur meningen blev fel i en
      // mening som innehöll både miljoner och miljarder.
      const patternUnit = m[2]?.toLowerCase();
      if (patternUnit === "miljarder") return n * 1000;
      if (patternUnit === "miljoner") return n;
      const ownUnit = withUnit?.[1];
      if (withUnit && ownUnit !== undefined) {
        const efterEnheten = sentence.slice((withUnit.index ?? 0) + withUnit[0].length);
        if (arStyckpris(efterEnheten)) {
          // Styckpriset är inte svaret, men meningen bär det ofta ändå:
          // «Basbeloppet är en miljon kronor per apotek, alltså 300 miljoner
          // kronor per år». Ta då det sista beloppet som INTE självt är ett
          // styckpris. Finns inget sådant avstår vi — ett uteblivet svar är
          // ofarligt, ett fel svar är ett falsklarm.
          const svar = sistaTotalbeloppet(efterEnheten);
          if (svar !== null) return svar;
          continue;
        }
        return MILJARDENHETER.test(ownUnit) ? n * 1000 : n;
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

/**
 * Nollade löften vars uträkning ändå räknar fram en summa.
 *
 * `findAmountMismatches` hoppar över nollor med motiveringen att en nolla är
 * ett beslut, inte ett räknefel. Det stämmer om nollan — men inte om texten
 * bredvid. När ett belopp nollas måste uträkningen skrivas om så att den
 * förklarar nollan; görs det inte står en räkning kvar och motsäger beloppet
 * intill, publikt. `p-2026-0062` gjorde precis det: beloppet nollades
 * 2026-07-28 eftersom betygsreformen redan var beslutad, men texten räknade
 * vidare "Summan blir 285–950 miljoner kronor" i ytterligare en vecka utan att
 * någon sökning sa ifrån.
 *
 * Sökningen läser slutsatsmeningarna själv i stället för att gå via
 * `statedBaseMsek`. Den funktionen letar ETT entydigt basbelopp och avstår vid
 * spann — och just spannet var fallet här: "Summan blir 285–950 miljoner
 * kronor" har inget basbelopp att läsa ut. För en nolla är frågan enklare och
 * trubbigare: räknar texten fram några pengar alls? Då rapporteras det högsta
 * beloppet i slutsatsen.
 */
const FORKLARAR_NOLLAN =
  /(beloppet är noll|sätts till noll|prissätts inte|prissätts till noll|räknas inte här|ingen ny (statlig )?(kostnad|utgift|nettokostnad)|ingen mätbar|redan beslutad|redan besluta|försumbar|utanför statens budget|omfördelning|räknas på (partiets|sina) egna|ligger på (partiets|sina) egna|på sina egna löften|dubbelräkn)/i;

export function findZeroWithCalculatedSum(
  promises: readonly ScanPromise[],
): MismatchFinding[] {
  const out: MismatchFinding[] = [];
  for (const p of promises) {
    if (p.status === "tillbakadragen") continue;
    if (p.cost.msek_base !== 0) continue;
    const calc = p.cost.calculation;
    if (!calc) continue;
    if (FORKLARAR_NOLLAN.test(calc)) continue;
    // Säger texten själv att basbeloppet är noll är nollan förklarad, även om
    // uträkningen räknar upp delar på vägen dit: "Totalt 2–5 miljoner kronor
    // per år om nya medel tillförs; basfall 0 (inryms i befintlig verksamhet)".
    if (statedBaseMsek(calc) === 0) continue;
    const belopp = splitSentences(calc)
      .filter((s) => CONCLUSION.test(s) && !REJECTED.test(s))
      .flatMap((s) => parseAmountsMsek(s).map((n) => n * sentenceScale(s)));
    const stated = belopp.length === 0 ? 0 : Math.max(...belopp);
    if (stated === 0) continue;
    out.push({
      id: p.id,
      parties: p.parties,
      base: 0,
      stated,
      direction: "för lågt",
      detail:
        `beloppet är 0 men uträkningen räknar fram upp till ${stated} msek och ` +
        `förklarar aldrig nollan — ${p.title.slice(0, 60)}`,
    });
  }
  return out.sort((a, b) => b.stated - a.stated);
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

/**
 * Substantiv på -het, -tet och -ing som ser ut som supinum men inte är det.
 *
 * Supinummönstret ovan tar «har» plus ett ord som slutar på -et, och «har
 * möjlighet», «har rättighet», «har verksamhet» slutar alla så. De är
 * SUBSTANTIV: «Garantera att public service har möjlighet att sända stora
 * sportevenemang» lästes som genomförd politik därför att «möjlighet» råkar
 * sluta på -het. Konstruktionen «har» + substantiv är inte perfekt.
 */
const SUBSTANTIV_PA_ET = /\b(har|hade)\s+(?:[a-zà-öø-ÿ]+\s+){0,2}[a-zà-öø-ÿ]{2,}(?:het|tet|itet)\b/i;

/**
 * Markörer för åtagande om framtiden.
 *
 * INFINITIVEN ÄR DEN VANLIGASTE LÖFTESFORMEN, och listan kände den inte.
 * Partiernas A–Ö-sidor skriver punkt efter punkt i ren infinitiv — «Införa ett
 * jobbat avdrag …», «Höja ersättningarna … då de har halkat efter», «Garantera
 * att …» — och just de meningarna bär ofta en bisats i perfekt som beskriver
 * BAKGRUNDEN, inte åtgärden. Utan infinitivmarkören lästes varje sådan punkt
 * som skryt om genomförd politik: tre av kö-posterna 2026-08-25 föll så, och
 * alla tre var löften om framtiden.
 *
 * Mönstret kräver att verbet inleder citatet — det är rubrikformen. En
 * infinitiv mitt i en mening säger inget om vem som lovar vad.
 *
 * TVÅ SLAGS ORD SOM OCKSÅ SLUTAR PÅ -A undantas, och de är inte petitesser.
 * BESTÄMD PLURAL slutar på «-arna», «-erna» eller «-orna», och där bor både
 * partinamnen — Kristdemokraterna, Liberalerna, Moderaterna — och subjektet i
 * den klassiska skrytmeningen: «Pensionsspararna har mer pengar på kontot än
 * någonsin», ett citat som faktiskt drogs tillbaka. Ett mönster som tog varje
 * inledande ord på -a hade gjort exakt de meningarna immuna mot kontrollen,
 * och det är dem kontrollen finns för. Inget svenskt infinitiv slutar så.
 * Determinanterna («alla», «detta», «flera») är den andra gruppen och räknas
 * upp för hand; listan är kort och sluten.
 */
const BESTAMD_PLURAL = /^[a-zà-öø-ÿ]*[aeoäöu]rna$/iu;
const DETERMINANT = /^(alla|andra|dessa|detta|flera|många|vissa|samma|sådana|varje|hela|olika|egna|nya|ingen|inga)$/i;

const COMMITMENT = [
  // «måste» är lika mycket ett åtagande som «ska» i partiernas prosa, och det
  // saknades: «Personer med nedsatt arbetsförmåga … måste kunna pröva att
  // jobba» lästes som genomförd politik, eftersom «har nedsatt» ser ut som
  // perfekt medan «nedsatt» här är ett adjektiv.
  /\b(vill|ska|bör|måste|kommer att|kommer vi|lovar|tänker|avser|föreslår|vi ämnar)\b/iu,
  // `\b` biter inte före å/ä/ö — de är inte ordtecken i JavaScripts regexmotor,
  // så `\båterinföra\b` matchade ALDRIG «att återinföra» men däremot
  // «Xåterinföra». Mönstret var alltså dött åt rätt håll och levande åt fel.
  // Samma fälla står dokumenterad för skrytmönstret ovan; den var aldrig lagad
  // här. Mätt 2026-08-18: tre löften i granskningskön föll som «genomförd
  // politik» trots att de bar ordet återinföra.
  /(?:^|[^a-zà-öø-ÿ])(återinföra|återkomma|återställa)(?![a-zà-öø-ÿ])/i,
  /\bnästa mandatperiod\b/i,
  /\bska (bli|få|kunna|vara)\b/i,
];

/** Inleds citatet av ett verb i infinitiv? Det är partiernas punktform. */
export function inledsAvInfinitiv(quote: string): boolean {
  const m = /^\s*(?:att\s+)?([a-zà-öø-ÿ]{3,})\b/iu.exec(quote);
  const ord = m?.[1];
  if (ord === undefined) return false;
  if (!/(?:a|ra|ås)$/iu.test(ord)) return false;
  return !BESTAMD_PLURAL.test(ord) && !DETERMINANT.test(ord);
}

export function looksLikeCompletedPolicy(quote: string): boolean {
  // Supinumträffen räknas inte när ordet är ett substantiv på -het: se
  // SUBSTANTIV_PA_ET. Bär citatet BÅDE en äkta supinumform och ett sådant
  // substantiv står träffen kvar — det är bara den ensamma -het-träffen som
  // aldrig var en verbform.
  const completed = COMPLETED.some((re, i) =>
    i === 0 ? re.test(quote) && !enbartSubstantiv(quote) : re.test(quote),
  );
  if (!completed) return false;
  if (inledsAvInfinitiv(quote)) return false;
  return !COMMITMENT.some((re) => re.test(quote));
}

/** Är den enda supinumträffen i citatet ett substantiv på -het? */
function enbartSubstantiv(quote: string): boolean {
  if (!SUBSTANTIV_PA_ET.test(quote)) return false;
  const utan = quote.replace(new RegExp(SUBSTANTIV_PA_ET.source, "gi"), " ");
  return !COMPLETED[0]!.test(utan);
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
