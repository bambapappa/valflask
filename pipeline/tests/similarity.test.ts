import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  titleSimilarity,
  findPossibleDuplicate,
  findCrossPartyDuplicate,
  type ExistingPromiseLite,
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
