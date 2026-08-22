/**
 * Två sorters löften — för ett löfte är ett löfte.
 *
 * VARFÖR. Den oberoende granskningen underkände 148 publicerade löften med
 * motiveringen att citatet var «en värdering eller paroll, inget åtagande».
 * Slutsatsen låg nära att dra in dem allihop. Den slutsatsen var fel, och
 * felet är värt att skriva ner: *«Pensionen ska bli bättre»* och *«Stärka
 * fria medier»* ÄR vallöften. De säger vart partiet vill. Att de inte går att
 * prissätta gör dem inte till reklam — det gör dem till en annan sorts löfte.
 *
 * Men sorterna får inte se likadana ut för läsaren, och det var det verkliga
 * felet. Ett inriktningslöfte med noll bredvid sig läser som en reform som
 * råkar vara gratis. 450 av de aktiva löftena är sådana. När de ligger i samma
 * lista som «Förbjud religiösa friskolor» — också noll, men noll för att ett
 * förbud faktiskt inte kostar staten något — säger nollan två helt olika
 * saker på samma sida utan att någonting skiljer dem åt.
 *
 * REGELN. Ett löfte är en `reform` när citatet pekar ut något som går att
 * göra: ett instrument, en nivå, ett tal, eller en lag- eller regeländring
 * som uträkningen kan prissätta. Annars är det en `inriktning`.
 *
 * Ordningen mellan proven är inte godtycklig. Ett belopp skilt från noll
 * betyder att någon HAR prissatt en åtgärd, och då finns det en åtgärd —
 * det provet går först. Sedan läses citatet, för det är citatet som är
 * löftet; uträkningen är vår text om det. Sist läses uträkningen, som fångar
 * de reformer vars nolla följer av att åtgärden är en regel och inte av att
 * ingen åtgärd är angiven.
 *
 * VAD DEN INTE GÖR. Den avgör inte om löftet är bra, vagt eller trovärdigt,
 * och den flyttar inga pengar: varje inriktningslöfte bär noll redan, så
 * summorna är desamma före och efter att fältet infördes. Den säger bara
 * vilken sorts fråga läsaren ska ställa till posten.
 *
 * GRÄNSFALLEN är verkliga. «Alla ska kunna få ett digitalt ID» blir
 * inriktning trots att det låter konkret, eftersom citatet varken säger vem
 * som bygger det eller vad det kostar. «Motverka betygsinflation» blir reform
 * eftersom ordet «motverka» här är kopplat till ett mätbart tillstånd. Den
 * gränsen är dragen av kod och ska läsas om av en människa — härledningen är
 * en förstaklassning, inte ett facit.
 */

/** Uträkningen förklarar nollan med att åtgärden ÄR en regel, en lag eller en utredning. */
const NOLLAN_AR_EN_REGEL =
  /(löftet|åtgärden|citatet|reformen) (hålls|är|utgörs) (av |en |ett )*(förbud|lag|regel|reglering|avreglering|prisreglering|föreskrift)|ren lagändring|ren regeländring|beredningsarbete|\bSOU\b|utredning|handlingsplan|översyn/iu;

/** Citatet namnger ett medel: ett verb som gör något, eller en nivå. */
const CITATET_NAMNGER_MEDEL =
  /\b(inför\w*|förbjud\w*|förbud|avskaff\w*|lagstadga\w*|slopa\w*|återinför\w*|halver\w*|fördubbl\w*|kriminaliser\w*|legaliser\w*|höj\w+ \w*(skatt|bidrag|ersättning|avdrag|anslag|lön|pension|gräns)|sänk\w+ \w*(skatt|avgift|moms|gräns)|bygg\w+ \d|anställ\w*|utvidga\w*|skärp\w*|ta bort|riv\w+ upp|kvot\w*|tak på|rätt till)\b/iu;

export type Loftestyp = "reform" | "inriktning";

export interface TypKostnad {
  msek_low: number;
  msek_base: number;
  msek_high: number;
  calculation?: string | null;
  method_note?: string | null;
}

/** Härleder löftessorten ur citatet och den prissättning som gjorts. */
export function harledLoftestyp(citat: string, kostnad: TypKostnad): Loftestyp {
  const nollad =
    kostnad.msek_low === 0 && kostnad.msek_base === 0 && kostnad.msek_high === 0;
  if (!nollad) return "reform";
  if (CITATET_NAMNGER_MEDEL.test(citat) || /\d/u.test(citat)) return "reform";
  const text = `${kostnad.calculation ?? ""} ${kostnad.method_note ?? ""}`;
  if (NOLLAN_AR_EN_REGEL.test(text)) return "reform";
  return "inriktning";
}
