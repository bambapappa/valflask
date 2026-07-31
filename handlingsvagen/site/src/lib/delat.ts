/**
 * Det lilla som både byggtidsmodellen och sidans skript behöver.
 *
 * Modulen buntas in i webbläsaren, så den får ALDRIG röra `node:fs` eller
 * något annat som bara finns vid bygget. Ligger den här slipper vi en kopia
 * av samma regler i sidan — två kopior går tyst isär, och då säger sidan
 * något annat än det som står i skärvan.
 */

/**
 * Partiernas bitordning i ordskärvans partikoder. Bokstavsordning på koden,
 * inte ordningen i `parties.json`: filen kan skrivas om, och en ordning som
 * ändras skulle tyst flytta varje redan byggd skärvas partier ett steg.
 */
export const PARTIBITAR: readonly string[] = ["c", "kd", "l", "m", "mp", "s", "sd", "v"];

/** Partikoderna som en bitmask — åtta partier ryms i en byte. */
export function partiMask(koder: readonly string[]): number {
  let mask = 0;
  for (const kod of koder) {
    const bit = PARTIBITAR.indexOf(kod);
    if (bit >= 0) mask |= 1 << bit;
  }
  return mask;
}

/** Bitmasken tillbaka till partikoder (samma ordning som `PARTIBITAR`). */
export function maskPartier(mask: number): string[] {
  return PARTIBITAR.filter((_, bit) => (mask & (1 << bit)) !== 0);
}

/** Ett partis röster i en votering: ja, nej, avstår, frånvarande. */
export type Roster = [number, number, number, number];

export type Standpunkt = "ja" | "nej" | "avstar" | "franvarande";

export const STANDPUNKT_TEXT: Record<Standpunkt, string> = {
  ja: "Ja",
  nej: "Nej",
  avstar: "Avstod",
  franvarande: "Frånvarande",
};

/**
 * Partiets ståndpunkt i en votering: den röst flest av dess ledamöter lade.
 *
 * `delad` sätts när partiet lade mer än ett slags röst. Det är inget
 * undantag som ska döljas — ett parti som röstar åt två håll har gjort
 * just det, och en sida som bara visar majoritetsrösten skulle utplåna
 * det. Röstade ingen alls är partiet frånvarande, inte "avstod":
 * att avstå är en handling, att inte vara där är det inte.
 */
export function partiStandpunkt(r: Roster): { val: Standpunkt; delad: boolean } {
  const [ja, nej, avstar] = r;
  const lagda = ja + nej + avstar;
  if (lagda === 0) return { val: "franvarande", delad: false };
  const storst = Math.max(ja, nej, avstar);
  const val: Standpunkt = storst === ja ? "ja" : storst === nej ? "nej" : "avstar";
  return { val, delad: lagda > storst };
}
