/**
 * Paritetssvepets andra hälft: två prissatta löften om samma sak.
 *
 * `paritetsfynd` parar ett nollat löfte mot ett prissatt och hittar därför
 * bara den ena sortens ojämnhet. Luckan var verklig och mätt: matmomssänkningen
 * till sex procent står på 12 000, 15 000, 16 500 och 21 250 hos fyra partier,
 * och förstatligad personlig assistans på 40 hos två partier, 1 200 hos ett
 * tredje och 8 000 hos ett fjärde. Inget av det kunde svepet se.
 *
 * Provet mäter att kraven är svepets egna — samma kategori, olika partier,
 * ingen gemensam grupp — och att det som ersatt nollkravet biter åt båda
 * hållen: nära belopp ska passera, långt isär ska fällas.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mandatperioden, prisparfynd, type ParitetsLofte } from "../src/pariteten.ts";

const lofte = (o: Partial<ParitetsLofte> & { id: string }): ParitetsLofte => ({
  title: "Förstatliga den personliga assistansen",
  quote: "Vi vill förstatliga den personliga assistansen.",
  parties: ["s"],
  category: "välfärd",
  group_id: null,
  status: "aktiv",
  loftestyp: "reform",
  cost: { msek_base: 100, period: "per_ar" },
  ...o,
});

describe("prisparfynd", () => {
  it("fäller två prissatta löften om samma sak med belopp långt isär", () => {
    const f = prisparfynd([
      lofte({ id: "p-2026-0001", parties: ["s"], cost: { msek_base: 10, period: "per_ar" } }),
      lofte({ id: "p-2026-0002", parties: ["mp"], cost: { msek_base: 2000, period: "per_ar" } }),
    ]);
    assert.equal(f.length, 1);
    assert.equal(f[0]!.nollat, "p-2026-0001", "den lägre posten står först");
    assert.equal(f[0]!.prissatt, "p-2026-0002");
  });

  it("släpper igenom belopp som ligger nära varandra", () => {
    const f = prisparfynd([
      lofte({ id: "p-2026-0001", parties: ["s"], cost: { msek_base: 1000, period: "per_ar" } }),
      lofte({ id: "p-2026-0002", parties: ["mp"], cost: { msek_base: 1500, period: "per_ar" } }),
    ]);
    assert.deepEqual(f, [], "1,5× är en skillnad i antaganden, inte i vad åtgärden är");
  });

  it("jämför över mandatperioden, så att engång och årligt går att ställa mot varandra", () => {
    // 4 000 en gång och 1 000 per år är samma sak över perioden.
    const f = prisparfynd([
      lofte({ id: "p-2026-0001", parties: ["s"], cost: { msek_base: 4000, period: "engang" } }),
      lofte({ id: "p-2026-0002", parties: ["mp"], cost: { msek_base: 1000, period: "per_ar" } }),
    ]);
    assert.deepEqual(f, [], "samma nivå över perioden är ingen ojämnhet");
    assert.equal(mandatperioden(lofte({ id: "x", cost: { msek_base: 1000, period: "per_ar" } })), 4000);
  });

  it("rör inte två löften från samma parti", () => {
    const f = prisparfynd([
      lofte({ id: "p-2026-0001", parties: ["s"], cost: { msek_base: 10, period: "per_ar" } }),
      lofte({ id: "p-2026-0002", parties: ["s"], cost: { msek_base: 2000, period: "per_ar" } }),
    ]);
    assert.deepEqual(f, [], "samma parti som upprepar sig är en dubblettfråga, inte en paritetsfråga");
  });

  it("rör inte två löften i samma grupp", () => {
    const f = prisparfynd([
      lofte({ id: "p-2026-0001", parties: ["s"], group_id: "g-1", cost: { msek_base: 10, period: "per_ar" } }),
      lofte({ id: "p-2026-0002", parties: ["mp"], group_id: "g-1", cost: { msek_base: 2000, period: "per_ar" } }),
    ]);
    assert.deepEqual(f, [], "en grupp räknas en gång och är redan avgjord");
  });

  it("rör inte löften i olika kategorier", () => {
    const f = prisparfynd([
      lofte({ id: "p-2026-0001", parties: ["s"], category: "skatter", cost: { msek_base: 10, period: "per_ar" } }),
      lofte({ id: "p-2026-0002", parties: ["mp"], category: "välfärd", cost: { msek_base: 2000, period: "per_ar" } }),
    ]);
    assert.deepEqual(f, []);
  });

  it("rör inte en nollad post — den hör till det andra svepet", () => {
    const f = prisparfynd([
      lofte({ id: "p-2026-0001", parties: ["s"], cost: { msek_base: 0, period: "per_ar" } }),
      lofte({ id: "p-2026-0002", parties: ["mp"], cost: { msek_base: 2000, period: "per_ar" } }),
    ]);
    assert.deepEqual(f, []);
  });
});

describe("prisparen i det incheckade datat", () => {
  const L = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../../data/promises.json"), "utf8"),
  ) as ParitetsLofte[];

  it("hittar par att läsa", () => {
    // Ett svep som inte hittar något i ett bestånd där felet är mätt är grönt
    // av fel skäl. Talet är en läslista och inget tak — det får röra sig.
    assert.ok(prisparfynd(L).length > 0);
  });

  it("varje par bär ett skäl till att det står där", () => {
    for (const f of prisparfynd(L)) {
      assert.ok(f.delade_ord.length > 0, `${f.nyckel} saknar delade ord`);
      assert.ok(f.rubriklikhet >= 0.25, `${f.nyckel} har för låg rubriklikhet`);
    }
  });
});
