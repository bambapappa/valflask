/**
 * Uträkningen mot citatet.
 *
 * `quality-scan.ts` prövar beloppet mot uträkningen: stämmer talet med de steg
 * som står i samma fält? Den här modulen prövar ledet före — **går uträkningen
 * att lägga bredvid citatet utan att något fattas?** Det är en annan fråga, och
 * det är den fråga jag själv svarade fel på.
 *
 * 2026-08-07 påstod jag att elva löften hade fel kostnadstyp och att rikssumman
 * låg 16 000 miljoner kronor för högt. Jag hade matchat skatteord i **citatet**
 * och aldrig läst uträkningen, som i det avgörande fallet säger rakt ut att
 * avgiftsdelen kostar noll eftersom pengarna går in i och ut ur ett system
 * utanför statsbudgeten. Fyndet var falskt, och det stod redan ett svar på
 * tavlan. Kontrollerna nedan är byggda för att den sortens läsning ska falla:
 * varje invändning kräver att uträkningen är läst och att den **inte** bär ett
 * svar.
 *
 * Kontrollerna FÖRESLÅR bara. Ingen av dem ändrar ett belopp, och ingen av dem
 * är ett fynd förrän en människa läst posten. Utskriften säger därför alltid vad
 * som är mätt och vad som återstår att läsa.
 */

import { parseAmountsMsek, statedBaseMsek, type ScanPromise } from "./quality-scan.ts";

/** Löftet som kontrollerna läser. Samma form som `quality-scan` använder. */
export interface UtrakningsLofte extends ScanPromise {
  cost: ScanPromise["cost"] & {
    msek_low?: number;
    msek_high?: number;
    type?: string;
  };
}

/** En mätt invändning mot en post: vad som saknas, och var det syns. */
export interface Invandning {
  /** Kontrollens namn, så att en genomgång går att sortera. */
  kontroll: string;
  /** Vilken roll i filtret som skulle resa den. */
  roll: "journalisten" | "sakkunnig" | "partiet";
  /** Invändningen som en motpart skulle formulera den. */
  invandning: string;
  /** Det mätta som invändningen vilar på — aldrig ett omdöme. */
  matt: string;
}

/**
 * Ett värdeord är ingen nivå. Fastställt genom mänskligt beslut: «rejält»,
 * «historisk» och «kraftigt» får aldrig översättas till en siffra.
 */
const VARDEORD =
  /\b(rejäl\w*|historisk\w*|kraftig\w*|markant\w*|betydand\w*|ordentlig\w*|massiv\w*|stor satsning|kraftfull\w*|omfattande)\b/iu;

/** Uttryck som anger en faktisk nivå, till skillnad från ett värdeord. */
const NIVA =
  /\d|\b(procent|dubbl\w*|halver\w*|avskaff\w*|slopa\w*|ta bort|avgiftsfri|gratis|kostnadsfri)\b/iu;

/**
 * Skälen ett nollat belopp får vila på. Alla står i `CLAUDE.md` eller i
 * `pipeline/prompts/A5-cost.md`, och listan är avsiktligt bred: en nollning som
 * bär sitt skäl i egna ord ska inte flaggas för att den valt andra ord.
 * Residualen — nollor som inte namnger något skäl alls — är det som ska läsas.
 */
const NOLLSKAL: Array<[string, RegExp]> = [
  ["lag, förbud eller reglering", /lagändring|lagstift|förbud|förbjud|avreglering|regeländring|regelförändring|regeljusterin|reglering|förordningsändring|villkor för mottagare|hålls av lagen/iu],
  ["utredning eller plan", /utredning|utreda|handlingsplan|tillsätta|kartlägg|översyn|planarbete|nationell plan|förhandlingsarbete/iu],
  ["omfördelning, inte ny kostnad", /omfördel\w*|nettokostnad|redan betalas|redan finansier|redan beslutad|inom befintlig|ordinarie (?:anslag|budget|förvaltningsanslag)|behålls|står kvar|redan gäller|tillförs? (?:eller|inte)/iu],
  ["bred uppräkning", /uppräkning|önskelista|inriktning|flera politikområden|utan konkret|räknar upp|önskat utfall|mål(?:et)? (?:i sig|har ing)/iu],
  ["prissatt en gång på ett annat löfte", /dubbelräkn|räkna samma politik|prissätts (?:en gång|på ett annat|som egna|som eget|var för sig|på de löftena)|ligger på ett annat|eget(?:s|na)? löfte|egna löften|egna specifika|reformens egna delar/iu],
  ["varken åtgärd eller nivå anges", /ingen nivå|inget belopp|ingen åtgärd|anger (?:varken|ingen|inget)|utan att ange|värdeord|inte en åtgärd|går inte att (?:veta|räkna|prissätta)|saknar angiven|inte specificeras|utan specificerad/iu],
  ["försumbar direkt kostnad", /försumbar\w*|marginell\w*|obetydlig\w*|bärs av|betalar inte|kostar (?:staten )?(?:ingenting|inget)|ingen ny statlig utgift|inga nya (?:anslag|statliga)/iu],
];

/** Namnger uträkningen ett skäl som en nollning får vila på? */
export function nollskal(calculation: string): string | null {
  for (const [namn, re] of NOLLSKAL) if (re.test(calculation)) return namn;
  return null;
}

/**
 * Uträkningen säger själv att den är återskapad i efterhand.
 *
 * Det är ärligt skrivet, men det betyder att stegen bakom det publicerade
 * beloppet inte är de steg beloppet en gång byggdes på. Läsaren ser en
 * uträkning; den är rekonstruerad. Det hör i en prövning under `oprovat`, inte
 * som en invändning — men det ska aldrig gå obemärkt.
 */
const REKONSTRUERAD = /rekonstruerad i efterhand|ursprungliga resonemanget sparades inte/iu;

/** Är uträkningen återskapad i efterhand? */
export function rekonstruerad(calculation: string): boolean {
  return REKONSTRUERAD.test(calculation);
}

/**
 * Uträkningen förklarar varför en del av löftet kostar noll fast citatet låter
 * som en utgift — eller omvänt. Det var precis det ledet jag läste förbi.
 */
const FORKLARAR_SKILLNADEN =
  /utanför statsbudgeten|går in i och ut ur|avser åtgärden, inte|inte dess följder|prissätts inte här|den delen kostar|kostar noll|ingår inte i beloppet|räknas på ett annat|bara den marginella/iu;

/** Bär uträkningen ett led som förklarar skillnaden mot citatets ordalydelse? */
export function forklararSkillnaden(calculation: string): boolean {
  return FORKLARAR_SKILLNADEN.test(calculation);
}

/**
 * Ord i citatet som namnger ett **skatteinstrument** — alltså själva åtgärden,
 * inte ett ämne den råkar nämna.
 *
 * Skillnaden är mätt och den är hela skälet till att mönstret ser ut så här.
 * Ett brett «skatt|avgift»-mönster gav elva träffar, varav fem var falsklarm av
 * tre slag:
 *
 * - **En avgift som medborgare betalar är ingen statlig skatt.** «Avgiftsfri
 *   tandvård», «utöka avgiftsfri fritids», «sänka avgiften för att ta ut sin
 *   medicin» — där tas en patient- eller föräldraavgift bort, och staten
 *   betalar mer, inte mindre. Det är en utgift.
 * - **Skatten kan vara brottets föremål.** «Fiffel med skatter måste stoppas»
 *   prissätts som kontrollresurser till myndigheter — en utgift.
 * - **Skatten kan vara en beskrivning av personen.** «Den som arbetar, betalar
 *   skatt och bygger sitt liv i Sverige» säger inget om åtgärden.
 *
 * Kvar står instrumenten: ett avdrag, en kredit, en reduktion, en nivå som görs
 * skattefri, en skatt som sänks eller slopas.
 */
const SKATTEORD =
  /\b(skattefri\w*|skatteavdrag\w*|skattekredit\w*|skattereduktion\w*|jobbskatteavdrag\w*|arbetsgivaravgift\w*|moms\w*)\b|\b(?:sänk\w*|slopa\w*|avskaffa\w*|höj\w*)\s+(?:\w+\s+){0,2}(?:skatt\w*|moms\w*)\b|\bavdrag för\b/iu;

/** Kostnadstyper som är en statlig utgift snarare än en skatteförändring. */
const UTGIFTSTYPER = new Set(["utgift", "besparing"]);

/**
 * Ett tal i citatet som bär en penningenhet — partiets egen siffra.
 * Anger partiet själv ett belopp är det den siffran som räknas, och den ska
 * gå att hitta i uträkningen.
 */
export function partietsSiffror(quote: string): number[] {
  return parseAmountsMsek(quote);
}

/**
 * Kontrollerna, en post i taget.
 *
 * Ordningen är inte slumpmässig: den hårdaste kontrollen först, så att en
 * genomgång som avbryts har gjort det som betyder mest.
 */
export function provaUtrakningen(p: UtrakningsLofte): Invandning[] {
  const c = p.cost;
  const calc = (c.calculation ?? "").trim();
  const ut: Invandning[] = [];

  // 1. Uträkningen är offentlig. Saknas den finns ingenting att följa.
  if (calc === "") {
    ut.push({
      kontroll: "utrakningen_saknas",
      roll: "journalisten",
      invandning:
        "Ni publicerar ett belopp och skriver att uträkningen är offentlig. Här står ingen uträkning alls. Vad ska jag kontrollera?",
      matt: `cost.calculation är tom, och cost.msek_base är ${c.msek_base}.`,
    });
    return ut; // Utan uträkning är de övriga kontrollerna meningslösa.
  }

  // 2. Beloppet ska gå att följa ur stegen.
  const angivet = statedBaseMsek(calc);
  if (c.msek_base > 0 && angivet === null && parseAmountsMsek(calc).length === 0) {
    ut.push({
      kontroll: "beloppet_namns_inte",
      roll: "journalisten",
      invandning:
        "Beloppet står i rubriken men inte i uträkningen. Jag kan läsa era steg utan att komma fram till er siffra.",
      matt: `cost.msek_base är ${c.msek_base}; uträkningen namnger inget belopp med penningenhet.`,
    });
  }

  // 3. Partiets egen siffra gäller. Finns den i citatet ska den finnas i stegen.
  const egna = partietsSiffror(p.quote);
  const iUtrakningen = new Set(parseAmountsMsek(calc));
  const forbigangna = egna.filter((n) => !iUtrakningen.has(n) && n !== c.msek_base);
  if (forbigangna.length > 0 && !forklararSkillnaden(calc)) {
    ut.push({
      kontroll: "partiets_siffra_forbigadd",
      roll: "partiet",
      invandning: `Vi säger själva ${forbigangna
        .map((n) => (n >= 1000 ? `${n / 1000} miljarder` : `${n} miljoner`))
        .join(" och ")} kronor i citatet. Var i er uträkning är vår siffra?`,
      matt: `Citatet bär ${forbigangna.join(", ")} mkr; uträkningen namnger ${
        [...iUtrakningen].join(", ") || "inget belopp"
      } och basbeloppet är ${c.msek_base}.`,
    });
  }

  // 4. Ett värdeord är ingen nivå, och får aldrig bli partiets egen siffra.
  if (
    c.msek_base > 0 &&
    c.basis === "parti" &&
    VARDEORD.test(p.quote) &&
    !NIVA.test(p.quote)
  ) {
    ut.push({
      kontroll: "vardeord_som_niva",
      roll: "partiet",
      invandning:
        "Ni har satt en siffra på ett ord. Vi säger inte hur mycket — och ni skriver att beloppet är vårt.",
      matt: `Citatet bär ett värdeord och ingen nivå, cost.basis är "parti" och cost.msek_base är ${c.msek_base}.`,
    });
  }

  // 5. En nollning ska bära sitt skäl i uträkningen.
  if (c.msek_base === 0 && nollskal(calc) === null) {
    ut.push({
      kontroll: "nollan_utan_skal",
      roll: "sakkunnig",
      invandning:
        "Ni sätter beloppet till noll. Noll är också en publicerad siffra — vilken av era regler är det som ger noll här?",
      matt: "cost.msek_base är 0 och uträkningen namnger inget av de skäl en nollning får vila på.",
    });
  }

  // 6. Osäkerheten hör hemma i spannet, inte i basbeloppet.
  const low = c.msek_low;
  const high = c.msek_high;
  if (low !== undefined && high !== undefined) {
    if (!(low <= c.msek_base && c.msek_base <= high)) {
      ut.push({
        kontroll: "spannet_omsluter_inte_basen",
        roll: "journalisten",
        invandning: "Ert eget spann rymmer inte ert eget basbelopp. Vilken av siffrorna gäller?",
        matt: `msek_low ${low}, msek_base ${c.msek_base}, msek_high ${high}.`,
      });
    } else if (low === high && c.msek_base > 0 && c.basis === "llm_estimat") {
      ut.push({
        kontroll: "spannet_bar_ingen_osakerhet",
        roll: "sakkunnig",
        invandning:
          "Beloppet är er egen uppskattning, och spannet är en punkt. Var ligger osäkerheten då?",
        matt: `msek_low = msek_high = ${low} med cost.basis "llm_estimat".`,
      });
    }
  }

  // 7. Skatteord i citatet mot en utgiftstyp — men bara när uträkningen inte
  //    själv förklarar skillnaden. Det är den kontroll som skulle ha stoppat
  //    mina elva falska fynd, och villkoret är hela poängen med den.
  if (
    SKATTEORD.test(p.quote) &&
    c.type !== undefined &&
    UTGIFTSTYPER.has(c.type) &&
    c.msek_base > 0 &&
    !forklararSkillnaden(calc)
  ) {
    ut.push({
      kontroll: "typen_mot_citatet",
      roll: "sakkunnig",
      invandning:
        "Citatet talar om en skatt eller en avgift, ni bokför det som en utgift, och uträkningen säger inte varför. Vilken av dem beskriver åtgärden?",
      matt: `cost.type är "${c.type}", citatet namnger ett skatteinstrument, och uträkningen bär inget led som förklarar skillnaden.`,
    });
  }

  return ut;
}

/** Vad som är mätt om en post utan att vara en invändning. */
export interface Anmarkning {
  kontroll: string;
  text: string;
}

/** Sådant som hör i `oprovat` snarare än bland invändningarna. */
export function anmarkningar(p: UtrakningsLofte): Anmarkning[] {
  const calc = (p.cost.calculation ?? "").trim();
  const ut: Anmarkning[] = [];
  if (rekonstruerad(calc)) {
    ut.push({
      kontroll: "rekonstruerad_utrakning",
      text:
        "Uträkningen säger själv att den är återskapad i efterhand och att det ursprungliga " +
        "resonemanget inte sparades. Stegen läsaren ser är alltså inte de steg beloppet byggdes på.",
    });
  }
  return ut;
}
