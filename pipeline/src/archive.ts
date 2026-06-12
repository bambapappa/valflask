export interface ArchiveResult {
  archive_url: string | null;
  retry: boolean;
}

export type ArchiveFn = (url: string) => Promise<ArchiveResult>;

export async function archiveViaWayback(url: string): Promise<ArchiveResult> {
  try {
    const res = await fetch(`https://web.archive.org/save/${url}`, {
      method: "GET",
      headers: {
        "User-Agent": "DrygastBot/1.0 (+https://drygast.nu/om)",
      },
      redirect: "follow",
    });
    if (!res.ok) return { archive_url: null, retry: true };
    const finalUrl = res.url;
    if (finalUrl && finalUrl.includes("web.archive.org")) {
      return { archive_url: finalUrl, retry: false };
    }
    return { archive_url: null, retry: true };
  } catch {
    return { archive_url: null, retry: true };
  }
}

export function mockArchive(_url: string): Promise<ArchiveResult> {
  return Promise.resolve({ archive_url: null, retry: false });
}
