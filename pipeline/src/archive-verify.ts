/**
 * Arkivverifiering (extern granskning 2026-07-16): en arkivkopia som inte
 * innehåller citatet backar inte beskedet — Wayback-availability returnerar
 * NÄRMASTE snapshot, som kan vara äldre än sidinnehållet (4 av 25 HTML-arkiv
 * saknade sitt citat). Regeln är därför: ett arkiv accepteras ENDAST om
 * citatet står ordagrant i själva snapshotten, annars begärs en färsk kopia
 * eller lämnas fältet tomt (rot-watchen försöker igen veckovis).
 */
import { extractPdfText, looksLikePdf, stripHtml } from "./fetch.ts";
import { normalizeForVerbatim } from "./gates.ts";
import type { HttpFetch } from "./archive.ts";

const UA = "UtlovatBot/1.0 (+https://utlovat.se/om)";

/**
 * Hämtar arkivkopian och avgör om citatet står ordagrant i den (G3-kanon).
 * null = gick inte att avgöra (nätfel/timeout) — behandlas som "inte backad"
 * av anropare som ska skriva data, men utan att anklaga snapshotten.
 */
export async function snapshotBacksQuote(
  archiveUrl: string,
  quote: string,
  httpFetch: HttpFetch = globalThis.fetch.bind(globalThis),
): Promise<boolean | null> {
  const text = await snapshotText(archiveUrl, httpFetch);
  if (text === null) return null;
  return quoteInSnapshotText(text, quote);
}

/**
 * Hämtar ögonblicksbildens text. Skild från prövningen för att en sida ofta
 * bär FLERA citat — arkivsvepet prövar alla löften från samma källa mot en
 * enda hämtning i stället för att hämta om per citat. null = gick inte att
 * avgöra (nätfel/timeout), aldrig "citatet saknas".
 */
export async function snapshotText(
  archiveUrl: string,
  httpFetch: HttpFetch = globalThis.fetch.bind(globalThis),
): Promise<string | null> {
  let res: Response;
  try {
    res = await httpFetch(archiveUrl.split("#")[0]!, {
      // Accept MÅSTE vara */*. Listas text/html först svarar Wayback med sin
      // egen omslagssida i stället för den arkiverade filen — den innehåller
      // förstås inte citatet, och kontrollen underkände då VARJE PDF-källa.
      // Mätt 2026-08-07: 125 av 125 PDF:er föll, 0 av 343 HTML-sidor. Samma
      // ögonblicksbild ger 9 721 byte HTML med det gamla huvudet och 2 619 329
      // byte PDF utan det.
      headers: { "User-Agent": UA, Accept: "*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let text: string;
  try {
    const bytes = new Uint8Array(await res.arrayBuffer());
    text = looksLikePdf(res.headers.get("content-type"), bytes)
      ? (await extractPdfText(bytes)).pages.join("\n")
      : stripHtml(new TextDecoder("utf-8").decode(bytes));
  } catch {
    return null;
  }
  return text;
}

/** Samma kanon som citatgrinden: ordagrant, men okänsligt för vitrum. */
export function quoteInSnapshotText(snapshotText: string, quote: string): boolean {
  return normalizeForVerbatim(snapshotText).includes(normalizeForVerbatim(quote));
}
