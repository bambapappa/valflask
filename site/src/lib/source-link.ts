/**
 * Käll- och arkivlänkarnas etiketter (SPEC-FRAGEVAGEN §7).
 *
 * PDF-djuplänken `…#page=N` respekteras av desktop-webbläsare men ignoreras av
 * många mobilvisare (iOS Safari öppnar alltid sida 1). Vi kan inte ändra det —
 * `#page` är PDF:ens enda standarddjuplänk, och textfragment (`#:~:text=`)
 * fungerar inte i PDF:er. Det bästa vi kan göra är att skriva ut sidnumret
 * SYNLIGT, så att den som hamnar på sida 1 vet vart hen ska bläddra för att
 * verifiera citatet för hand. För HTML-källor är "källa" oförändrat.
 */

/** Sidnummer ur ett `…#page=N`-ankare, annars null. */
export function pdfPage(url: string): number | null {
  const m = /\.pdf#page=(\d+)/iu.exec(url);
  return m ? Number(m[1]) : null;
}

/** Länktext för källänken: "källa (PDF, s. N)" för djuplänkad PDF, annars basen. */
export function sourceLinkLabel(url: string, base = "källa"): string {
  const page = pdfPage(url);
  return page === null ? base : `${base} (PDF, s. ${page})`;
}

/** Motsvarande för arkivlänken. */
export function archiveLinkLabel(url: string): string {
  return sourceLinkLabel(url, "arkiv");
}

/**
 * Källans skick, som läsaren ser det.
 *
 * `ok` säger ingenting — en fungerande källa behöver ingen stämpel. De två
 * andra gör det, och de säger samma sak till läsaren: *gå till arkivkopian*.
 * Frågevågen har visat den här etiketten sedan lanseringen; Fläskvågen fick
 * den 2026-08-09, när den första rötsvepningen över löftenas källor visade att
 * tre publicerade citat inte längre står i sin levande källa.
 *
 * Etiketten hör hemma här och inte i `stances.ts`, för nu läser båda vågorna
 * den. Ett faktum har en plats.
 */
export type Kallstatus = "ok" | "andrad" | "borttagen";

export const KALLSTATUS_ETIKETT: Record<Kallstatus, string | null> = {
  ok: null,
  andrad: "KÄLLAN HAR ÄNDRATS — ARKIVKOPIAN GÄLLER",
  borttagen: "KÄLLAN HAR TAGITS BORT — ARKIVKOPIAN GÄLLER",
};

/**
 * Vad som ändrats, som `pnpm promises:rot-check` mätte det.
 *
 * Stämpeln ovan säger att citatet inte längre står i källan. Den säger inte
 * vad som står där i stället, och utan det ledet är fallet inget en läsare kan
 * pröva — bara något vi påstår. Fälten här är därför mätvärden ur sidan som
 * den ser ut i dag, aldrig omskrivna av oss.
 *
 * Typen bor här av samma skäl som etiketten: båda vågorna läser den, och ett
 * faktum har en plats.
 */
export type Andringsslag = "ordalydelse" | "sidan-utbytt" | "sidan-borttagen";

export interface Kallandring {
  kind: Andringsslag;
  observed_at: string;
  /** Meningen som står där i dag, ordagrant ur källan. */
  now_reads?: string;
  /** Dit adressen leder nu, när den inte längre stannar på sig själv. */
  redirects_to?: string;
  /** Datum då fallet kontrollerats mot båda länkarna. Sätts aldrig av svepet. */
  reviewed_at?: string;
  note?: string;
}
