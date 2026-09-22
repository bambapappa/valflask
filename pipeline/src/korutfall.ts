export interface Artikelmatning {
  fetched: number;
  unseen: number;
  attempted: number;
  succeeded: number;
  failed: number;
  /**
   * Hur många poster källan lämnade till granskning — kandidater och
   * grindavslag tillsammans.
   *
   * Utan det talet slutar mätningen vid `succeeded`, och en källa som läses
   * varje körning utan att någonsin ge en kandidat ser ut som en källa som
   * fungerar. Det är den vanligaste tysta förlustpunkten i kedjan: sidan
   * hämtas, tolkas utan fel, och bär inget löfte.
   */
  kandidater: number;
}

export interface Kormatning extends Artikelmatning {
  reviewCandidates: number;
  /**
   * Per flöde i `sources.yaml`: hämtade artiklar och eventuellt fel.
   *
   * `bySource` byggs ur artiklarna som KOM FRAM och kan därför inte visa en
   * källa som inte gav något alls — den saknas helt i den tabellen. Ett flöde
   * som föll syns bara här.
   */
  floden?: Record<string, { hamtade: number; fel: string | null }>;
  publishedAdded: number;
  publishedTotal: number;
  queuedTotal: number;
  bySource: Record<string, Artikelmatning>;
}

/** Ett befintligt bestånd säger inget om hur den här omgången gick. */
export function korutfall(m: Kormatning): "klar" | "delvis" | "misslyckad" {
  for (const n of [m.fetched, m.unseen, m.attempted, m.succeeded, m.failed]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error("Ogiltig artikelmätning");
  }
  if (m.succeeded + m.failed !== m.attempted || m.attempted > m.unseen || m.unseen > m.fetched) {
    throw new Error("Artikelmätningen går inte ihop");
  }
  if (m.failed === 0) return "klar";
  return m.succeeded === 0 ? "misslyckad" : "delvis";
}

export function sammanfattaKorning(m: Kormatning): string {
  return `Omgång ${korutfall(m)}: ${m.attempted} artiklar, ${m.succeeded} lyckade, ` +
    `${m.failed} fel, ${m.reviewCandidates} löfteskandidater till granskning, ` +
    `${m.publishedAdded} nya publicerade löften. ` +
    `Bestånd: ${m.publishedTotal} löften; kö: ${m.queuedTotal} poster.`;
}
