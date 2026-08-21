/**
 * Interna beteckningar hör inte hemma i text som möter läsaren.
 *
 * `p-2026-0344`:s metodnot pekade ut vilka andra löften kostnaden räknades på —
 * med `p-2026-0358` och `p-2026-0360`, nummer som inte säger en utomstående
 * någonting. Uträkningen och noten renderas på löftessidan och ligger i det
 * publika API:et; en hänvisning där ska gå att förstå: «partiets löfte om ett
 * sektorsbidrag för skolans personal», inte numret.
 *
 * **Regeln bor här och kopieras inte.** Den låg förut bara i provet, alltså
 * efter publiceringen: `p-2026-2250` godkändes 2026-08-21 med två interna
 * nummer i sin text och fälldes först av sviten, när löftet redan låg i
 * `promises.json`. Nu läser både grinden i `review.ts` och provet samma regel.
 */

/**
 * Ett löftesnummer eller ett gruppnamn — de två beteckningar datat använder
 * internt. Kortformen `p-0411` finns med därför att rättelseloggen använde
 * den: en post räknade upp nio löften som «p-0411 600 mkr, p-0089 300 mkr …»,
 * och ett mönster som bara tog den fullständiga formen hade gått förbi dem.
 *
 * Gruppnamnet måste börja ett ord. Utan spärren matchade mönstret INUTI vanlig
 * svenska: «en gång-inlämning» innehåller bokstavsföljden «g-inlämning», och
 * grinden pekade ut p-2026-0908 för ett gruppnamn som aldrig stod där. En grind
 * som fäller på rätt sak av fel skäl lär läsaren att bortse från den.
 * Lookbehind i stället för \b, för \b räknar å, ä och ö som ordgränser.
 */
export const INTERN_BETECKNING =
  /p-\d{4}-\d{4}|\bp-\d{4}\b|(?<![\p{L}\p{N}])g-[a-zåäö0-9-]{4,}/giu;

export interface LasarensFalt {
  calculation?: string | null;
  method_note?: string | null;
}

/** Fälten på en kostnad som renderas publikt, i den ordning de läses. */
export function lasarensText(cost: LasarensFalt | null | undefined): Array<[string, string]> {
  return [
    ["cost.calculation", cost?.calculation ?? ""],
    ["cost.method_note", cost?.method_note ?? ""],
  ];
}

/**
 * Träffarna i en kostnads publika text, som färdiga rader att visa.
 *
 * Tom lista = ingenting internt läcker ut.
 */
export function internaBeteckningar(cost: LasarensFalt | null | undefined, id = ""): string[] {
  const ut: string[] = [];
  for (const [falt, text] of lasarensText(cost)) {
    for (const traff of text.matchAll(INTERN_BETECKNING)) {
      ut.push(`${id ? id + " " : ""}${falt}: «${traff[0]}»`);
    }
  }
  return ut;
}
