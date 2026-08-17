/**
 * skordeordning.ts — vem som får budgeten när den inte räcker till alla.
 *
 * BAKGRUNDEN (2026-08-17). Budgeten är 20 nya artiklar per körning. Inom
 * gruppen som går först — partiernas egna sidor — sorterades de på adress i
 * bokstavsordning. Det såg neutralt ut och var det inte:
 * `kristdemokraterna.se` står före `moderaterna.se`, före `sd.se` och före
 * allt som ligger på `www.`. Den dag KD:s A–Ö med 220 undersidor kopplades in
 * åt den hela budgeten varje körning, och gjorde det tills katalogen var slut.
 *
 * Resultatet mättes samma dag: 232 av 801 publicerade löften var KD:s, mot 42
 * för SD. Av de 212 senast tillagda var 193 — 91 procent — KD:s. Vi hade läst
 * 270 sidor hos KD och 22 hos SD. Talet mätte inte partierna; det mätte oss.
 *
 * Handlingsvågen har haft exakt samma fel med exakt samma orsak: sökningen
 * gick i den ordning löftena råkade ligga i filen, den ordningen följde
 * partierna, och tog tiden slut blev det alltid samma partier som blev utan.
 * Den vågen rättade det genom att ta det löfte först som letats minst på.
 * Det här är samma rättelse på skördesidan.
 *
 * REGELN. Varje artikel får en rang: hur många sidor vi redan läst hos dess
 * parti, plus artikelns egen ordning bland partiets nya artiklar. Sorteras det
 * stigande får partiet vi läst minst på flest platser, utan att något parti
 * svälts helt — och när täckningen jämnat ut sig blandas partierna om vart
 * annat av sig själva. Artiklar utan parti (riksdagen, medier) rörs inte:
 * de ligger i en senare prioritetsgrupp och har ingen täckning att jämna ut.
 */

/**
 * Partiernas egna domäner. Enda syftet är att räkna täckning per parti —
 * G2:s allowlist och G3:s citatgolv har sina egna listor i sources.yaml.
 *
 * Underdomäner tas av suffixmatchningen i `partiForUrl`, så `press.
 * kristdemokraterna.se` och `val2026.centerpartiet.se` behöver ingen egen rad.
 */
export const PARTI_DOMANER: ReadonlyArray<readonly [string, string]> = [
  ["socialdemokraterna.se", "s"],
  ["moderaterna.se", "m"],
  ["sd.se", "sd"],
  ["centerpartiet.se", "c"],
  ["vansterpartiet.se", "v"],
  ["kristdemokraterna.se", "kd"],
  ["liberalerna.se", "l"],
  ["mp.se", "mp"],
];

/** Partikoden bakom en adress, eller null för allt som inte är en partisajt. */
export function partiForUrl(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./u, "");
  } catch {
    return null;
  }
  for (const [doman, kod] of PARTI_DOMANER) {
    if (host === doman || host.endsWith(`.${doman}`)) return kod;
  }
  return null;
}

/**
 * Hur många sidor vi läst hos varje parti, ur seen-registret.
 *
 * seen är hash → adress. Adressen är det enda som säger vems sida det var,
 * och den räknas en gång per unik adress: samma sida som ändrats och hämtats
 * om är fortfarande EN sida vi läst.
 */
export function laststTal(seen: ReadonlyMap<string, string>): Map<string, number> {
  const tal = new Map<string, number>();
  const raknade = new Set<string>();
  for (const url of seen.values()) {
    const nyckel = url.replace(/\/$/u, "");
    if (raknade.has(nyckel)) continue;
    raknade.add(nyckel);
    const parti = partiForUrl(url);
    if (parti) tal.set(parti, (tal.get(parti) ?? 0) + 1);
  }
  return tal;
}

/**
 * Sorterar artiklar så att det parti vi läst minst på går först.
 *
 * `prio` är den befintliga gruppindelningen (partiernas egna sidor först,
 * sedan riksdagen, sedan övrigt) och respekteras: ordningen jämnas ut INOM en
 * grupp, aldrig mellan grupperna.
 *
 * Determinism: inom samma parti behålls adressordningen, och två partier med
 * exakt samma täckning skiljs på partikod. Samma indata ger samma körning.
 */
export function ordnaEfterTackning<T>(
  artiklar: readonly T[],
  urlAv: (a: T) => string,
  prioAv: (a: T) => number,
  last: ReadonlyMap<string, number>,
): T[] {
  const rakning = new Map<string, number>();
  const rangad = artiklar
    .map((a, i) => ({ a, i, url: urlAv(a), prio: prioAv(a) }))
    .sort((x, y) => x.prio - y.prio || x.url.localeCompare(y.url))
    .map((post) => {
      const parti = partiForUrl(post.url);
      if (parti === null) return { ...post, parti, rang: Number.MAX_SAFE_INTEGER };
      const nr = rakning.get(parti) ?? 0;
      rakning.set(parti, nr + 1);
      return { ...post, parti, rang: (last.get(parti) ?? 0) + nr };
    });

  return rangad
    .sort(
      (x, y) =>
        x.prio - y.prio ||
        x.rang - y.rang ||
        (x.parti ?? "").localeCompare(y.parti ?? "") ||
        x.url.localeCompare(y.url),
    )
    .map((post) => post.a);
}
