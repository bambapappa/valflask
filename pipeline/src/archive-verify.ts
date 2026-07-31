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

const UA = "DrygastBot/1.0 (+https://drygast.nu/om)";

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
  let res: Response;
  try {
    res = await httpFetch(archiveUrl.split("#")[0]!, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/pdf" },
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
  return normalizeForVerbatim(text).includes(normalizeForVerbatim(quote));
}
