/**
 * Kö-postens nyckel räknas på två ställen, och de måste ge samma svar.
 *
 * `kopplingId` i det här trädet är den nyckel godkännandet slår upp i
 * kvalitetsfiltret (`ko:<id>`). `koforslagId` i Fläskvågens `provningar.ts` är
 * den nyckel filtret skriver prövningen under, och den speglas i sin tur av
 * `koforslag_id` i granskningsloggens skript. Tre implementationer av en hash.
 *
 * Går de isär händer ingenting synligt: prövningen skrivs, exporten går
 * igenom, och först i godkännandet svarar grinden «har inte gått genom
 * kvalitetsfiltret» på en post som är prövad. Det felar tyst och åt fel håll —
 * arbetet är gjort men når aldrig fram.
 *
 * Kostnaden mätt 2026-09-02: 0 av 318 förslag i kopplingskön hade en prövning
 * och godkännandevägen föll på samtliga. Orsaken där var en annan — mätningen
 * lästes bara ur det publicerade — men den luckan gick inte att se förrän någon
 * körde hela godkännandet torrt. Nyckelglidningen ser likadan ut utifrån, och
 * den här grinden fäller den i stället.
 *
 * FÄLLS AV: att ändra hashen, prefixet eller fältordningen i endera funktionen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { kopplingId } from "../src/granskning.ts";
import { koforslagId } from "../../../pipeline/src/provningar.ts";

/** Poster som täcker båda målformerna och tecken utanför ASCII. */
const FALL = [
  { promise_id: "p-2026-0360", handling_id: "h-2026-3620" },
  { promise_id: "p-2026-1161", handling_id: "h-2026-2192" },
  { stance_id: "sq-skola-vinst::s", handling_id: "h-2026-0001" },
  { promise_id: "p-2026-0001", handling_id: "h-2026-14871" },
  // Ett mål som saknas helt: båda ska räkna på tom sträng, inte på "undefined".
  { handling_id: "h-2026-0042" },
];

test("kopplingId och koforslagId räknar samma nyckel", () => {
  for (const post of FALL) {
    assert.equal(
      kopplingId(post),
      koforslagId(post),
      `nyckeln skiljer sig för ${JSON.stringify(post)} — prövningen skulle skrivas ` +
        "under en nyckel godkännandet inte slår upp",
    );
  }
});

test("nyckeln skiljer mål och handling åt", () => {
  // Utan avgränsaren vore "p-2026-036" + "0h-..." samma sträng som
  // "p-2026-0360" + "h-...", och två olika förslag hade delat prövning.
  assert.notEqual(
    kopplingId({ promise_id: "p-2026-036", handling_id: "0h-2026-3620" }),
    kopplingId({ promise_id: "p-2026-0360", handling_id: "h-2026-3620" }),
  );
});
