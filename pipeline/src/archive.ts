export interface ArchiveResult {
  archive_url: string | null;
  retry: boolean;
}

export type ArchiveFn = (url: string) => Promise<ArchiveResult>;

const WAYBACK_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 1_000;

async function waybackSave(
  url: string,
  httpFetch: (url: string, init?: RequestInit) => Promise<Response>,
  timeoutMs: number,
): Promise<ArchiveResult> {
  const saveUrl = `https://web.archive.org/save/${url}`;
  const res = await httpFetch(saveUrl, {
    method: "GET",
    headers: {
      "User-Agent": "DrygastBot/1.0 (+https://drygast.nu/om)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (res.status === 403 || res.status === 503) {
    return { archive_url: null, retry: true };
  }

  if (!res.ok) return { archive_url: null, retry: true };

  const finalUrl = res.url;
  if (finalUrl && finalUrl.includes("web.archive.org")) {
    return { archive_url: finalUrl, retry: false };
  }

  const location = res.headers.get("location");
  if (location && location.includes("web.archive.org")) {
    return { archive_url: location, retry: false };
  }

  return { archive_url: null, retry: true };
}

export async function archiveViaWayback(url: string): Promise<ArchiveResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await waybackSave(url, globalThis.fetch.bind(globalThis), WAYBACK_TIMEOUT_MS);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < MAX_RETRIES) {
        const delay = BACKOFF_BASE_MS * (2 ** attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return { archive_url: null, retry: true };
}

export function createArchiveFn(
  httpFetch?: (url: string, init?: RequestInit) => Promise<Response>,
  timeoutMs: number = WAYBACK_TIMEOUT_MS,
): ArchiveFn {
  const fetchFn = httpFetch ?? globalThis.fetch.bind(globalThis);

  return async (url: string): Promise<ArchiveResult> => {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await waybackSave(url, fetchFn, timeoutMs);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (attempt < MAX_RETRIES) {
          const delay = BACKOFF_BASE_MS * (2 ** attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    return { archive_url: null, retry: true };
  };
}

export function mockArchive(_url: string): Promise<ArchiveResult> {
  return Promise.resolve({ archive_url: null, retry: false });
}
