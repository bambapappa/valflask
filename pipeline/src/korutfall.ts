export interface Artikelmatning {
  fetched: number;
  unseen: number;
  attempted: number;
  succeeded: number;
  failed: number;
}

export interface Kormatning extends Artikelmatning {
  reviewCandidates: number;
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
