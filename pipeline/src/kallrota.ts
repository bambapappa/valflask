/**
 * Källröta — vad ett svar från en källa betyder.
 *
 * Frågevågen har haft rötbevakning sedan lanseringen; Fläskvågens 700+ källor
 * har aldrig haft någon. Den 9 augusti 2026 visade sig två publicerade löften
 * peka på en adress som svarar 404, och det hittades av en slump när en
 * arkivkopia skulle sättas. En källa som inte går att öppna är ingen källa —
 * läsaren ska kunna kontrollera oss, och kunde inte det.
 *
 * Bedömningen ligger här och inte i skriptet för att den ska gå att pröva utan
 * att någon rör nätet.
 */
import { normalizeForVerbatim } from "./gates.ts";
import { quoteInSnapshotText } from "./archive-verify.ts";

/**
 * `ok` källan svarar och citatet står kvar ordagrant.
 * `andrad` källan svarar, men citatet står inte längre där.
 * `borttagen` källan svarar 404/410 — sidan är borta.
 * `obestamd` vi vet inte: nätfel, timeout, 429, 5xx.
 *
 * **`obestamd` ändrar aldrig en status.** Vi anklagar ingen för att ha tagit
 * bort en sida på grund av vårt eget nätstrul — samma regel som arkivsvepets
 * `oavgjort`, och samma skäl.
 */
export type Rotutfall = "ok" | "andrad" | "borttagen" | "obestamd";

/** Vad statuskoden ensam säger, innan texten ens hämtats. */
export function utfallAvStatus(status: number): Rotutfall | null {
  if (status === 404 || status === 410) return "borttagen";
  if (status < 200 || status >= 300) return "obestamd";
  return null; // svaret duger — citatet avgör
}

/**
 * Står citatet kvar i källans text? Samma kanon som citatgrinden och
 * arkivkontrollen, inklusive att citatets avslutande skiljetecken inte avgör
 * något (mänskligt beslut 2026-08-09).
 */
export function utfallAvText(text: string, quote: string): Rotutfall {
  if (normalizeForVerbatim(quote) === "") return "obestamd";
  return quoteInSnapshotText(text, quote) ? "ok" : "andrad";
}

/** Ska den här statusen skrivas in? Ett obestämt svar lämnar allt orört. */
export function skaSkrivas(gammal: Rotutfall | undefined, ny: Rotutfall): boolean {
  return ny !== "obestamd" && gammal !== ny;
}
