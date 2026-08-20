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

// ── Vilka löften sökningen HAR gått över ────────────────────────────────────

/**
 * Sökregistret: varje löfte sökningen läst kandidater för, och hur många den
 * fann.
 *
 * VARFÖR DET INTE RÄCKER MED `provade-par.json`. Den filen minns **par**. Ett
 * löfte där nyckelordssökningen inte hittade en enda kandidat lämnar därför
 * inget spår alls — och ser i datat exakt likadant ut som ett löfte sökningen
 * aldrig hunnit fram till. Partisidan tvingades kalla båda «ännu inte
 * genomsökta», och de två sakerna är inte samma:
 *
 *   · **ingen liknande handling** är en MÄTNING. Sökningen har varit där, och
 *     inget dokument liknar löftet tillräckligt för att vara värt att läsa.
 *     Metodsidan beskriver den gränsen och varför den finns.
 *   · **väntar på sökning** är en ARBETSKÖ. Vi vet ingenting ännu.
 *
 * Mätt 2026-08-20 var 1 035 av 1 743 löften utan prövade par, och det talet
 * bar båda betydelserna på en gång. 537 av dem publicerades dagen innan och
 * hade aldrig sökts; resten hade sökts gång på gång utan kandidater. Samma
 * sammanblandning som en gång delade `ingen_handling` i två — nu ett steg till.
 *
 * Registret skrivs av förslagskörningen för VARJE löfte den går över, också
 * när kandidatlistan är tom. Det är hela poängen: nollan ska lämna ett spår.
 */
export interface Sokpost {
  /** Datum för senaste sökning, ISO-datum (YYYY-MM-DD). */
  senast: string;
  /** Hur många kandidater sökningen fann. Noll är ett giltigt svar. */
  kandidater: number;
}

export interface Sokregister {
  poster: Record<string, Sokpost>;
}

export const TOMT_SOKREGISTER: Sokregister = { poster: {} };

/** Skriver in en sökning. Senare datum vinner; kandidatantalet är det senast mätta. */
export function skrivSokning(
  reg: Sokregister,
  lofteId: string,
  kandidater: number,
  dag: string,
): Sokregister {
  return { poster: { ...reg.poster, [lofteId]: { senast: dag, kandidater } } };
}

/** Sorterar posterna på id — deterministiska diffar, precis som provade-par. */
export function serialiseraSokregister(reg: Sokregister): Sokregister {
  const poster: Record<string, Sokpost> = {};
  for (const id of Object.keys(reg.poster).sort()) poster[id] = reg.poster[id]!;
  return { poster };
}
