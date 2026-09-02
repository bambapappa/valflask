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
import { ORSAK_FRAN, ORSAKKODER } from "../src/orsakkoder.ts"; // ORSAK_FRAN = 2026-09-02: fem 09-01-poster skrevs före fältet

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
 * `orsak` — läslig orsakskod från ANDRINGARNA-ANALYS-2026-09-01 (handoff).
 *
 * Alla 191 poster som fanns när fältet infördes saknar det; de är skrivna
 * innan koderna fanns och skrivs inte om. Tuset är fryst på noll krav för
 * poster från och med 2026-09-01 — nya poster SKA bära en orsak, och en
 * orsak som inte är en av koderna är ett schemafel, inte en smakfråga.
 */

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

  it("poster från och med 2026-09-01 bär en orsakskod", () => {
    const nya = poster.filter((p) => typeof p.date === "string" && p.date >= ORSAK_FRAN);
    const utan = nya.filter((p) => typeof p.orsak !== "string" || (p.orsak as string).trim() === "");
    assert.ok(
      utan.length === 0,
      `${utan.length} rättelser från och med ${ORSAK_FRAN} saknar \`orsak\`:\n` +
        utan.map((p) => `  ${String(p.date)} — ${String(p.affects).slice(0, 60)}`).join("\n") +
        "\nOrsakskoderna står i rattelser.schema.json; utan dem är nästa mönsteranalys" +
        " ett regex-bygge i stället för en uppslagning.",
    );

    const ogiltiga = nya
      .filter((p) => typeof p.orsak === "string")
      .filter((p) => !(ORSAKKODER as readonly string[]).includes(p.orsak as string));
    assert.ok(
      ogiltiga.length === 0,
      `${ogiltiga.length} rättelser bär en orsak som inte är en av koderna:\n` +
        ogiltiga.map((p) => `  ${String(p.date)}: «${String(p.orsak)}»`).join("\n"),
    );
  });

  it("orsak-provet biter mot ett infört fel", () => {
    const felaktig = { date: "2026-09-02", affects: "p-2026-0001", what: "…", why: "…" } as Record<string, unknown>;
    assert.equal(typeof felaktig.orsak, "undefined", "post utan orsak ska vara ett brott");

    const felkod = { date: "2026-09-02", orsak: "D2 källdjup" } as Record<string, unknown>;
    assert.ok(
      !(ORSAKKODER as readonly string[]).includes(felkod.orsak as string),
      "en intern delta-kod (D2) är inte en läslig orsakskod och ska falla",
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

  it("provet biter mot ett infört fel", () => {
    // Precis det schema `rubrik-byt` skrev 2026-08-23 och som föll i CI.
    const felaktig = { datum: "2026-08-23", typ: "rubrikbyte", varfor: "…", poster: [] } as Record<string, unknown>;
    const saknade = KRAV.filter((f) => typeof felaktig[f] !== "string" || (felaktig[f] as string).trim() === "");
    assert.deepEqual(saknade, [...KRAV], "en post med eget schema saknar alla tre fälten");

    const riktig = { date: "2026-08-23", affects: "p-2026-0001", what: "…", why: "…" } as Record<string, unknown>;
    assert.deepEqual(KRAV.filter((f) => typeof riktig[f] !== "string"), []);
  });
});
