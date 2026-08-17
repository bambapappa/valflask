/**
 * Väntan på arkivet — skillnaden mellan «vi kan inte» och «vi lät bli».
 *
 * VARFÖR DET HÄR FINNS
 *
 * 2026-08-17 låg Internet Archive nere hela morgonen: 502 och 503 på både
 * availability- och CDX-API:t. Samma morgon godkändes 47 löften ur
 * granskningskön, och ingen av dem kunde få en arkivkopia. Arkivluckan gick
 * från 6,12 till 11,88 procent, och prosagrinden föll — helt riktigt, för
 * metodsidan lovar att nästan varje citat har en kopia.
 *
 * Men grinden mätte bara EN sak: hur stor luckan är. Den kunde inte skilja
 * «kopian finns inte» från «vi nådde inte fram till arkivet», och den
 * skillnaden är hela saken. Det första är en mätning vi ska stå för. Det
 * andra är ett okänt läge som ska gå över — och som under tiden gör att
 * bygget står rött i dagar, vilket betyder att sajten visar gammalt data av
 * ett skäl som inte har med datat att göra.
 *
 * DEN HÄR MODULEN ÄR INTE EN UPPMJUKNING AV GRINDEN
 *
 * Regeln nedan släpper igenom en lucka över taket **bara** när varje källa
 * över taket väntar på ett arkiv som inte svarat, **och** ingen har väntat
 * längre än `TAK_DYGN`. Två saker följer av det:
 *
 *   · Interimet kan aldrig bli permanent. Passerar en källa åldersgränsen
 *     faller bygget ändå, och då är det inte längre arkivets fel utan vårt.
 *   · Läsaren får veta. Metodsidan bär en genererad rad så länge väntan
 *     pågår, med antal och sedan när. Den försvinner av sig själv när talet
 *     är noll. Tyst rättelse är förbjuden, och tyst undantag likaså.
 *
 * Citatgrinden är oförändrad: en kopia godtas fortfarande bara om citatet
 * står ordagrant i själva ögonblicksbilden, oavsett vilken tjänst den ligger
 * hos.
 */

/** Hur länge en källa får stå och vänta innan bygget faller ändå. */
export const TAK_DYGN = 14;

/** Utfallet av det senaste arkivförsöket för en käll-URL. */
export type Vantanutfall =
  /** Arkivet svarade inte alls — nätfel eller 5xx. Inget besked om kopian. */
  | "arkivet_svarade_inte"
  /** Arkivet svarade, och hade ingen kopia. Det är en mätning. */
  | "ingen_kopia"
  /** Kopian finns men bär inte citatet ordagrant. Också en mätning. */
  | "bar_inte_citatet";

export interface Vantanpost {
  /** Käll-URL utan #fragment — samma nyckel som backfillen grupperar på. */
  url: string;
  /** När källan först ställdes på väntan, ISO-datum. */
  forsta: string;
  /** Senaste försöket, ISO-datum. */
  senaste: string;
  /** Hur många gånger vi försökt. */
  forsok: number;
  utfall: Vantanutfall;
}

export interface Vantan {
  poster: Vantanpost[];
}

export const TOM_VANTAN: Vantan = { poster: [] };

const dygnMellan = (fran: string, till: string): number =>
  Math.floor((Date.parse(till) - Date.parse(fran)) / 86_400_000);

export interface Vantanbesked {
  /** Får luckan vara över taket just nu? */
  godtas: boolean;
  /** Källor som väntar på ett arkiv som inte svarat. */
  vantande: Vantanpost[];
  /** Väntande som passerat åldersgränsen — de fäller bygget. */
  forGamla: Vantanpost[];
  /** Äldsta väntans startdatum, för raden läsaren ser. */
  sedan: string | null;
}

/**
 * Prövar väntan. Ren funktion — `nu` skickas in, aldrig läst ur klockan, så
 * provet går att köra i ett test utan att bero på vilken dag det körs.
 *
 * `godtas` är sant bara om det finns minst en väntande källa och ingen av
 * dem är för gammal. Är listan tom finns inget att godta: då ska den vanliga
 * täckningsregeln gälla oförändrad.
 */
export function provaVantan(vantan: Vantan, nu: string): Vantanbesked {
  const vantande = vantan.poster.filter((p) => p.utfall === "arkivet_svarade_inte");
  const forGamla = vantande.filter((p) => dygnMellan(p.forsta, nu) > TAK_DYGN);
  const sedan = vantande.length > 0
    ? vantande.map((p) => p.forsta).sort()[0]!
    : null;
  return {
    godtas: vantande.length > 0 && forGamla.length === 0,
    vantande,
    forGamla,
    sedan,
  };
}

/**
 * Skriver in ett försök. Lyckas arkiveringen tas posten bort — väntan är
 * över, och en post som ligger kvar skulle säga att vi fortfarande väntar på
 * något vi redan har.
 */
export function skrivForsok(
  vantan: Vantan,
  url: string,
  utfall: Vantanutfall | "kopia",
  nu: string,
): Vantan {
  const kvar = vantan.poster.filter((p) => p.url !== url);
  if (utfall === "kopia") return { poster: kvar };
  const gammal = vantan.poster.find((p) => p.url === url);
  const post: Vantanpost = {
    url,
    forsta: gammal?.forsta ?? nu,
    senaste: nu,
    forsok: (gammal?.forsok ?? 0) + 1,
    utfall,
  };
  return { poster: [...kvar, post].sort((a, b) => a.url.localeCompare(b.url)) };
}
