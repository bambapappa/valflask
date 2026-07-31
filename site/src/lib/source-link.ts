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
