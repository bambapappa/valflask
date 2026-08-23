/**
 * Antalet tillfällen, inte antalet punkter.
 *
 * Fyra beslutspunkter ur samma betänkande samma dag är ett tillfälle för en
 * läsare som räknar belägg, men fyra rader i registret. Domsmotorn räknar
 * punkter och ska göra det — en punkt är ett eget ställningstagande — men det
 * tal som möter läsaren i rutnätspanelen ska inte låta som fler tillfällen än
 * det varit.
 *
 * Analysen 2026-08-22 föreslog ändringen och beskrev fallet som fyra punkter
 * ur samma betänkande. **Så många finns inte.** Mätt 2026-08-23: av 184 mål
 * med flera kopplingar berörs två, båda med exakt två voteringspunkter ur
 * samma betänkande samma dag. Ändringen är alltså liten i verkan och görs
 * ändå, därför att talet annars är osant för just de två.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { antalTillfallen } = (await import(
  pathToFileURL(resolve(import.meta.dirname, "../../site/src/lib/rutnat.ts")).href
)) as { antalTillfallen: (k: readonly { handling: { id: string; dok_id: string; datum: string } }[]) => number };

const k = (dok_id: string, datum: string, id = dok_id) => ({ handling: { id, dok_id, datum } });

describe("antalTillfallen", () => {
  it("två punkter ur samma betänkande samma dag är ett tillfälle", () => {
    assert.equal(antalTillfallen([k("202526:KrU2", "2025-10-22"), k("202526:KrU2", "2025-10-22")]), 1);
  });

  it("samma dokument en annan dag är två tillfällen", () => {
    // Riksdagen kan återkomma till en fråga, och då är det två gånger.
    assert.equal(antalTillfallen([k("HD02861", "2025-10-01"), k("HD02861", "2026-01-15")]), 2);
  });

  it("olika dokument samma dag är två tillfällen", () => {
    assert.equal(antalTillfallen([k("HA021503", "2022-11-23"), k("HA021727", "2022-11-23")]), 2);
  });

  it("saknas dok_id faller nyckeln tillbaka på handlingens id", () => {
    assert.equal(antalTillfallen([k("", "2025-01-01", "h-1"), k("", "2025-01-01", "h-2")]), 2);
  });

  it("en tom lista är noll tillfällen", () => {
    assert.equal(antalTillfallen([]), 0);
  });
});

describe("klassen i det incheckade datat", () => {
  const H = new Map(
    (JSON.parse(readFileSync(resolve(import.meta.dirname, "../../data/handlingar.json"), "utf8")) as {
      id: string;
      dok_id: string;
      datum: string;
    }[]).map((h) => [h.id, h]),
  );
  const K = (
    JSON.parse(readFileSync(resolve(import.meta.dirname, "../../data/kopplingar.json"), "utf8")) as {
      status?: string;
      promise_id?: string;
      stance_id?: string;
      handling_id: string;
    }[]
  ).filter((x) => x.status !== "indragen");

  it("talet skiljer sig bara för de mål där det ska", () => {
    const perMal = new Map<string, { handling: { id: string; dok_id: string; datum: string } }[]>();
    for (const x of K) {
      const mal = x.promise_id ?? x.stance_id ?? "";
      const h = H.get(x.handling_id);
      if (!h) continue;
      perMal.set(mal, [...(perMal.get(mal) ?? []), { handling: h }]);
    }
    const berorda = [...perMal.entries()]
      .filter(([, ks]) => antalTillfallen(ks) < ks.length)
      .map(([mal]) => mal)
      .sort();
    // Talet får sjunka när kopplingar dras in, och stiga när nya görs. Det som
    // provet håller fast är att klassen är liten och känd — inte att den är
    // exakt två för alltid.
    assert.ok(berorda.length <= 5, `${berorda.length} mål berörs: ${berorda.join(", ")}`);
    assert.ok(perMal.size > 100, "för få mål lästa — provet mäter ingenting");
  });
});
