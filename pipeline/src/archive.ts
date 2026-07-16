export interface ArchiveResult {
  archive_url: string | null;
  retry: boolean;
}

export type ArchiveFn = (url: string) => Promise<ArchiveResult>;
export type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>;

const WAYBACK_TIMEOUT_MS = 15_000;
const ARCHIVE_TODAY_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 1_000;
const UA = "DrygastBot/1.0 (+https://drygast.nu/om)";

/* ─────────────────────────────────────────────────────────── Wayback ── */

async function waybackSave(
  url: string,
  httpFetch: HttpFetch,
  timeoutMs: number,
): Promise<ArchiveResult> {
  const saveUrl = `https://web.archive.org/save/${url}`;
  const res = await httpFetch(saveUrl, {
    method: "GET",
    headers: { "User-Agent": UA },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (res.status === 403 || res.status === 503) return { archive_url: null, retry: true };
  if (!res.ok) return { archive_url: null, retry: true };

  const finalUrl = res.url;
  if (finalUrl && finalUrl.includes("web.archive.org")) return { archive_url: finalUrl, retry: false };

  const location = res.headers.get("location");
  if (location && location.includes("web.archive.org")) return { archive_url: location, retry: false };

  return { archive_url: null, retry: true };
}

export async function archiveViaWayback(url: string, httpFetch: HttpFetch = globalThis.fetch.bind(globalThis)): Promise<ArchiveResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await waybackSave(url, httpFetch, WAYBACK_TIMEOUT_MS);
    } catch {
      if (attempt < MAX_RETRIES) await sleep(BACKOFF_BASE_MS * (2 ** attempt));
    }
  }
  return { archive_url: null, retry: true };
}

/* ───────────────────────────────────────────────────── archive.today ── */

/** archive.today-speglar. Alla ger samma innehåll; ph är den vanligaste. */
const ARCHIVE_TODAY_HOST = "archive.ph";
const AT_SNAPSHOT_RE =
  /https?:\/\/archive\.(?:ph|today|is|li|vn|fo|md)\/(?:\d{4,14}\/\S+?|[A-Za-z0-9]{4,6})(?=["'\s<>]|$)/;
/** Åtgärds-/mellanlägessökvägar som INTE är en färdig ögonblicksbild. */
const AT_ACTION_PATH_RE = /archive\.(?:ph|today|is|li|vn|fo|md)\/(?:submit|newest|wip|o|search|https?:)/i;

/**
 * Plockar ut en färdig archive.today-ögonblicksbild-URL ur ett svar
 * (res.url efter redirect, Location- eller Refresh-header). Returnerar null
 * för åtgärdssidor (submit/newest) och pågående arkivering (wip) — vi lagrar
 * bara en stabil, färdig kopia. Exporterad för enhetstest.
 */
export function extractArchiveTodayUrl(res: Pick<Response, "url"> & { headers: Headers }): string | null {
  const refresh = res.headers.get("refresh") ?? "";
  const refreshUrl = /url=([^;\s]+)/i.exec(refresh)?.[1] ?? "";
  const candidates = [res.url ?? "", res.headers.get("location") ?? "", refreshUrl];
  for (const c of candidates) {
    if (!c || AT_ACTION_PATH_RE.test(c)) continue;
    const m = AT_SNAPSHOT_RE.exec(c);
    if (m) return m[0].replace(/^http:/, "https:");
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function archiveTodayOnce(
  url: string,
  httpFetch: HttpFetch,
  timeoutMs: number,
): Promise<ArchiveResult> {
  const get = (u: string) =>
    httpFetch(u, { method: "GET", headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });

  // 1. Finns redan en ögonblicksbild? (billigt, ingen ny arkivering)
  try {
    const existing = extractArchiveTodayUrl(await get(`https://${ARCHIVE_TODAY_HOST}/newest/${url}`));
    if (existing) return { archive_url: existing, retry: false };
  } catch { /* faller vidare till submit */ }

  // 2. Begär ny arkivering.
  let submitRes: Response;
  try {
    submitRes = await get(`https://${ARCHIVE_TODAY_HOST}/submit/?url=${encodeURIComponent(url)}`);
  } catch {
    return { archive_url: null, retry: true };
  }
  // 429/anti-bot: archive.today strular ofta från datacenter-IP — retry senare.
  if (submitRes.status === 429 || submitRes.status === 403) return { archive_url: null, retry: true };
  const fromSubmit = extractArchiveTodayUrl(submitRes);
  if (fromSubmit) return { archive_url: fromSubmit, retry: false };

  // 3. Arkiveringen kan vara "wip"; vänta kort och kolla newest igen.
  await sleep(8_000);
  try {
    const after = extractArchiveTodayUrl(await get(`https://${ARCHIVE_TODAY_HOST}/newest/${url}`));
    if (after) return { archive_url: after, retry: false };
  } catch { /* ge upp för denna körning */ }

  return { archive_url: null, retry: true };
}

export async function archiveViaArchiveToday(url: string, httpFetch: HttpFetch = globalThis.fetch.bind(globalThis)): Promise<ArchiveResult> {
  try {
    return await archiveTodayOnce(url, httpFetch, ARCHIVE_TODAY_TIMEOUT_MS);
  } catch {
    return { archive_url: null, retry: true };
  }
}

/* ───────────────────────────────────────── kedja: Wayback → today ── */

/**
 * Arkiverar med Wayback som primär och archive.today som fallback för det
 * Wayback vägrar (robots/rate-limit). Bägge är kontofria och oberoende.
 * retry=true bara om BÅDA misslyckas — då står rot-checken + git-historiken
 * som integritetsgaranti tills nästa försök.
 */
export async function archiveWithFallback(url: string, httpFetch: HttpFetch = globalThis.fetch.bind(globalThis)): Promise<ArchiveResult> {
  const wayback = await archiveViaWayback(url, httpFetch);
  if (wayback.archive_url) return wayback;
  const today = await archiveViaArchiveToday(url, httpFetch);
  if (today.archive_url) return today;
  return { archive_url: null, retry: true };
}

export function createArchiveFn(httpFetch?: HttpFetch): ArchiveFn {
  const fetchFn = httpFetch ?? globalThis.fetch.bind(globalThis);
  return (url: string) => archiveWithFallback(url, fetchFn);
}

export function mockArchive(_url: string): Promise<ArchiveResult> {
  return Promise.resolve({ archive_url: null, retry: false });
}
