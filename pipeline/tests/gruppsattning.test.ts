/**
 * Grupper. Regeln står i `src/gruppsattning.ts`.
 *
 * Verktyget byggdes 2026-08-23 med all validering inne i CLI-skriptet, alltså
 * oprovbar. `ankarpasset`s docstring varnar för precis det: elva bevisrättningar
 * gjordes en gång som engångsskript, och de nådde aldrig en testsvit. Modulen är
 * utbruten samma dag.
 *
 * Det led som betyder mest är `sankning`: en grupp SÄNKER rikssumman, och exakt
 * hur mycket är det tal som möter läsaren i en rättelsenot.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mandatperioden, provaGrupprad, sankning, tillampa, type Grupplofte, type Grupprad } from "../src/gruppsattning.ts";

const p = (id: string, bas: number, o: Partial<Grupplofte> = {}): Grupplofte =>
  ({ id, status: "aktiv", cost: { msek_base: bas, period: "per_ar" }, ...o });
const karta = (...l: Grupplofte[]) => new Map(l.map((x) => [x.id, x]));
const rad = (o: Partial<Grupprad> = {}): Grupprad => ({
  grupp: "g-sankt-matmoms", ids: ["p-2026-0001", "p-2026-0002"],
  skal: "två partier lovar samma sänkning av matmomsen till sex procent", ...o,
});

describe("gruppsättningens spärrar", () => {
  it("godtar en rad där allt stämmer", () => {
    assert.deepEqual(provaGrupprad(rad(), karta(p("p-2026-0001", 100), p("p-2026-0002", 50))), { ok: true, fel: [] });
  });

  it("fäller ett grupp-id som inte följer formen", () => {
    for (const g of ["sankt-matmoms", "g-Sankt-Matmoms", "g_matmoms", "g-"]) {
      assert.equal(provaGrupprad(rad({ grupp: g }), karta(p("p-2026-0001", 100), p("p-2026-0002", 50))).ok, false, g);
    }
  });

  it("fäller en grupp med färre än två medlemmar", () => {
    const { ok, fel } = provaGrupprad(rad({ ids: ["p-2026-0001"] }), karta(p("p-2026-0001", 100)));
    assert.equal(ok, false);
    assert.match(fel.join(" "), /ingen grupp/u);
  });

  it("fäller samma id två gånger i samma grupp", () => {
    const { ok, fel } = provaGrupprad(rad({ ids: ["p-2026-0001", "p-2026-0001"] }), karta(p("p-2026-0001", 100)));
    assert.equal(ok, false);
    assert.match(fel.join(" "), /två gånger/u);
  });

  it("fäller ett indraget löfte och ett som saknas", () => {
    assert.equal(provaGrupprad(rad(), karta(p("p-2026-0001", 100), p("p-2026-0002", 50, { status: "tillbakadragen" }))).ok, false);
    assert.equal(provaGrupprad(rad(), karta(p("p-2026-0001", 100))).ok, false);
  });

  it("fäller en post som redan sitter i en ANNAN grupp", () => {
    // Att flytta ett löfte mellan grupper ändrar två summor samtidigt.
    const { ok, fel } = provaGrupprad(rad(), karta(p("p-2026-0001", 100), p("p-2026-0002", 50, { group_id: "g-annan" })));
    assert.equal(ok, false);
    assert.match(fel.join(" "), /sitter redan i gruppen g-annan/u);
  });

  it("släpper en post som redan sitter i SAMMA grupp", () => {
    // Så lades ett tredje matmomslöfte till en grupp som redan fanns.
    assert.ok(provaGrupprad(rad(), karta(p("p-2026-0001", 100, { group_id: "g-sankt-matmoms" }), p("p-2026-0002", 50))).ok);
  });

  it("fäller ett för kort skäl", () => {
    assert.equal(provaGrupprad(rad({ skal: "samma sak" }), karta(p("p-2026-0001", 100), p("p-2026-0002", 50))).ok, false);
  });
});

describe("vad gruppen gör med summan", () => {
  it("sänkningen är allt utom den största posten", () => {
    assert.equal(sankning([p("a", 100), p("b", 50), p("c", 25)]), 300); // (50+25)×4
    assert.equal(sankning([p("a", 100)]), 0, "en ensam post sänker ingenting");
    assert.equal(sankning([]), 0);
  });

  it("en engångspost räknas en gång och en årlig fyra", () => {
    assert.equal(mandatperioden(p("a", 100)), 400);
    assert.equal(mandatperioden({ id: "b", cost: { msek_base: 100, period: "engang" } }), 100);
  });

  it("nollor sänker ingenting men bildar ändå en grupp", () => {
    assert.equal(sankning([p("a", 0), p("b", 0)]), 0);
  });
});

describe("gruppsättningens verkställighet", () => {
  const med = [p("p-2026-0001", 100), p("p-2026-0002", 50)];

  it("sätter group_id och säger i historiken vem som bär summan", () => {
    const stor = tillampa(med[0]!, rad(), med, "2026-08-23");
    const liten = tillampa(med[1]!, rad(), med, "2026-08-23");
    assert.equal(stor.group_id, "g-sankt-matmoms");
    assert.match(stor.history!.at(-1)!.change, /är den största och bär den/u);
    assert.match(liten.history!.at(-1)!.change, /räknas därför inte in i totalen/u);
  });

  it("historiken säger att Handlingsvågen ändå dömer per löfte", () => {
    // Utan det ledet läses en gruppering som att ett parti slipper undan.
    assert.match(tillampa(med[1]!, rad(), med, "2026-08-23").history!.at(-1)!.change, /dom per löfte/u);
  });

  it("beloppet rörs inte", () => {
    assert.equal(tillampa(med[1]!, rad(), med, "2026-08-23").cost?.msek_base, 50);
  });
});
