/**
 * Vaktar att löftets SORT når fram till förslagssteget, och att skulden av
 * kopplingar på inriktningslöften bara krymper.
 *
 * Ett inriktningslöfte pekar ut ett håll utan att peka ut en åtgärd — «vi vill
 * skydda public service och föreningslivet», «bygga ut totalförsvaret». Mot ett
 * sådant löfte träffar nästan vilken handling som helst i närheten, och
 * «agerat i linje» blir därför knappt möjligt att motsäga. Vid genomgången
 * 2026-08-22 mättes det: 71 av 321 publicerade utslag (22 %) gällde ett
 * inriktningslöfte, och 60 av dem var «i linje».
 *
 * Fältet `loftestyp` fanns i valflask sedan 2026-08-22 men skickades aldrig in
 * i kopplingssteget: prompten fick löftets titel och citat men inte dess sort,
 * och regel 3 fick därför göras om från grunden vid varje anrop trots att
 * svaret stod i datat.
 *
 * Taket är en spärr, inte ett förbud. Kommer en verkligt namngiven del av ett
 * inriktningslöfte upp ska den kopplas — men då höjs taket medvetet, med
 * skälet skrivet, i stället för att skulden växer tyst.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { byggPrompt, type Lofte } from "../src/foreslag.ts";
import type { Handling } from "../src/handlingar.ts";
import type { KopplingPost } from "../src/granskning.ts";

const ROT = resolve(import.meta.dirname, "../..");

const handling: Handling = {
  id: "h-1",
  kind: "motion",
  dok_id: "HD021234",
  datum: "2025-10-02",
  parties: ["s"],
  persons: [],
  titel: "En motion",
  url: "https://data.riksdagen.se/dokument/HD021234",
  archive_url: null,
};
const lofte: Lofte = { id: "p-2026-0001", title: "Ett löfte", quote: "Vi vill något.", parties: ["s"] };

test("prompten säger till när löftet är en inriktning", () => {
  const inriktning = byggPrompt({ ...lofte, loftestyp: "inriktning" }, handling, "text");
  assert.match(inriktning, /LÖFTETS SORT: inriktning/u);
  assert.match(inriktning, /SPECIFIK, namngiven del/u);
});

test("ett reformlöfte får ingen extra rad — sorten sägs bara när den skärper kravet", () => {
  for (const typ of ["reform", undefined] as const) {
    const p = byggPrompt(typ ? { ...lofte, loftestyp: typ } : lofte, handling, "text");
    assert.doesNotMatch(p, /LÖFTETS SORT/u, `sorten ${String(typ)} ska inte ge en rad`);
  }
});

test("skulden av kopplingar på inriktningslöften växer inte", () => {
  const tak = JSON.parse(readFileSync(resolve(ROT, "data/inriktningstak.json"), "utf8"));
  const kopplingar: KopplingPost[] = JSON.parse(readFileSync(resolve(ROT, "data/kopplingar.json"), "utf8"));
  const loften: Array<{ id: string; loftestyp?: string }> = JSON.parse(
    readFileSync(resolve(ROT, "..", "data", "promises.json"), "utf8"),
  );
  const sort = new Map(loften.map((l) => [l.id, l.loftestyp]));
  const nu = kopplingar.filter(
    (k) => k.status === "aktiv" && sort.get(k.promise_id ?? "") === "inriktning",
  ).length;

  assert.ok(
    nu <= tak.kopplingar_pa_inriktningsloften,
    `${nu} aktiva kopplingar hänger på ett inriktningslöfte — taket är ` +
      `${tak.kopplingar_pa_inriktningsloften}, mätt ${tak.matt}. Ska taket höjas ska det göras ` +
      "medvetet, med skälet skrivet: en namngiven del av löftet ska gå att peka ut, och citatet " +
      "ska visa vilken.",
  );

  // Blankprovet: ett tak som mäter noll poster intygar ingenting. Provet ska
  // falla om beståndet försvinner, inte gå igenom för att det är tomt.
  assert.ok(nu > 0, "inga kopplingar alls mättes — provet mäter då ingenting");
  assert.ok(
    kopplingar.some((k) => k.status === "aktiv" && sort.get(k.promise_id ?? "") === "reform"),
    "inga reformlöften hittades heller — löftessorten når inte fram till provet",
  );
});

test("förslagssteget läser sorten ur löftesfilen", () => {
  // Mekanismen, inte bara dagens tal. Slutar skriptet skicka in fältet blir
  // prompten tyst om sorten igen, och provet ovan skulle inte märka det.
  const src = readFileSync(resolve(ROT, "pipeline/src/foreslag.ts"), "utf8");
  assert.match(src, /loftestyp\?: "reform" \| "inriktning"/u);
  assert.match(src, /lofte\.loftestyp === "inriktning"/u);
});
