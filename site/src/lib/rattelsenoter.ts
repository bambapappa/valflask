/**
 * Rättelsenoten på Frågevågens egna sidor.
 *
 * Regeln säger «rättelsenot på berörd sida plus post i rättelseloggen». Ett
 * löfte visar sin egen historik på löftessidan; en cell i rutnätet visade
 * ingenting alls, så rättelserna fanns bara på `/rattelser` — inte där läsaren
 * ser cellen (ATTGORA E6).
 *
 * Kopplingen mellan en rättelse och en fråga går genom `affects`, som är det
 * fält posterna avsiktligt bär sina beteckningar i. **Två nycklar, båda
 * exakta:**
 *
 * 1. delfrågans eget id (`sq-…`), eller ett besked-id (`st-…`) som hör till en
 *    av frågans celler,
 * 2. delfrågans egen lydelse, ordagrant i texten — flera poster namnger
 *    frågan genom att citera den i stället för att skriva id:t.
 *
 * **Ingen tredje nyckel, och ingen liknelse.** En rättelse som varken bär ett
 * id eller frågans egna ord kopplas inte hit; att gissa på partinamn och ämne
 * vore att visa en rättelse på en sida den kanske inte gäller, och det är
 * värre än att inte visa den. Vilka poster som faller utanför är mätt och
 * står i `scripts/test-rattelsenoter.mts`.
 */

import type { Rattelse } from "./data";
import type { Issue, StanceCell } from "./stances";

/** Beteckningar en rättelse kan bära i `affects`. */
const ID_MONSTER = /\b(?:st-\d{4}-\d{4}|sq-[a-z0-9-]+)\b/giu;

/**
 * Rättelser som gäller en av sajtens egna textsidor, nyast först.
 *
 * Samma regel som för frågorna, av samma skäl: noten hör hemma där läsaren är,
 * inte bara i loggen. Nyckeln är sidans sökväg skriven ordagrant i `affects`
 * («/metod»), och ingen liknelse — en post som inte namnger sidan kopplas inte
 * hit. Ett fel i en mening om metoden är ett fel läsaren möter på metodsidan.
 */
export function rattelserForSidan(rattelser: readonly Rattelse[], sokvag: string): Rattelse[] {
  return rattelser
    .filter((r) => r.affects.includes(sokvag))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Beteckningarna posten faktiskt namnger, utan dubbletter. */
export function beteckningarI(affects: string): Set<string> {
  return new Set((affects.match(ID_MONSTER) ?? []).map((s) => s.toLowerCase()));
}

/**
 * Rättelser som gäller en av frågans celler, nyast först.
 *
 * `stances` behövs för att slå upp vilken delfråga ett besked-id hör till.
 * Ett id som inte längre finns i datat går inte att slå upp — en tömd cell
 * raderar sitt besked (E4/E5), och just den rättelsen når därför inte sin
 * sida. Det är en känd lucka, inte en tyst.
 */
export function rattelserForFraga(
  rattelser: readonly Rattelse[],
  issue: Issue,
  stances: readonly StanceCell[],
): Rattelse[] {
  const sqIdn = new Set(issue.subquestions.map((sq) => sq.id.toLowerCase()));

  // Besked-id → delfråga, för de besked som finns kvar i datat.
  const beskedensFraga = new Map<string, string>();
  for (const cell of stances) {
    for (const st of cell.statements) {
      beskedensFraga.set(st.id.toLowerCase(), cell.subquestion_id.toLowerCase());
    }
  }

  const lydelser = issue.subquestions.map((sq) => sq.text).filter((t) => t.trim() !== "");

  return rattelser
    .filter((r) => {
      for (const b of beteckningarI(r.affects)) {
        if (sqIdn.has(b)) return true;
        const fraga = beskedensFraga.get(b);
        if (fraga !== undefined && sqIdn.has(fraga)) return true;
      }
      return lydelser.some((lydelse) => r.affects.includes(lydelse));
    })
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
