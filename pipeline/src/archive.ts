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
const UA = "UtlovatBot/1.0 (+https://utlovat.se/om)";

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

  const snapshot = snapshotUrUrSparsvar(res);
  if (snapshot) return { archive_url: snapshot, retry: false };

  return { archive_url: null, retry: true };
}

/**
 * Ögonblicksbildens adress ur svaret på en sparbegäran.
 *
 * Wayback svarar på `/save/<url>` med en omdirigering till den kopia den just
 * skapade, så adressen finns redan i svaret. Den uppgiften är värd att kunna
 * plocka ut på ett ställe: `archive-backfill.mts` kastade förut svaret och
 * frågade i stället availability-API:t 90 sekunder senare om vad som sparats.
 * Det API:t indexerar långsammare än så. Mätt i pipelinekörning 31955869060:
 * tolv kopior sparades, tolv svarade «ännu ej indexerad», och körningen slutade
 * med «Inga archive_url uppdaterade» — arbetet gjordes varje körning och
 * kastades varje gång.
 *
 * Adressen är ingen garanti för att kopian duger. Den som använder den måste
 * fortfarande hämta ögonblicksbilden och pröva att citatet står i den ord för
 * ord; det är den kontrollen som avgör, inte att arkivet svarade.
 */
export function snapshotUrUrSparsvar(res: {
  url?: string;
  headers: { get(namn: string): string | null };
}): string | null {
  // Adressen måste vara en ögonblicksbild, inte vilken arkivadress som helst.
  // Kontrollen läste förut bara värdnamnet, och `/save/<url>` bär samma
  // värdnamn: följdes inte omdirigeringen tog den sparadressen för kopian.
  // En sådan länk ser riktig ut och leder läsaren till en ny sparning i
  // stället för till beviset.
  const ar_ogonblicksbild = (u: string): boolean => /^https?:\/\/web\.archive\.org\/web\/\d+/u.test(u);

  const finalUrl = res.url;
  if (finalUrl && ar_ogonblicksbild(finalUrl)) return finalUrl;

  const location = res.headers.get("location");
  if (location && ar_ogonblicksbild(location)) return location;

  return null;
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
  //
  // Mätt 2026-08-17, och det är värt att veta innan någon förlitar sig på
  // det här spåret: **sparandet är CAPTCHA-skyddat.** En enda begäran mot
  // /submit/ från en vanlig hemmauppkoppling gav 429 med en CAPTCHA i
  // svaret. Uppslaget mot /newest/ svarar däremot normalt (302 på arkiverat,
  // 404 på oarkiverat). Reservarkivet duger alltså till att HITTA kopior men
  // inte till att SKAPA dem, och en bot-kontroll är inget vi löser — den är
  // tjänstens sätt att säga nej. Vill man ha ett andra spår som faktiskt kan
  // spara krävs en tjänst med riktig API-nyckel, till exempel Perma.cc.
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

/**
 * Uppslag UTAN sparande: finns redan en färdig ögonblicksbild hos
 * archive.today? Skild från `archiveViaArchiveToday`, som sparar när den inte
 * hittar något — och sparandet är det dyra, det strypta och det som ska ha en
 * budget. Ett uppslag är billigt och kan göras för varje källa.
 *
 * Skälet till att den finns: 2026-08-17 låg Internet Archive nere hela
 * morgonen, och backfillen — som bara talade med Wayback — rapporterade
 * «saknas» för 26 käll-URL:er. Reservspåret fanns redan i den här filen sedan
 * länge, men bara i `archiveWithFallback`, som backfillen aldrig anropade.
 * Kapaciteten fanns; kopplingen saknades.
 *
 * Returnerar `null` både när ingen kopia finns och när tjänsten inte svarar.
 * De två skiljs åt av anroparen, som vet vad den ska göra med skillnaden.
 */
export async function slaUppArchiveToday(
  url: string,
  httpFetch: HttpFetch = globalThis.fetch.bind(globalThis),
): Promise<string | null> {
  try {
    const res = await httpFetch(`https://${ARCHIVE_TODAY_HOST}/newest/${url}`, {
      method: "GET",
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(ARCHIVE_TODAY_TIMEOUT_MS),
    });
    return extractArchiveTodayUrl(res);
  } catch {
    return null;
  }
}

/* ────────────────────────────────────────────────────── Ghostarchive ── */

const GHOST_HOST = "ghostarchive.org";
/** En färdig ögonblicksbild hos Ghostarchive. `varchive` är videoarkivet. */
const GHOST_SNAPSHOT_RE = /\/(v?archive)\/([A-Za-z0-9_-]{4,})/;

/**
 * Uppslag hos Ghostarchive — tredje spåret, och det enda som arkiverar
 * YouTube-video.
 *
 * Mätt 2026-08-17, samma dag som archive.today: **sökningen är öppen**
 * (`GET /search?term=` svarar 200 utan hinder) men **sparandet ligger bakom
 * en Cloudflare-utmaning** (`POST /archive2` svarar 403 «Just a moment…»).
 * Två oberoende gratisarkiv, båda öppna för läsning och stängda för
 * automatiskt skrivande — det är inte en egenhet hos det ena.
 *
 * Träffen godtas bara om den EXAKTA adressen står i svaret. Sökningen är
 * mönsterbaserad och kan annars ge kopior av andra sidor på samma domän, och
 * en kopia av grannsidan är inget belägg för vårt citat.
 */
export async function slaUppGhostarchive(
  url: string,
  httpFetch: HttpFetch = globalThis.fetch.bind(globalThis),
): Promise<string | null> {
  try {
    const res = await httpFetch(
      `https://${GHOST_HOST}/search?term=${encodeURIComponent(url)}`,
      { method: "GET", headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(30_000) },
    );
    if (!res.ok) return null;
    const html = await res.text();
    if (!html.includes(url)) return null; // sökträffar för något annat
    const m = GHOST_SNAPSHOT_RE.exec(html);
    return m ? `https://${GHOST_HOST}/${m[1]}/${m[2]}` : null;
  } catch {
    return null;
  }
}

/**
 * Vilken tjänst en kopia ligger hos. Härleds ur adressen i stället för att
 * lagras i ett eget fält: adressen kan inte glida isär från sig själv, och ett
 * fält som säger något annat än länken är ett fel som ingen upptäcker.
 */
export function arkivleverantor(
  archiveUrl: string | null | undefined,
): "wayback" | "archive.today" | "ghostarchive" | "okand" {
  if (!archiveUrl) return "okand";
  if (/(^|\/\/)web\.archive\.org\//.test(archiveUrl)) return "wayback";
  if (/(^|\/\/)archive\.(?:ph|today|is|li|vn|fo|md)\//.test(archiveUrl)) return "archive.today";
  if (/(^|\/\/)ghostarchive\.org\//.test(archiveUrl)) return "ghostarchive";
  return "okand";
}

/**
 * Är adressen en VIDEOkopia? Den bär ingen text att pröva citatet mot, och
 * får därför aldrig hamna i `archive_url` — se `video_archive_url` i
 * `arkivvantan.ts` och metodsidans stycke om talade källor.
 */
export function arVideokopia(archiveUrl: string | null | undefined): boolean {
  return Boolean(archiveUrl && /(^|\/\/)ghostarchive\.org\/varchive\//.test(archiveUrl));
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
