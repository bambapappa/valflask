export interface Artikelmatning {
  fetched: number;
  unseen: number;
  attempted: number;
  succeeded: number;
  failed: number;
}

export interface Feedhamtning {
  id: string;
  type: string;
  fetched: number;
  accepted: number;
  status: "ok" | "failed";
  error?: string;
}

export interface Kormatning extends Artikelmatning {
  reviewCandidates: number;
  publishedAdded: number;
  publishedTotal: number;
  queuedTotal: number;
  bySource: Record<string, Artikelmatning>;
  feedOutcomes?: Feedhamtning[];
}

/** Ett befintligt bestånd säger inget om hur den här omgången gick. */
export function korutfall(m: Kormatning): "klar" | "delvis" | "misslyckad" {
  for (const n of [m.fetched, m.unseen, m.attempted, m.succeeded, m.failed]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error("Ogiltig artikelmätning");
  }
  if (m.succeeded + m.failed !== m.attempted || m.attempted > m.unseen || m.unseen > m.fetched) {
    throw new Error("Artikelmätningen går inte ihop");
  }
  const feeds = m.feedOutcomes ?? [];
  for (const f of feeds) {
    if (!f.id || !Number.isSafeInteger(f.fetched) || f.fetched < 0 ||
        !Number.isSafeInteger(f.accepted) || f.accepted < 0 || f.accepted > f.fetched ||
        (f.status !== "ok" && f.status !== "failed") ||
        (f.status === "failed" && (f.fetched !== 0 || f.accepted !== 0 || !f.error))) {
      throw new Error("Ogiltig källhämtning");
    }
  }
  const falleradeFeeds = feeds.filter((f) => f.status === "failed").length;
  if (m.failed === 0 && falleradeFeeds === 0) return "klar";
  if (m.succeeded === 0 && (m.failed > 0 || (feeds.length > 0 && falleradeFeeds === feeds.length))) {
    return "misslyckad";
  }
  return "delvis";
}

export function sammanfattaKorning(m: Kormatning): string {
  const falleradeFeeds = (m.feedOutcomes ?? []).filter((f) => f.status === "failed");
  return `Omgång ${korutfall(m)}: ${m.attempted} artiklar, ${m.succeeded} lyckade, ` +
    `${m.failed} artikelfel, ${falleradeFeeds.length} källflödesfel` +
    (falleradeFeeds.length ? ` (${falleradeFeeds.map((f) => f.id).join(", ")})` : "") +
    `, ${m.reviewCandidates} löfteskandidater till granskning, ` +
    `${m.publishedAdded} nya publicerade löften. ` +
    `Bestånd: ${m.publishedTotal} löften; kö: ${m.queuedTotal} poster.`;
}
