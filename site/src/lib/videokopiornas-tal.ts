/**
 * Talen om videokopiorna, slagna upp vid varje bygge.
 *
 * Samma skäl som `arkivvantans-tal.ts`: en siffra inskriven i löptexten blir
 * en tyst osanning den dag datat rör sig. Raden ska dessutom inte finnas alls
 * innan kopiorna gör det — prosan får inte påstå ett belägg som inte är på
 * plats.
 *
 * Läses genom sajtens egen dataladdare. Att räkna fram sökvägen själv gav
 * 2026-08-17 talet 0 i Astro-bygget medan datat sade 55, och raden föll bort
 * tyst. Ett andra sätt att hitta datat är ett sätt för mycket.
 */
import { loadData } from "./data.ts";

interface Kalla {
  url: string;
  video_archive_url?: string | null;
}
interface Lofte { status?: string; source: Kalla }

export interface Videokopietal {
  /** Löften ur tal och video, aktiva. */
  totalt: number;
  /** Hur många av dem som har en videokopia hos ett arkiv. */
  medKopia: number;
  /** Antal sändningar de kommer ur. */
  sandningar: number;
}

const arFilm = (url: string): boolean => /youtube\.com|youtu\.be/.test(url);
const filmId = (url: string): string =>
  /[?&]v=([A-Za-z0-9_-]{6,})/.exec(url)?.[1]
  ?? /youtu\.be\/([A-Za-z0-9_-]{6,})/.exec(url)?.[1]
  ?? url;

export function videokopiornasTal(): Videokopietal {
  let promises: Lofte[];
  try {
    promises = loadData<Lofte[]>("promises.json");
  } catch {
    return { totalt: 0, medKopia: 0, sandningar: 0 };
  }
  const filmer = promises.filter((p) => p.status === "aktiv" && arFilm(p.source.url));
  return {
    totalt: filmer.length,
    medKopia: filmer.filter((p) => p.source.video_archive_url).length,
    sandningar: new Set(filmer.map((p) => filmId(p.source.url))).size,
  };
}
