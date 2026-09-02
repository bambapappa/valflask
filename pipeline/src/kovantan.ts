/**
 * Hur länge en köpost fått ligga utan att gå genom kvalitetsfiltret.
 *
 * Täckningsmåttet bredvid räknar det **publicerade**: löften, kopplingar och
 * ståndpunkter som står på sajten. Det är rätt mått på den frågan, och det
 * svarade 0 oprövade hela tiden — samtidigt som 623 poster låg i köerna utan
 * en enda prövning och godkännandevägen föll på varenda en.
 *
 * Ingenting mätte det. Påfyllningen är schemalagd (kopplingsförslag varje
 * dygn, skörden varje måndag), prövningen är det inte, och skillnaden syns
 * först när någon försöker godkänna något. Mätt 2026-09-02: 393 öppna ärenden
 * den 31 augusti, 564 två dygn senare, och den senaste prövningsbunten
 * daterad den 29 augusti.
 *
 * **Att kön är oprövad just nu är inte ett fel.** Ett förslag som kom i natt
 * ska inte vara prövat i morse. Det som är ett fel är att den ligger oprövad
 * i veckor, för då är det inte längre en fördröjning utan ett pass som
 * slutat köras. Måttet är därför väntan, inte antalet — samma form som
 * arkivväntan har, och av samma skäl: ett tak på antalet hade fällt bygget
 * varje dygn påfyllningen kört, vilket gör grinden till brus.
 */

/** En köpost som kan väntas på: den bär ett datum och en identitet. */
export interface Kopost {
  /** Nyckeln prövningen skrivs under — `ko:` plus postens hash. */
  nyckel: string;
  /** När posten kom till kön, som ISO-datum eller full tidsstämpel. */
  skapad: string | null | undefined;
}

export interface Vantan {
  /** Poster i kön som saknar prövning helt. */
  oprovade: number;
  /** Kön totalt. */
  summa: number;
  /** Dygn den längst väntande oprövade posten har legat. `null` om ingen väntar. */
  dagar: number | null;
  /** Nyckeln på den posten, så svaret går att slå upp. */
  aldst: string | null;
}

/**
 * Dygn mellan två tidpunkter, nedåt.
 *
 * Ett negativt tal betyder att posten är stämplad i framtiden. Det räknas som
 * noll och inte som ett fel: en klocka som går fel ska inte kunna göra bygget
 * grönt, och den ska heller inte fälla det.
 */
export function dygn(skapad: string, nu: Date): number {
  const t = Date.parse(skapad);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((nu.getTime() - t) / 86_400_000));
}

/**
 * Vad kön väntat på.
 *
 * `harProvning` slås upp per post i stället för att kartan skickas in, så att
 * anroparen äger vilka identiteter som räknas — kö-nyckel och publicerat id är
 * två olika sätt att hitta samma prövning, och listan över dem bor i
 * `provningar.ts`.
 */
export function vantan(
  poster: readonly Kopost[],
  harProvning: (nyckel: string) => boolean,
  nu: Date,
): Vantan {
  let oprovade = 0;
  let dagar: number | null = null;
  let aldst: string | null = null;
  for (const post of poster) {
    if (harProvning(post.nyckel)) continue;
    oprovade++;
    // En post utan datum går inte att vänta på. Den räknas som oprövad men
    // aldrig som gammal — annars hade ett saknat fält sett ut som en mätning.
    if (!post.skapad) continue;
    const d = dygn(post.skapad, nu);
    if (dagar === null || d > dagar) {
      dagar = d;
      aldst = post.nyckel;
    }
  }
  return { oprovade, summa: poster.length, dagar, aldst };
}

/**
 * Taket: hur många dygn en oprövad köpost får ligga.
 *
 * Fem. Kopplingsförslagen fylls på varje dygn, så fem dygns oprövad kö betyder
 * att passet missat fem påfyllningar i rad — det är inte en fördröjning, det är
 * ett pass som slutat köras.
 *
 * Talet är satt så att grinden biter på det läge som gjorde att den byggdes.
 * Den längsta väntan i kopplingskön 2026-09-02 var **sju dygn**, och ett tak på
 * sju hade legat exakt på gränsen — alltså sluppit igenom samma dag och fällt
 * först dagen därpå. Ett tak som nätt och jämnt missar det fall det skrevs för
 * är inget tak.
 *
 * Åt andra hållet: taket får inte vara så snävt att en helg fäller bygget.
 * Fem dygn rymmer en helg med marginal.
 *
 * **Grinden fäller `main`.** Den körs i bygget (`provningar:status --tak`), och
 * det är avsikten: en regel utan grind är en påminnelse, och den här
 * påminnelsen åldrades i en vecka medan kön växte från 393 till 564 ärenden.
 * Taket höjs inte för att göra bygget grönt.
 */
export const TAK_DYGN = 5;

export type Domen = { ok: true } | { ok: false; skal: string };

export function domVantan(v: Vantan, vad: string, tak: number = TAK_DYGN): Domen {
  if (v.dagar === null || v.dagar <= tak) return { ok: true };
  return {
    ok: false,
    skal:
      `${vad}: ${v.oprovade} av ${v.summa} poster är oprövade, och den äldsta har legat ` +
      `${v.dagar} dygn (${v.aldst}). Taket är ${tak}.\n` +
      "Kön fylls på schemalagt; prövningen gör det inte, och det är skillnaden som\n" +
      "syns här. Kör prövningspasset — taket höjs inte för att göra bygget grönt.",
  };
}
