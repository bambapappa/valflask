import { describe, it } from "node:test";
import assert from "node:assert/strict";

interface TestPromise {
  id: string;
  group_id: string | null;
  parties: string[];
  cost: {
    type: string;
    period: string;
    msek_low: number;
    msek_base: number;
    msek_high: number;
    basis: string;
  };
  financing_claimed: { described: boolean; summary: string | null; msek: number | null };
  status: string;
}

interface TestParty {
  code: string;
  name: string;
  color: string;
  color_text: string;
  mandate_2022: number;
  votes_2022: number;
  block: string;
}

function promiseTotalMsek(p: TestPromise): number {
  return p.cost.msek_base * (p.cost.period === "per_ar" ? 4 : 1);
}

function isActive(p: TestPromise): boolean {
  return p.status !== "tillbakadragen";
}

function isCostType(p: TestPromise): boolean {
  return p.cost.type === "utgift" || p.cost.type === "intäktsminskning";
}

function isBesparing(p: TestPromise): boolean {
  return p.cost.type === "besparing";
}

function totalFlasket(promises: TestPromise[]): number {
  return promises.filter((p) => isCostType(p)).reduce((s, p) => s + promiseTotalMsek(p), 0);
}

function totalBesparingar(promises: TestPromise[]): number {
  return promises.filter((p) => isBesparing(p)).reduce((s, p) => s + promiseTotalMsek(p), 0);
}

function totalFinancingClaimed(promises: TestPromise[]): number {
  return promises.reduce((s, p) => s + (p.financing_claimed.msek ?? 0), 0);
}

function financingGap(promises: TestPromise[]): number {
  return totalFlasket(promises) - totalBesparingar(promises) - totalFinancingClaimed(promises);
}

function partyTotalMsek(promises: TestPromise[], code: string): number {
  return promises.filter((p) => isActive(p) && p.parties.includes(code)).reduce((s, p) => s + promiseTotalMsek(p), 0);
}

interface GroupNote {
  group_id: string;
  parties: string[];
  minMsek: number;
  maxMsek: number;
  hasSpread: boolean;
}

interface CoalitionResult {
  totalFlasket: number;
  totalBesparingar: number;
  totalFinancingClaimed: number;
  financingGap: number;
  promisesCount: number;
  mandatesSum: number;
  groupNotes: GroupNote[];
}

function coalitionAggregates(
  promises: TestPromise[],
  parties: TestParty[],
  partyCodes: string[]
): CoalitionResult {
  const partySet = new Set(partyCodes);
  const relevant = promises.filter(
    (p) => isActive(p) && p.parties.some((c) => partySet.has(c))
  );
  const seenGroups = new Map<string, { min: number; max: number; parties: Set<string> }>();
  let totalFlasketVal = 0;
  let totalBesparingVal = 0;
  let totalFinancingVal = 0;
  let promisesCount = 0;
  const countedIds = new Set<string>();

  for (const p of relevant) {
    const t = promiseTotalMsek(p);

    if (p.group_id) {
      const existing = seenGroups.get(p.group_id);
      if (existing) {
        existing.min = Math.min(existing.min, t);
        existing.max = Math.max(existing.max, t);
        for (const c of p.parties) existing.parties.add(c);
      } else {
        seenGroups.set(p.group_id, {
          min: t,
          max: t,
          parties: new Set(p.parties),
        });
      }
    }

    if (p.group_id && countedIds.has(p.group_id)) continue;

    if (isCostType(p)) totalFlasketVal += t;
    else if (isBesparing(p)) totalBesparingVal += t;

    totalFinancingVal += p.financing_claimed.msek ?? 0;
    promisesCount += 1;

    if (p.group_id) {
      countedIds.add(p.group_id);
    } else {
      countedIds.add(p.id);
    }
  }

  const groupNotes: GroupNote[] = Array.from(seenGroups.entries())
    .filter(([, v]) => v.min !== v.max)
    .map(([gid, v]) => ({
      group_id: gid,
      parties: Array.from(v.parties),
      minMsek: v.min,
      maxMsek: v.max,
      hasSpread: true,
    }));

  const mandatesSum = parties
    .filter((p) => partySet.has(p.code))
    .reduce((s, p) => s + p.mandate_2022, 0);

  return {
    totalFlasket: totalFlasketVal,
    totalBesparingar: totalBesparingVal,
    totalFinancingClaimed: totalFinancingVal,
    financingGap: totalFlasketVal - totalBesparingVal - totalFinancingVal,
    promisesCount,
    mandatesSum,
    groupNotes,
  };
}

function mkPromise(
  id: string,
  opts: Partial<Omit<TestPromise, "cost">> & {
    msek_base: number;
    parties: string[];
    cost?: Partial<TestPromise["cost"]>;
  }
): TestPromise {
  return {
    id,
    group_id: opts.group_id ?? null,
    parties: opts.parties,
    cost: {
      type: opts.cost?.type ?? "utgift",
      period: opts.cost?.period ?? "per_ar",
      msek_low: opts.cost?.msek_low ?? opts.msek_base * 0.8,
      msek_base: opts.msek_base,
      msek_high: opts.cost?.msek_high ?? opts.msek_base * 1.2,
      basis: opts.cost?.basis ?? "rut",
    },
    financing_claimed: opts.financing_claimed ?? { described: false, summary: null, msek: null },
    status: opts.status ?? "aktiv",
  };
}

const PARTIES: TestParty[] = [
  { code: "a", name: "Parti A", color: "#111", color_text: "#111", mandate_2022: 30, votes_2022: 500000, block: "x" },
  { code: "b", name: "Parti B", color: "#222", color_text: "#222", mandate_2022: 25, votes_2022: 400000, block: "y" },
  { code: "c", name: "Parti C", color: "#333", color_text: "#333", mandate_2022: 20, votes_2022: 300000, block: "x" },
  { code: "d", name: "Parti D", color: "#444", color_text: "#444", mandate_2022: 15, votes_2022: 200000, block: "y" },
  { code: "e", name: "Parti E", color: "#555", color_text: "#555", mandate_2022: 10, votes_2022: 100000, block: "z" },
  { code: "f", name: "Parti F", color: "#666", color_text: "#666", mandate_2022: 8, votes_2022: 80000, block: "z" },
  { code: "g", name: "Parti G", color: "#777", color_text: "#777", mandate_2022: 5, votes_2022: 50000, block: "w" },
  { code: "h", name: "Parti H", color: "#888", color_text: "#888", mandate_2022: 3, votes_2022: 30000, block: "w" },
];

describe("T8: Invariant tests", () => {
  it("R1: per_ar ×4, engang ×1", () => {
    const p1 = mkPromise("t1", { msek_base: 1000, parties: ["a"], cost: { period: "per_ar", type: "utgift", msek_low: 800, msek_high: 1200, basis: "rut" } });
    const p2 = mkPromise("t2", { msek_base: 500, parties: ["a"], cost: { period: "engang", type: "utgift", msek_low: 400, msek_high: 600, basis: "rut" } });
    assert.equal(promiseTotalMsek(p1), 4000, "per_ar should ×4");
    assert.equal(promiseTotalMsek(p2), 500, "engang should ×1");
  });

  it("Σ(party totals) = Σ(promise totals) for single-party promises", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 1000, parties: ["a"] }),
      mkPromise("p2", { msek_base: 2000, parties: ["b"] }),
      mkPromise("p3", { msek_base: 3000, parties: ["a"] }),
      mkPromise("p4", { msek_base: 500, parties: ["c"], cost: { type: "besparing", period: "per_ar", msek_low: 400, msek_high: 600, basis: "rut" } }),
    ];
    const partyTotal = PARTIES.reduce((s, p) => s + partyTotalMsek(promises, p.code), 0);
    const allTotal = promises.filter(isActive).reduce((s, p) => s + promiseTotalMsek(p), 0);
    assert.equal(partyTotal, allTotal, "party totals should equal sum of all promises");
  });

  it("R3: coalition with all 8 parties counts each group_id exactly once", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 1000, parties: ["a"], group_id: "g-shared" }),
      mkPromise("p2", { msek_base: 2000, parties: ["b"], group_id: "g-shared" }),
      mkPromise("p3", { msek_base: 3000, parties: ["c"] }),
      mkPromise("p4", { msek_base: 4000, parties: ["d"], group_id: "g-other" }),
      mkPromise("p5", { msek_base: 500, parties: ["e"], cost: { type: "intäktsminskning", period: "per_ar", msek_low: 400, msek_high: 600, basis: "rut" } }),
    ];
    const allCodes = PARTIES.map((p) => p.code);
    const result = coalitionAggregates(promises, PARTIES, allCodes);

    const groupIds = new Set<string>();
    const counted = new Set<string>();
    for (const p of promises.filter(isActive)) {
      const key = p.group_id ?? p.id;
      if (groupIds.has(key)) continue;
      groupIds.add(key);
      counted.add(key);
    }
    assert.equal(result.promisesCount, groupIds.size, "should count each group_id once");
    assert.equal(result.totalFlasket, 1000 * 4 + 3000 * 4 + 4000 * 4 + 500 * 4, "should sum unique items correctly");
  });

  it("R3: min–max interval when amounts differ in same group", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 1000, parties: ["a"], group_id: "g-diff" }),
      mkPromise("p2", { msek_base: 3000, parties: ["b"], group_id: "g-diff" }),
    ];
    const result = coalitionAggregates(promises, PARTIES, ["a", "b"]);
    assert.equal(result.groupNotes.length, 1, "should have one group note");
    const note = result.groupNotes[0]!;
    assert.equal(note.group_id, "g-diff");
    assert.equal(note.minMsek, 4000, "min should be 1000 × 4");
    assert.equal(note.maxMsek, 12000, "max should be 3000 × 4");
    assert.deepEqual(note.parties.sort(), ["a", "b"]);
  });

  it("R4: gap = flasket − besparingar − financing_claimed", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 10000, parties: ["a"] }),
      mkPromise("p2", { msek_base: 3000, parties: ["a"], cost: { type: "besparing", period: "per_ar", msek_low: 2000, msek_high: 4000, basis: "rut" } }),
      mkPromise("p3", { msek_base: 5000, parties: ["a"], financing_claimed: { described: true, summary: "x", msek: 2000 } }),
    ];
    const flasket = totalFlasket(promises);
    const besparingar = totalBesparingar(promises);
    const financing = totalFinancingClaimed(promises);
    const gap = financingGap(promises);
    assert.equal(flasket, 60000, "flasket = (10000 + 5000) × 4");
    assert.equal(besparingar, 12000, "besparingar = 3000 × 4");
    assert.equal(financing, 2000, "financing_claimed = 2000");
    assert.equal(gap, 46000, "gap = 60000 - 12000 - 2000");
  });

  it("R4: negative gap = 'övertäckt'", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 1000, parties: ["a"] }),
      mkPromise("p2", { msek_base: 5000, parties: ["a"], cost: { type: "besparing", period: "per_ar", msek_low: 4000, msek_high: 6000, basis: "rut" } }),
      mkPromise("p3", { msek_base: 2000, parties: ["a"], financing_claimed: { described: true, summary: "x", msek: 8000 } }),
    ];
    const gap = financingGap(promises);
    assert.ok(gap < 0, "gap should be negative (övertäckt)");
  });

  it("tillbakadragen promises excluded from party totals", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 1000, parties: ["a"], status: "aktiv" }),
      mkPromise("p2", { msek_base: 5000, parties: ["a"], status: "tillbakadragen" }),
    ];
    const total = partyTotalMsek(promises, "a");
    assert.equal(total, 4000, "should only count active promises");
  });

  it("R3: coalition dedup with mixed types", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 1000, parties: ["a"], group_id: "g-mix", cost: { type: "utgift", period: "per_ar", msek_low: 800, msek_high: 1200, basis: "rut" } }),
      mkPromise("p2", { msek_base: 2000, parties: ["b"], group_id: "g-mix", cost: { type: "intäktsminskning", period: "per_ar", msek_low: 1500, msek_high: 2500, basis: "rut" } }),
    ];
    const result = coalitionAggregates(promises, PARTIES, ["a", "b"]);
    assert.equal(result.promisesCount, 1, "group dedup: only 1 unique group");
    assert.equal(result.totalFlasket, 4000, "first item in group counts (1000×4)");
    assert.equal(result.groupNotes.length, 1, "amounts differ → group note");
  });

  it(" Coalition mandates sum correctly", () => {
    const result = coalitionAggregates([], PARTIES, ["a", "b", "c"]);
    assert.equal(result.mandatesSum, 30 + 25 + 20, "mandates should sum");
  });

  it("empty coalition returns zeros", () => {
    const result = coalitionAggregates([], PARTIES, []);
    assert.equal(result.totalFlasket, 0);
    assert.equal(result.financingGap, 0);
    assert.equal(result.promisesCount, 0);
    assert.equal(result.groupNotes.length, 0);
  });
});
