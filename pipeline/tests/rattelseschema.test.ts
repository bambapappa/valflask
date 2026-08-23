/**
 * Rättelseloggens schema.
 *
 * `site/src/lib/rattelsenoter.ts` läser `affects` med `.includes()` och
 * `.match()`. En post med ett eget fältnamn — `datum` i stället för `date`,
 * `varfor` i stället för `why` — kraschar alltså grinden i stället för att
 * bara saknas i noten.
 *
 * **Provet finns därför att felet gjordes 2026-08-23.** `rubrik-byt` skrev
 * `{datum, typ, varfor, poster}`, hela pipelinens 807 prov var gröna, och
 * bygget föll först i CI — för grinden som fångar det ligger i `site/scripts/`
 * och körs inte av `pnpm test` här. Ett verktyg som skriver i den här filen
 * ska fällas på den maskin det skrivs på.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FIL = resolve(import.meta.dirname, "../../data/rattelser.json");
/** Fälten `rattelsenoter.ts` läser direkt. Ingen post får sakna dem. */
const KRAV = ["date", "affects", "what"] as const;

/**
 * `why` saknas i exakt en post, och den bär `source` i stället.
 *
 * Den är från innan fältet var bestämt och skrivs inte om — men taket är
 * fryst, så nästa post utan `why` kräver ett medvetet beslut.
 */
const UTAN_WHY_TAK = 1;

/**
 * Rättelser som rör en hel sida i stället för en enskild post.
 *
 * 42 stycken när provet skrevs. En rättelse som namnger sina poster når sin
 * sida; en som bara beskriver en sida gör det inte, och taket finns för att
 * antalet ska krympa och inte växa.
 */
const UTAN_BETECKNING_TAK = 42;

describe("rättelseloggens schema", () => {
  const poster = JSON.parse(readFileSync(FIL, "utf8")) as Array<Record<string, unknown>>;

  it("hittar rättelser att mäta", () => {
    assert.ok(poster.length > 50, "en tom logg intygar ingenting");
  });

  it("varje post bär date, affects och what som strängar", () => {
    const brott: string[] = [];
    for (const [i, p] of poster.entries()) {
      for (const f of KRAV) {
        if (typeof p[f] !== "string" || (p[f] as string).trim() === "") {
          brott.push(`post ${i} (${String(p.date ?? p.datum ?? "utan datum")}) saknar \`${f}\``);
        }
      }
    }
    assert.deepEqual(
      brott,
      [],
      "Rättelsenoterna läser de här fälten direkt. En post med ett eget schema kraschar\n" +
        `grinden i site/scripts/test-rattelsenoter.mts. Brott:\n  ${brott.join("\n  ")}`,
    );
  });

  it("`why` saknas inte i fler poster än taket", () => {
    const utan = poster.filter((p) => typeof p.why !== "string" || (p.why as string).trim() === "");
    assert.ok(
      utan.length <= UTAN_WHY_TAK,
      `${utan.length} rättelser saknar \`why\`, taket är ${UTAN_WHY_TAK}. En rättelse utan skäl\n` +
        "är en tyst rättelse med en tidsstämpel.",
    );
  });

  it("fler rättelser än taket namnger inte sina poster i affects", () => {
    const MONSTER = /\b[kpb]-20\d\d-\d{4}\b/iu;
    const utan = poster.filter((p) => typeof p.affects === "string" && !MONSTER.test(p.affects as string));
    assert.ok(
      utan.length <= UTAN_BETECKNING_TAK,
      `${utan.length} rättelser namnger ingen beteckning i \`affects\` (taket är ${UTAN_BETECKNING_TAK}).\n` +
        "En rättelse som namnger sina poster når sin sida; en som bara beskriver en sida gör det inte.",
    );
  });
});
