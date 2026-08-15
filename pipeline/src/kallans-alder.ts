/**
 * Hur gammal är sidan ett löfte är skördat ur?
 *
 * Ett löftes `date_stated` sätts till skördedagen när sidan inte bär något
 * eget datum. Praxisen är rimlig för en sida som beskriver partiets gällande
 * politik — men den sattes utan att någon mätt åldern, och en av
 * Kristdemokraternas A–Ö-sidor visade sig vara senast uppdaterad i **juli
 * 2022**, alltså före förra valet. Modulen finns för att frågan ska gå att
 * mäta i stället för att gissas (ATTGORA B3).
 *
 * Ren textbehandling utan nätverk — hämtningen ligger i
 * `scripts/kallans-alder.mts`, så att proven går offline.
 */

/** Var datumet stod, i den ordning kontrollen litar på dem. */
export type Alderskalla =
  | "senast-uppdaterad" // sidans egen, synliga rad — det läsaren ser
  | "time-updated" // <time class="updated" datetime="…">
  | "article:modified_time" // Open Graph-metadata
  | "dateModified"; // JSON-LD

export interface Sidalder {
  /** ISO-datum, YYYY-MM-DD. */
  datum: string;
  kalla: Alderskalla;
}

const MANADER: Record<string, string> = {
  januari: "01",
  februari: "02",
  mars: "03",
  april: "04",
  maj: "05",
  juni: "06",
  juli: "07",
  augusti: "08",
  september: "09",
  oktober: "10",
  november: "11",
  december: "12",
};

/**
 * «4 juli 2022» → «2022-07-04».
 *
 * Kristdemokraternas sidinformation skriver datumet på svenska, i klartext.
 * Ingen annan form gissas: står där något vi inte känner igen svarar
 * funktionen null, och sidan räknas som utan datum i stället för som färsk.
 */
export function svensktDatum(text: string): string | null {
  const m = /^\s*(\d{1,2})\s+([a-zåäö]+)\s+(\d{4})\s*$/iu.exec(text);
  if (!m) return null;
  const manad = MANADER[m[2]!.toLowerCase()];
  if (!manad) return null;
  return `${m[3]}-${manad}-${String(Number(m[1])).padStart(2, "0")}`;
}

/** Plockar ISO-datumet ur en tidsstämpel, oavsett tidszonssuffix. */
function isoDatum(varde: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/u.exec(varde.trim());
  return m ? m[1]! : null;
}

/**
 * Sidans senaste ändring, läst ur html:en.
 *
 * Ordningen är inte godtycklig: **den synliga raden går före metadatan.**
 * Ser läsaren «Senast uppdaterad: 4 juli 2022» är det sidans besked om sin
 * egen ålder, och ett CMS-fält som säger något annat beskriver när någon rörde
 * mallen — inte när politiken skrevs. Svaret är null när sidan inte säger
 * något alls; en sida utan datum ska räknas som just det, aldrig som färsk.
 */
export function sidansAlder(html: string): Sidalder | null {
  const synlig = /Senast uppdaterad:?\s*<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/iu.exec(html);
  if (synlig) {
    const datum = svensktDatum(synlig[1]!);
    if (datum) return { datum, kalla: "senast-uppdaterad" };
  }

  const time = /<time[^>]*class="[^"]*\bupdated\b[^"]*"[^>]*datetime="([^"]+)"/iu.exec(html);
  if (time) {
    const datum = isoDatum(time[1]!);
    if (datum) return { datum, kalla: "time-updated" };
  }

  const og = /<meta[^>]*property="article:modified_time"[^>]*content="([^"]+)"/iu.exec(html);
  if (og) {
    const datum = isoDatum(og[1]!);
    if (datum) return { datum, kalla: "article:modified_time" };
  }

  const jsonld = /"dateModified"\s*:\s*"([^"]+)"/u.exec(html);
  if (jsonld) {
    const datum = isoDatum(jsonld[1]!);
    if (datum) return { datum, kalla: "dateModified" };
  }

  return null;
}

/**
 * Hur långt före ett datum sidan senast ändrades, i hela dagar.
 *
 * Negativt tal betyder att sidan ändrats efter jämförelsedagen — det är inget
 * fel, bara en sida som rörts efter att vi skördade den.
 */
export function alderIDagar(sidansDatum: string, jamforMed: string): number {
  const ms = Date.parse(`${jamforMed}T00:00:00Z`) - Date.parse(`${sidansDatum}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}
