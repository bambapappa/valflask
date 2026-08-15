/**
 * Byte av citat på ett REDAN PUBLICERAT löfte.
 *
 * `pnpm review approve` når bara kön, och kan dessutom bara sätta belopp,
 * grupp, kostnadstyp och källnivå — **inte citatet**. Kärnprincipen säger
 * «räcker inte citatet: leta bättre citat», men det gick inte att verkställa
 * någonstans: fanns ett bättre citat på samma sida var enda vägen att avvisa
 * kö-posten och hoppas att nästa skörd tog rätt mening. Två pass i rad
 * (2026-08-15) stannade på just det.
 *
 * Handlingsvågen har haft `bevis-byt` sedan 2026-08-06. Den här modulen är
 * samma sak för Fläskvågen, med samma uppdelning: **ordagrannheten är absolut
 * och lossas aldrig**, medan bedömningen — om citatet bär ett helt åtagande
 * eller är ett utplock ur en längre mening — får göras om av en människa, men
 * bara med skälet utskrivet.
 *
 * Är löftet publicerat står citatet redan på sajten, och bytet är därför en
 * **rättelse**: post i `data/rattelser.json` och en egen historikpost på
 * löftet. Tyst rättelse är förbjuden.
 *
 * Ren logik utan fil- och nätverksåtkomst — källtexten hämtas av anroparen
 * (`scripts/citat-byt.mts`), på samma väg som `revalidate-quotes` använder.
 */
import {
  QUOTE_MAX_WORDS,
  QUOTE_MIN_WORDS,
  QUOTE_MIN_WORDS_PARTY_LINE,
  arEgenRadIKallan,
  countWords,
  normalizeForVerbatim,
  utanAvslutandeSkiljetecken,
} from "./gates.ts";

/** En rad i bytesfilen: vilket löfte, vilket nytt citat, och ett eventuellt undantag. */
export interface Byte {
  id: string;
  citat: string;
  /**
   * Skälet till att ett citat som INTE är en hel mening i källan ändå får
   * bytas in.
   *
   * Krävs som utskriven text, aldrig som en flagga — samma regel som
   * Handlingsvågens motsvarighet bär: ett undantag som inte behöver motiveras
   * blir ett undantag man tar av vana.
   *
   * Det finns riktiga fall. En punkt i en partis egen punktlista är ofta ett
   * helt åtagande utan att vara en grammatisk mening, och det lägre citatgolvet
   * finns just för dem. Men fragmentet som fällde två poster 2026-08-15 såg
   * likadant ut i datat — «Fler fängelseplatser utomlands – som vi nu gör i
   * Estland,» — och skillnaden gick bara att se genom att läsa källan. Därför
   * är detta en fråga till en människa, inte ett avgörande i kod.
   */
  fragmentSkal?: string;
}

/** Vad kontrollen fann. `helMening` är odefinierad när citatet inte gick att hitta i källan. */
export interface Bytesprovning {
  ok: boolean;
  skal: string[];
  helMening: boolean | undefined;
  /** Sant när bytet gick igenom på ett utskrivet undantag i stället för på grinden. */
  paUndantag: boolean;
  /** Meningen citatet är hämtat ur, när citatet inte är hela den. Underlag för skälet. */
  meningen?: string;
}

/**
 * Meningen i källtexten som citatet ligger i.
 *
 * Grov meningsdelning med flit: den ska hitta det omgivande sammanhanget så att
 * en människa kan se om citatet kapar en mening på mitten, inte avgöra saken
 * själv. Radbrytning räknas som meningsslut, för `stripHtml` bryter rad på
 * `</li>` och `</p>` — annars skulle varje punkt i en lista se ut som en del av
 * den föregående.
 */
export function meningenRuntCitatet(kalltext: string, citat: string): string | null {
  const c = normalizeForVerbatim(citat);
  if (c === "") return null;
  for (const rad of kalltext.split(/\r?\n/u)) {
    const meningar = rad.split(/(?<=[.!?])\s+/u);
    for (const m of meningar) {
      if (normalizeForVerbatim(m).includes(c)) return m.trim();
    }
  }
  return null;
}

/**
 * Bär citatet hela meningen det är hämtat ur?
 *
 * Skiljetecken i slutet räknas bort, av samma skäl som `arEgenRadIKallan` gör
 * det: två grannpunkter i samma lista ska inte behandlas olika beroende på om
 * utvinningen råkat ta med ett kommatecken.
 */
export function arHelMening(kalltext: string, citat: string): boolean | undefined {
  const meningen = meningenRuntCitatet(kalltext, citat);
  if (meningen === null) return undefined;
  const a = utanAvslutandeSkiljetecken(normalizeForVerbatim(citat));
  const b = utanAvslutandeSkiljetecken(normalizeForVerbatim(meningen));
  return a === b;
}

/**
 * Prövar ett citatbyte lika hårt som en skörd prövas, plus en kontroll till:
 * att citatet bär hela meningen det är hämtat ur.
 *
 * `arPartiegenSida` styr bara om det lägre citatgolvet får användas — exakt
 * samma villkor som i skörden, så ett citat som bytts in aldrig är svagare än
 * ett citat som skördats.
 */
export function provaByte(
  byte: Byte,
  nuvarandeCitat: string,
  kalltext: string,
  arPartiegenSida: boolean,
): Bytesprovning {
  const skal: string[] = [];
  const c = normalizeForVerbatim(byte.citat);

  // Ett byte till samma citat rättar ingenting, men skulle ändå skriva en post
  // i den offentliga rättelseloggen och en historikpost på löftet. En
  // rättelselogg full av rättelser som inte rättade något är svårare att lita
  // på än en kort.
  if (c === normalizeForVerbatim(nuvarandeCitat)) {
    skal.push("det nya citatet är detsamma som det nuvarande — det finns ingenting att rätta");
  }

  const ord = countWords(c);
  const kortMenEgenPunkt =
    arPartiegenSida && ord >= QUOTE_MIN_WORDS_PARTY_LINE && arEgenRadIKallan(byte.citat, kalltext);
  if (ord < QUOTE_MIN_WORDS && !kortMenEgenPunkt) {
    skal.push(
      arPartiegenSida
        ? `citatet har ${ord} ord — minst ${QUOTE_MIN_WORDS} krävs (kortare tillåts bara om ` +
            "citatet är en hel, unik punkt på partiets egen sida)"
        : `citatet har ${ord} ord — minst ${QUOTE_MIN_WORDS} krävs`,
    );
  }
  if (ord > QUOTE_MAX_WORDS) {
    skal.push(`citatet har ${ord} ord — max ${QUOTE_MAX_WORDS} tillåts`);
  }

  if (c !== "" && !normalizeForVerbatim(kalltext).includes(c)) {
    skal.push(
      "citatet står inte ordagrant i källan. Skriv aldrig av det för hand — hämta lydelsen ur " +
        "sidans egen text. Står det ändå inte där kan det vara textutvinningen som klippt " +
        "sönder ett avstavat ord",
    );
  }

  let helMening: boolean | undefined;
  let paUndantag = false;
  let meningen: string | undefined;
  if (c !== "" && normalizeForVerbatim(kalltext).includes(c)) {
    helMening = arHelMening(kalltext, byte.citat);
    if (helMening === false) {
      meningen = meningenRuntCitatet(kalltext, byte.citat) ?? undefined;
      if (byte.fragmentSkal) {
        paUndantag = true;
      } else {
        skal.push(
          "citatet är ett utplock ur en längre mening, inte hela den. Hela meningen lyder: " +
            `«${meningen}». Ska bytet ändå göras: skriv skälet efter citatet, åtskilt med tabb`,
        );
      }
    }
  }

  return { ok: skal.length === 0, skal, helMening, paUndantag, ...(meningen ? { meningen } : {}) };
}

/** Spåret bytet lämnar i löftets historik — bytet får aldrig vara osynligt. */
export function bytesnot(byte: Byte, datum: string): string {
  const bas =
    `Citatet byttes ${datum} mot en annan lydelse på samma sida, hämtad ur källan och ` +
    "kontrollerad ord för ord. Beloppet, källan och bedömningen är oförändrade.";
  return byte.fragmentSkal
    ? `${bas} Citatet bär inte hela meningen det är hämtat ur, och togs in på ett mänskligt ` +
        `beslut: ${byte.fragmentSkal}`
    : bas;
}

/** Löftet med sitt nya citat och en egen historikpost, enligt tvåcommit-mönstret. */
export function bytCitat<T extends { quote: string; history?: unknown[] }>(
  lofte: T,
  byte: Byte,
  datum: string,
): T {
  return {
    ...lofte,
    quote: byte.citat,
    history: [
      ...(lofte.history ?? []),
      // Backfillas i en andra commit, samma mönster som övriga dataändringar.
      { date: datum, commit: "0000000", change: bytesnot(byte, datum) },
    ],
  };
}

/** En rad i genomgången: löftet, bytet, och vad som var fel med det gamla citatet. */
export interface Bytesrad {
  lofte: { id: string; parties?: string[]; quote: string; history?: unknown[] };
  byte: Byte;
  /**
   * Sant när det GAMLA citatet inte stod ord för ord i sin källa.
   *
   * Då är bytet en **reparation av en trasig avskrift**, inte ett byte av
   * vilken mening som citeras — och rättelseposten får inte påstå att det
   * gamla citatet stod ordagrant på sidan, för det gjorde det inte.
   */
  gammaltCitatSaknasIKallan?: boolean;
}

/**
 * En rättelsepost för hela genomgången — inte en per löfte.
 *
 * «Rättelser samlas»: en systematisk kvalitetshöjning blir EN post. `affects`
 * måste namnge varje berört löfte, för rättelsenoten på löftessidan väljs genom
 * att söka löftets id i just det fältet.
 */
export function rattelsePost(
  byten: Bytesrad[],
  datum: string,
): { date: string; affects: string; what: string; why: string; commit: string } {
  const ider = [...new Set(byten.map((b) => b.lofte.id))].sort();
  const undantag = byten.filter((b) => b.byte.fragmentSkal).length;
  const reparerade = byten.filter((b) => b.gammaltCitatSaknasIKallan).length;
  const flyttade = byten.length - reparerade;

  const flyttadText =
    flyttade > 0
      ? `Vi visar nu en annan mening från samma källa som citat för ${flyttade} ` +
        `${flyttade === 1 ? "löfte" : "löften"}. Det gamla citatet stod ordagrant på sidan, men ` +
        "den nya lydelsen visar åtagandet tydligare — den bär nivån, eller hela meningen i " +
        "stället för en del av den."
      : "";

  const reparadText =
    reparerade > 0
      ? `För ${reparerade} ${reparerade === 1 ? "löfte" : "löften"} gick det gamla citatet inte ` +
        "längre att hitta ord för ord i källan. Meningen är densamma — det är avskriften som är " +
        "lagad, hämtad på nytt ur sidan."
      : "";

  const paUndantagText =
    undantag > 0
      ? ` ${undantag} av dem bär inte hela meningen de är hämtade ur, och togs in på ett ` +
        "mänskligt beslut med skälet utskrivet i löftets historik."
      : "";

  const varforFlyttad =
    flyttade > 0
      ? "Ett citat ska visa vad partiet lovat, med den nivå partiet självt angett. Ett utplock " +
        "ur en längre mening kan utelämna just det. "
      : "";
  const varforReparad =
    reparerade > 0
      ? "Ett citat som inte går att hitta i sin källa går inte heller att kontrollera, och då är " +
        "det inte längre ett belägg. "
      : "";

  return {
    date: datum,
    affects: `${ider.join(", ")} — ${byten.length} ${byten.length === 1 ? "citat" : "citat"} utbytta`,
    what:
      [flyttadText, reparadText].filter(Boolean).join(" ") +
      " Varje nytt citat är hämtat ur källan och kontrollerat ord för ord." +
      paUndantagText,
    why:
      varforFlyttad +
      varforReparad +
      "Beloppet och bedömningen är oförändrade — det är citatet som bytt mening, inte prislappen.",
    // Backfillas i en andra commit, samma mönster som övriga dataändringar.
    commit: "0000000",
  };
}
