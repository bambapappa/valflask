import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { standpunkterUrCeller, type StanceCell } from "../src/arkiv-poster.ts";

const DATA = join(import.meta.dirname, "../../data");

test("ståndpunkternas källa läses ur source-objektet, inte rakt på beskedet", () => {
  const celler: StanceCell[] = [
    {
      subquestion_id: "sq-test",
      party: "v",
      current: { statement_id: "st-1" },
      statements: [
        {
          id: "st-1",
          quote: "Ett besked.",
          source: { url: "https://exempel.se/sida", archive_url: "https://web.archive.org/web/1/x" },
        },
      ],
    },
  ];
  const ut = standpunkterUrCeller(celler);
  assert.equal(ut.length, 1);
  assert.equal(ut[0]!.kalla, "https://exempel.se/sida");
  assert.equal(ut[0]!.arkiv, "https://web.archive.org/web/1/x");
});

test("en tom cell ger ingen post — den har ingen arkivkopia att pröva", () => {
  const celler: StanceCell[] = [
    { subquestion_id: "sq-test", party: "s", current: { statement_id: null }, statements: [] },
  ];
  assert.deepEqual(standpunkterUrCeller(celler), []);
});

/**
 * Grinden mot fältdrift.
 *
 * Det ursprungliga felet gick inte att se i en enhetstest med påhittad data:
 * skriver man fixturen efter samma felaktiga typ stämmer allt. Det som
 * avslöjade det var att svaret mot den **riktiga** filen var orimligt — varje
 * publicerad ståndpunkt saknade arkivkopia. Testet mäter därför mot filen och
 * fäller när läsningen slutar hitta något, vilket är vad ett felstavat fält gör.
 */
test("läsningen hittar arkivkopior i den riktiga stances.json", () => {
  const celler = JSON.parse(readFileSync(join(DATA, "stances.json"), "utf8")) as StanceCell[];
  const poster = standpunkterUrCeller(celler);
  assert.ok(poster.length > 0, "inga publicerade ståndpunkter alls — läsningen hittar inget");

  const medArkiv = poster.filter((p) => p.arkiv !== null && p.arkiv !== "");
  const medKalla = poster.filter((p) => p.kalla !== "");

  // Varje publicerad ståndpunkt har en källa; det är ett krav för att bli
  // publicerad. Hittar läsningen ingen är det läsningen som är fel.
  assert.equal(
    medKalla.length,
    poster.length,
    `${poster.length - medKalla.length} av ${poster.length} publicerade ståndpunkter saknar källa i läsningen. ` +
      "Det betyder nästan säkert att fältnamnet flyttat, inte att källorna försvunnit.",
  );

  // Golvet är satt under dagens nivå med marginal, så att en enstaka post utan
  // kopia inte fäller bygget — men ett felstavat fält, som nollar alla, gör det.
  const andel = medArkiv.length / poster.length;
  assert.ok(
    andel > 0.5,
    `bara ${medArkiv.length} av ${poster.length} publicerade ståndpunkter bär arkivlänk i läsningen. ` +
      "Kontrollera fältnamnet innan du tror att kopiorna saknas.",
  );
});
