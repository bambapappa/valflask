/**
 * Vaktar löften vars EGET citat är ett riksdagsyrkande.
 *
 * Elva publicerade löften har ett citat av formen «Riksdagen ställer sig bakom
 * det som anförs i motionen om … och tillkännager detta för regeringen». Sex
 * av dem är kopplade i Handlingsvågen. För `p-2026-0475` är samtliga sex
 * belägg samma yrkande i sex olika motioner: ordet och handlingen är samma
 * mening, och registret som ska väga det ena mot det andra väger handling mot
 * handling.
 *
 * Bristen ligger i `promises.json` — de posterna är riksdagsmotioner, inte
 * vallöften, och de saknar dessutom källänk. Handlingsvågen kan inte rätta
 * dem, men den kan mäta dem där de får sin verkan, och hindra att skulden
 * växer medan löftessidan reder ut saken.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { lofteAvRiksdagstext } from "../src/foreslag.ts";
import type { KopplingPost } from "../src/granskning.ts";

const ROT = resolve(import.meta.dirname, "../..");

test("formelspråket känns igen, och vanlig löftesprosa gör det inte", () => {
  assert.ok(
    lofteAvRiksdagstext({
      quote: "Riksdagen ställer sig bakom det som anförs i motionen om att vinstuttag ur skolan ska förbjudas och tillkännager detta för regeringen.",
    }),
  );
  assert.ok(lofteAvRiksdagstext({ quote: "Riksdagen avslår regeringens proposition." }));
  assert.equal(lofteAvRiksdagstext({ quote: "Vi vill förbjuda religiösa friskolor." }), false);
  assert.equal(lofteAvRiksdagstext({ quote: "Den orättvisa karensen ska bort." }), false);
});

test("antalet kopplingar på sådana löften växer inte", () => {
  const tak = JSON.parse(readFileSync(resolve(ROT, "data/riksdagstext-tak.json"), "utf8"));
  const loften: Array<{ id: string; status?: string; quote?: string }> = JSON.parse(
    readFileSync(resolve(ROT, "..", "data", "promises.json"), "utf8"),
  );
  const kopplingar: KopplingPost[] = JSON.parse(readFileSync(resolve(ROT, "data/kopplingar.json"), "utf8"));

  const traffade = new Set(
    loften
      .filter((l) => (l.status ?? "aktiv") === "aktiv" && lofteAvRiksdagstext({ quote: l.quote ?? "" }))
      .map((l) => l.id),
  );
  const kop = kopplingar.filter((k) => k.status === "aktiv" && traffade.has(k.promise_id ?? ""));

  assert.ok(
    kop.length <= tak.kopplingar,
    `${kop.length} aktiva kopplingar hänger på ett löfte vars eget citat är ett riksdagsyrkande — ` +
      `taket är ${tak.kopplingar}, mätt ${tak.matt}. Nya sådana kopplingar ska inte göras: läs om ` +
      "löftet på löftessidan först, och ge det ett citat ur partiets egen källa.",
  );

  assert.equal(
    traffade.size,
    tak.loften_med_riksdagstext,
    `${traffade.size} löften bär ett riksdagsyrkande som eget citat — taket är ` +
      `${tak.loften_med_riksdagstext}. Talet får sjunka; växer det ska löftet läsas om och få ett ` +
      "citat ur partiets egen källa.",
  );
  assert.ok(loften.length > 1000, `bara ${loften.length} löften lästa — löftesfilen nås inte`);
});

test("mätaren biter fortfarande, nu när skulden är noll", () => {
  // Skulden betalades 2026-08-23: alla elva löften fick partiets egna ord ur
  // samma motion i stället för kammarens yrkandeformel. Blankprovet krävde
  // tidigare att minst ett löfte träffades, vilket var rätt så länge det fanns
  // några — men ett prov som kräver att felet finns kvar kan inte bli grönt av
  // att arbetet blir gjort. Kvar behövs beviset att mätaren fungerar.
  assert.ok(
    lofteAvRiksdagstext({
      quote:
        "Riksdagen ställer sig bakom det som anförs i motionen om att vinstuttag ur skolan ska " +
        "förbjudas och tillkännager detta för regeringen.",
    }),
  );
  assert.ok(
    !lofteAvRiksdagstext({
      quote: "Socialdemokraterna föreslår i stället att vinstförbud ur skolan och förskolan införs",
    }),
  );
});
