/**
 * Filmkällornas adresser — rena funktioner, skilda från skriptet som använder
 * dem.
 *
 * De låg först i `scripts/film-arkiv.mts`. Det gick inte: skriptet har
 * toppnivåkod och `process.exit`, så ett test som importerade helperna
 * startade hela körningen och dog efter första provet. Fem prov blev ett, och
 * sviten var grön. En modul som kör något när den importeras går inte att
 * pröva.
 */

/** Är källan en film? */
export const arFilm = (url: string): boolean => /youtube\.com|youtu\.be/.test(url);

/**
 * Sändningens egen adress, utan tidsstämpel.
 *
 * Löftenas källor bär ofta `&t=1180s`, som pekar på ögonblicket citatet sades.
 * Arkivet håller sändningen, inte klippet — söker vi på tidsstämpeladressen
 * hittar vi aldrig kopian.
 */
export function filmensAdress(url: string): string {
  const v = /[?&]v=([A-Za-z0-9_-]{6,})/.exec(url);
  if (v) return `https://www.youtube.com/watch?v=${v[1]}`;
  const kort = /youtu\.be\/([A-Za-z0-9_-]{6,})/.exec(url);
  return kort ? `https://www.youtube.com/watch?v=${kort[1]}` : url.split("&")[0]!;
}
