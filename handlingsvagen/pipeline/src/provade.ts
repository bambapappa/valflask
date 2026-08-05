/**
 * Beständigt minne över prövade (löfte/ståndpunkt, handling)-par.
 *
 * Förslagskön (kopplingsforslag.json) minns bara par som GAV ett förslag.
 * Ett par där modellen svarade "ingen koppling" — eller där grindarna föll
 * det — lämnar inget spår i kön, så en omkörning frågar modellen på nytt och
 * betalar om samma nej-svar. data/provade-par.json minns i stället VARJE par
 * som prövats klart, så omkörningar bara betalar för det som är oprövat.
 *
 * Filen är en sorterad lista av nycklar "mål::handling" (samma nyckelform
 * som kopplingId bygger på). Den växer bara — en union-merge är därför alltid
 * race-säker, precis som kön men enklare (inga poster tas bort).
 */

export type Provade = Set<string>;

/** Nyckel för ett par — målet (löfte- eller ståndpunkts-id) plus handlingen. */
export function parNyckel(target: string, handlingId: string): string {
  return `${target}::${handlingId}`;
}

/** Läser en provade-par-fil (sorterad nyckellista) till en mängd. */
export function laddaProvade(rader: string[]): Provade {
  return new Set(rader);
}

/** Serialiserar mängden till en sorterad lista — deterministiska diffar. */
export function serialiseraProvade(provade: Provade): string[] {
  return [...provade].sort();
}

/**
 * Antal prövade par per mål (löfte eller ståndpunkt) — täckningsmåttet.
 * Används för att köra det MINST täckta löftet först, så att en körning som
 * slår i budget- eller tidstaket inte alltid stannar på samma ställe i
 * löfteslistan.
 */
export function antalProvadePerMal(provade: Provade): Map<string, number> {
  const per = new Map<string, number>();
  for (const nyckel of provade) {
    const mal = nyckel.slice(0, nyckel.indexOf("::"));
    if (mal) per.set(mal, (per.get(mal) ?? 0) + 1);
  }
  return per;
}

/**
 * Ordnar mål efter täckning: minst prövade först, id:t som andra nyckel så
 * att lika täckning alltid ger samma ordning. Bor här och inte i skriptet
 * för att testet ska pröva den ordning körningen faktiskt använder.
 */
export function tackningsordning(provade: Provade): (a: { id: string }, b: { id: string }) => number {
  const per = antalProvadePerMal(provade);
  return (a, b) => {
    const diff = (per.get(a.id) ?? 0) - (per.get(b.id) ?? 0);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  };
}

/**
 * Union-merge av en färsk fil (från defaultgrenen) med körningens egna nya
 * nycklar. Append-only, så unionen kan aldrig tappa ett prövat par vid race.
 */
export function mergeProvade(farsk: string[], nya: string[]): string[] {
  return serialiseraProvade(new Set([...farsk, ...nya]));
}
