import { test, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isoWeek,
  weekSlug,
  promiseIdsAddedInWeek,
  upsertChronicle,
  maybeGenerateWeekly,
  totalFlasket,
  type ChronicleEntry,
} from "../src/chronicle.ts";
import type { PipelinePromise, ChangelogEntry } from "../src/publish.ts";
import type { LlmClient } from "../src/llm.ts";
import { generateWeekly } from "../src/copy.ts";

test("isoWeek + weekSlug: kända datum", () => {
  assert.deepEqual(isoWeek(new Date("2026-06-29T12:00:00Z")), { year: 2026, week: 27 });
  assert.deepEqual(isoWeek(new Date("2026-01-01T12:00:00Z")), { year: 2026, week: 1 }); // torsdag
  assert.equal(weekSlug(2026, 27), "2026-27");
  assert.equal(weekSlug(2026, 3), "2026-03");
});

test("promiseIdsAddedInWeek: bara poster ur changelog-rader i veckan", () => {
  const changelog: ChangelogEntry[] = [
    { run_id: "a", added: ["p-2026-0001", "p-2026-0002"], updated: [], retracted: [], data_hash: "x", timestamp: "2026-06-29T05:00:00Z" }, // v27
    { run_id: "b", added: ["p-2026-0003"], updated: [], retracted: [], data_hash: "x", timestamp: "2026-06-15T05:00:00Z" }, // v25
  ];
  assert.deepEqual(promiseIdsAddedInWeek(changelog, 2026, 27).sort(), ["p-2026-0001", "p-2026-0002"]);
  assert.deepEqual(promiseIdsAddedInWeek(changelog, 2026, 25), ["p-2026-0003"]);
});

test("upsertChronicle: ersätter samma slug, sorterar nyast först", () => {
  const a: ChronicleEntry = { year: 2026, week: 26, slug: "2026-26", headline: "A", body_md: "x", promise_ids: [], total_msek: 1, gap_msek: 1, generated_at: "", run_id: "r" };
  const b: ChronicleEntry = { ...a, week: 27, slug: "2026-27", headline: "B" };
  const b2: ChronicleEntry = { ...b, headline: "B2" };
  let list = upsertChronicle([a], b);
  assert.equal(list.length, 2);
  assert.equal(list[0]!.slug, "2026-27"); // nyast först
  list = upsertChronicle(list, b2);
  assert.equal(list.length, 2); // ersatt, ej dubblerat
  assert.equal(list.find((c) => c.slug === "2026-27")!.headline, "B2");
});

function promise(id: string, base: number): PipelinePromise {
  return {
    id, group_id: null, title: `Löfte ${id}`, slug: id, parties: ["s"], person: null,
    quote: "x", date_stated: "2026-06-25",
    source: { url: "https://x", domain: "x", archive_url: null, fetched_at: "" },
    category: "övrigt",
    cost: { type: "utgift", period: "per_ar", msek_low: base, msek_base: base, msek_high: base, basis: "parti", basis_url: null, method_note: "x", confidence: 0.5 },
    financing_claimed: { described: false, summary: null, msek: null },
    comparisons: [], quip: "", status: "aktiv", history: [],
    extraction: { model: "x", verified_by: "x", run_id: "x" },
  };
}

test("totalFlasket: samma regler som startsidan — grupp-dedup och aktiva (2026-07-16: krönikan sade 12 978 mdkr, startsidan 8 184)", () => {
  const a = promise("p-1", 1000);                                   // 4000 över mandatperioden
  const b = { ...promise("p-2", 500), group_id: "g1" };             // 2000
  const c = { ...promise("p-3", 700), group_id: "g1" };             // dublett av g1 — räknas EJ
  const d = { ...promise("p-4", 300), status: "tillbakadragen" as never }; // inaktiv — räknas EJ
  assert.equal(totalFlasket([a, b, c, d]), 4000 + 2000);
});

const mockLlm = (payload: object): LlmClient => ({
  complete: async () => JSON.stringify(payload),
}) as unknown as LlmClient;

const NOW = new Date("2026-06-29T12:00:00Z");
const changelog: ChangelogEntry[] = [
  { run_id: "a", added: ["p-2026-0001", "p-2026-0002"], updated: [], retracted: [], data_hash: "x", timestamp: "2026-06-29T05:00:00Z" },
];
const promises = [promise("p-2026-0001", 1000), promise("p-2026-0002", 2000)];

test("maybeGenerateWeekly: genererar krönika för veckan ur nya löften", async () => {
  const { chronicles, generated } = await maybeGenerateWeekly({
    now: NOW, allPromises: promises, changelog, existing: [],
    llm: mockLlm({ headline: "Rubrik", body_md: "Brödtext [p-2026-0001]." }),
    copyModel: "copy-model", runId: "run-x", reformBudgetMsek: 2000,
  });
  assert.ok(generated);
  assert.equal(generated!.slug, "2026-27");
  assert.equal(generated!.headline, "Rubrik");
  assert.deepEqual(generated!.promise_ids.sort(), ["p-2026-0001", "p-2026-0002"]);
  assert.equal(generated!.total_msek, (1000 + 2000) * 4); // ×4 mandatperiod
  assert.equal(generated!.gap_msek, (1000 + 2000) * 4 - 2000, "gap = Fläsket − reformbudget (samma som startsidan)");
  assert.equal(chronicles.length, 1);
});

test("maybeGenerateWeekly: hoppar om krönika redan finns för veckan", async () => {
  const existing: ChronicleEntry[] = [{ year: 2026, week: 27, slug: "2026-27", headline: "Finns", body_md: "x", promise_ids: [], total_msek: 0, gap_msek: 0, generated_at: "", run_id: "r" }];
  const { generated } = await maybeGenerateWeekly({
    now: NOW, allPromises: promises, changelog, existing,
    llm: mockLlm({ headline: "Ny", body_md: "x" }), copyModel: "m", runId: "r", reformBudgetMsek: 2000,
  });
  assert.equal(generated, null);
});

test("maybeGenerateWeekly: inget genereras om inga nya löften i veckan", async () => {
  const { generated } = await maybeGenerateWeekly({
    now: NOW, allPromises: promises, changelog: [], existing: [],
    llm: mockLlm({ headline: "x", body_md: "x" }), copyModel: "m", runId: "r", reformBudgetMsek: 2000,
  });
  assert.equal(generated, null);
});

describe("generateWeekly — staket-avskalning och vägran att publicera råtext", () => {
  it("```json-staket skalas av (2026-28-buggen: rå JSON blev live brödtext)", async () => {
    const llm: LlmClient = {
      complete: async () => '```json\n{"headline":"Rubrik","body_md":"Text."}\n```',
    };
    const c = await generateWeekly("[]", "0 mdkr", llm, "m");
    assert.equal(c.headline, "Rubrik");
    assert.equal(c.body_md, "Text.");
  });

  it("oparsbart svar ⇒ kastar — publicerar ALDRIG råsvaret som krönika", async () => {
    const llm: LlmClient = { complete: async () => "inget json alls" };
    await assert.rejects(() => generateWeekly("[]", "0 mdkr", llm, "m"));
  });

  it("parsbar JSON utan headline/body_md ⇒ kastar", async () => {
    const llm: LlmClient = { complete: async () => '{"headline":""}' };
    await assert.rejects(() => generateWeekly("[]", "0 mdkr", llm, "m"));
  });
});
