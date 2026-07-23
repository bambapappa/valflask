import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  titleSimilarity,
  findPossibleDuplicate,
  findCrossPartyDuplicate,
  findComparableCosts,
  type ExistingPromiseLite,
  type ComparablePromiseLite,
} from "../src/similarity.ts";

describe("titleSimilarity", () => {
  it("identiska titlar → 1", () => {
    assert.equal(titleSimilarity("höjd a-kassa till nittio procent", "höjd a-kassa till nittio procent"), 1);
  });
  it("helt olika → lågt", () => {
    assert.ok(titleSimilarity("sänkt skatt på sparande", "fri tandvård för alla barn") < 0.2);
  });
  it("samma löfte, olika formulering → en bit över tröskeln", () => {
    const s = titleSimilarity(
      "Höjd a-kassa till nittio procent av lönen",
      "S vill höja a-kassan till nittio procent av lönen",
    );
    assert.ok(s >= 0.3, `fick ${s}`);
  });
});

describe("findPossibleDuplicate", () => {
  const existing: ExistingPromiseLite[] = [
    {
      id: "p-2026-0001",
      title: "Höjd a-kassa till nittio procent av lönen",
      parties: ["s"],
      category: "välfärd",
      group_id: null,
    },
  ];

  it("flaggar samma parti + kategori + lik titel", () => {
    const d = findPossibleDuplicate(
      { title: "S höjer a-kassan till nittio procent av lönen", parties: ["s"], category: "välfärd" },
      existing,
    );
    assert.equal(d?.id, "p-2026-0001");
  });

  it("inget partiöverlapp → ingen dublett", () => {
    const d = findPossibleDuplicate(
      { title: "Höjd a-kassa till nittio procent av lönen", parties: ["m"], category: "välfärd" },
      existing,
    );
    assert.equal(d, null);
  });

  it("annan kategori → ingen dublett", () => {
    const d = findPossibleDuplicate(
      { title: "Höjd a-kassa till nittio procent av lönen", parties: ["s"], category: "skatter" },
      existing,
    );
    assert.equal(d, null);
  });
});

describe("findCrossPartyDuplicate — samma politik hos annat parti (R3)", () => {
  const existing = [
    {
      id: "p-2026-0340",
      title: "Höj försvarsanslagen till 5 procent av BNP",
      parties: ["l"],
      category: "försvar",
      group_id: null,
    },
    {
      id: "p-2026-0461",
      title: "Ta bort karensavdraget",
      parties: ["s"],
      category: "välfärd",
      group_id: null,
    },
  ];

  it("annat partis 5%-BNP-löfte flaggas (L↔C-fallet)", () => {
    const d = findCrossPartyDuplicate(
      { title: "Upprustning av försvaret till fem procent av BNP", parties: ["c"], category: "försvar" },
      existing,
    );
    assert.equal(d?.id, "p-2026-0340");
  });

  it("SAMMA parti flaggas INTE här (intra-parti hanteras av findPossibleDuplicate)", () => {
    const d = findCrossPartyDuplicate(
      { title: "Höj försvarsanslagen till 5 procent av BNP", parties: ["l"], category: "försvar" },
      existing,
    );
    assert.equal(d, null);
  });

  it("annan kategori flaggas inte trots liknande titel", () => {
    const d = findCrossPartyDuplicate(
      { title: "Höj försvarsanslagen till 5 procent av BNP", parties: ["c"], category: "skatter" },
      existing,
    );
    assert.equal(d, null);
  });

  it("olik politik under tröskeln flaggas inte (högre tröskel än intra-parti)", () => {
    const d = findCrossPartyDuplicate(
      { title: "Slopa skatten på pension", parties: ["mp"], category: "välfärd" },
      existing,
    );
    assert.equal(d, null);
  });
});

describe("findComparableCosts — riktmärken för kostnadsankring", () => {
  const lite = (o: Partial<ComparablePromiseLite> & Pick<ComparablePromiseLite, "id" | "title" | "category">): ComparablePromiseLite => ({
    parties: ["m"],
    group_id: null,
    msek_base: 500,
    period: "per_ar",
    basis: "llm_estimat",
    status: "aktiv",
    ...o,
  });
  const existing: ComparablePromiseLite[] = [
    lite({ id: "p-2026-0462", title: "Slopad mängdrabatt och straffminst för de tre allvarligaste brotten", parties: ["l"], category: "rättsväsende", msek_base: 1500 }),
    lite({ id: "p-2026-0313", title: "Avskaffa mängdrabatten för brott", parties: ["m"], category: "rättsväsende", msek_base: 1500 }),
    lite({ id: "p-2026-0099", title: "Fri tandvård för alla barn", parties: ["v"], category: "välfärd", msek_base: 800 }),
  ];

  it("ger jämförbara löften i samma kategori, oavsett parti", () => {
    const cmp = findComparableCosts(
      { title: "Ta bort mängdrabatten vid flerfaldig brottslighet", category: "rättsväsende" },
      existing,
    );
    const ids = cmp.map((c) => c.id);
    assert.ok(ids.includes("p-2026-0462"), "cross-parti-grannen tas med");
    assert.ok(ids.includes("p-2026-0313"));
    assert.ok(!ids.includes("p-2026-0099"), "annan kategori utesluts");
    const l = cmp.find((c) => c.id === "p-2026-0462");
    assert.equal(l?.party, "l", "bär första partiet");
    assert.equal(l?.msek_base, 1500, "bär beloppet");
  });

  it("sorterar mest lika först", () => {
    const cmp = findComparableCosts(
      { title: "Avskaffa mängdrabatten för brott", category: "rättsväsende" },
      existing,
    );
    assert.equal(cmp[0]?.id, "p-2026-0313", "exakt titelträff överst");
  });

  it("utesluter tillbakadragna men behåller nollställda (belopp 0)", () => {
    const withZeroAndRetracted: ComparablePromiseLite[] = [
      lite({ id: "p-2026-0089", title: "Stoppa storskalig industritrålning i Östersjön", parties: ["m"], category: "klimat-miljö", msek_base: 0 }),
      lite({ id: "p-2026-0402", title: "Stoppa trålning nära kusterna", parties: ["l"], category: "klimat-miljö", msek_base: 300, status: "tillbakadragen" }),
    ];
    const cmp = findComparableCosts(
      { title: "Stoppa industritrålning i havet", category: "klimat-miljö" },
      withZeroAndRetracted,
    );
    const ids = cmp.map((c) => c.id);
    assert.ok(ids.includes("p-2026-0089"), "nollställt löfte är ett giltigt riktmärke");
    assert.ok(!ids.includes("p-2026-0402"), "tillbakadraget utesluts");
  });

  it("respekterar maxN", () => {
    const many: ComparablePromiseLite[] = Array.from({ length: 8 }, (_, i) =>
      lite({ id: `p-2026-10${i}`, title: "Skärpa straffen för grova brott rejält", category: "rättsväsende" }),
    );
    const cmp = findComparableCosts(
      { title: "Skärpa straffen för grova brott", category: "rättsväsende" },
      many,
      { maxN: 3 },
    );
    assert.equal(cmp.length, 3);
  });
});
