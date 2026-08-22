/**
 * Dagen är svensk, och ingen fil får datera i UTC igen.
 *
 * Provet mäter två saker. Att `svenskDag()` ger rätt dag på båda sidor om
 * midnatt och i båda tidszonshalvorna — och att mönstret som gav fel dag inte
 * kommer tillbaka någon annanstans i repot.
 *
 * Det andra ledet är det som gör regeln till en grind. Modulen fanns inte den
 * 22 augusti, och 29 ställen i 24 filer stämplade UTC-dagen: rättelseposter,
 * historikrader, indragningar, körloggar. Felet syns bara mellan midnatt och
 * gryningen, alltså precis när ingen tittar.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { svenskDag, nuIStockholm, TIDSZON } from "../src/dagen.ts";

const ROT = resolve(import.meta.dirname, "../..");
const MODULEN = resolve(ROT, "pipeline/src/dagen.ts");

/**
 * De två filer som är OM regeln, och därför måste få skriva ut den.
 *
 * Modulen förklarar felet den lagar; provet letar efter det. Fällde grinden
 * dem vore enda vägen framåt att sluta förklara sig — och en regel ingen
 * förklarat är en regel ingen förstår när den fäller något.
 */
const FAR_NAMNA_MONSTRET = new Set([MODULEN, resolve(import.meta.dirname, "dagen.test.ts")]);

/** Mönstret som ger UTC-dagen. Samma text som grinden letar efter. */
const UTC_DAGEN = /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/u;

const HOPPA_OVER = new Set(["node_modules", ".git", "dist", ".astro", "coverage"]);

function kallfiler(katalog: string, funna: string[] = []): string[] {
  for (const namn of readdirSync(katalog)) {
    if (HOPPA_OVER.has(namn)) continue;
    const sokvag = join(katalog, namn);
    if (statSync(sokvag).isDirectory()) kallfiler(sokvag, funna);
    else if (/\.(ts|mts|astro)$/u.test(namn)) funna.push(sokvag);
  }
  return funna;
}

describe("svenskDag", () => {
  it("ger svensk dag, inte UTC-dag, strax efter midnatt om sommaren", () => {
    // Det verkliga fallet: rättelseposten skrevs 00:28 svensk tid och fick
    // datumet 2026-08-22.
    const nu = new Date("2026-08-22T22:28:00Z");
    assert.equal(nu.toISOString().slice(0, 10), "2026-08-22");
    assert.equal(svenskDag(nu), "2026-08-23");
  });

  it("ger svensk dag strax efter midnatt om vintern", () => {
    const nu = new Date("2026-01-15T23:30:00Z");
    assert.equal(nu.toISOString().slice(0, 10), "2026-01-15");
    assert.equal(svenskDag(nu), "2026-01-16");
  });

  it("ger samma dag som UTC mitt på dagen", () => {
    for (const iso of ["2026-08-22T12:00:00Z", "2026-01-15T12:00:00Z"]) {
      const nu = new Date(iso);
      assert.equal(svenskDag(nu), nu.toISOString().slice(0, 10));
    }
  });

  it("skriver formen ÅÅÅÅ-MM-DD", () => {
    assert.match(svenskDag(new Date("2026-03-05T10:00:00Z")), /^\d{4}-\d{2}-\d{2}$/u);
  });

  it("byter dag vid svensk midnatt, inte vid UTC-midnatt", () => {
    // Sommartid: svensk midnatt är 22:00 UTC dagen före.
    assert.equal(svenskDag(new Date("2026-08-22T21:59:59Z")), "2026-08-22");
    assert.equal(svenskDag(new Date("2026-08-22T22:00:00Z")), "2026-08-23");
  });
});

describe("nuIStockholm", () => {
  it("bär rätt förskjutning sommar och vinter", () => {
    assert.equal(nuIStockholm(new Date("2026-08-22T22:28:00Z")), "2026-08-23T00:28:00+02:00");
    assert.equal(nuIStockholm(new Date("2026-01-15T23:30:00Z")), "2026-01-16T00:30:00+01:00");
  });

  it("daterar samma dag som svenskDag", () => {
    for (const iso of ["2026-08-22T22:28:00Z", "2026-01-15T23:30:00Z", "2026-06-01T00:00:00Z"]) {
      const nu = new Date(iso);
      assert.equal(nuIStockholm(nu).slice(0, 10), svenskDag(nu));
    }
  });

  it("daterar i Sveriges tidszon och inte i maskinens", () => {
    assert.equal(TIDSZON, "Europe/Stockholm");
  });
});

describe("grinden mot UTC-datum", () => {
  const filer = kallfiler(ROT);

  it("hittar filer att mäta", () => {
    // Ett svep som inte hittar något är grönt av fel skäl.
    assert.ok(filer.length > 200, `svepet hittade bara ${filer.length} källfiler`);
  });

  it("ingen fil utanför dagen.ts tar dagen ur UTC", () => {
    const brott = filer
      .filter((f) => !FAR_NAMNA_MONSTRET.has(resolve(f)))
      .filter((f) => UTC_DAGEN.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROT, f));
    assert.deepEqual(
      brott,
      [],
      "Sverige ligger en eller två timmar före UTC, så mellan midnatt och gryningen\n" +
        "ger `new Date().toISOString().slice(0, 10)` GÅRDAGENS datum. En rättelse som\n" +
        "säger att den skedde dagen före den skedde är värre än ingen rättelse.\n" +
        "Använd `svenskDag()` ur `pipeline/src/dagen.ts`.\n" +
        `Brott: ${brott.join(", ")}`,
    );
  });

  it("undantagen är två, och båda nämner mönstret på riktigt", () => {
    // Ett undantag som inte behövs är ett hål. Båda filerna ska faktiskt bära
    // mönstret — annars ska de inte stå i listan.
    assert.equal(FAR_NAMNA_MONSTRET.size, 2);
    for (const f of FAR_NAMNA_MONSTRET) {
      assert.ok(UTC_DAGEN.test(readFileSync(f, "utf8")), `${relative(ROT, f)} behöver inget undantag`);
    }
  });
});
