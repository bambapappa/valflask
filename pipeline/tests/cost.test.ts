import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimateCost } from "../src/cost.ts";
import type { LlmClient } from "../src/llm.ts";
import type { ExtractionCandidate } from "../src/gates.ts";

function cand(amount: number | null): ExtractionCandidate {
  return {
    title: "Ett löfte om något",
    parties: ["s"],
    person: null,
    quote: "vi vill göra detta",
    category: "skatter",
    amount_in_text_msek: amount,
    financing_mentioned: false,
  } as ExtractionCandidate;
}

function mockLlm(response: string): LlmClient {
  return { complete: async () => response };
}

describe("estimateCost", () => {
  it("härleder deterministiskt när belopp finns i text", async () => {
    const c = await estimateCost(cand(1000));
    assert.equal(c.basis, "parti");
    assert.equal(c.msek_base, 1000);
    assert.equal(c.confidence, 0.7);
    assert.equal(c.msek_low, 750);
    assert.equal(c.msek_high, 1350);
  });

  it("utan belopp och utan LLM → platshållare med låg confidence", async () => {
    const c = await estimateCost(cand(null));
    assert.equal(c.basis, "llm_estimat");
    assert.equal(c.confidence, 0.3);
  });

  it("LLM-estimat: tolkar JSON, basis llm_estimat", async () => {
    const llm = mockLlm(
      '{"type":"utgift","period":"per_ar","msek_low":100,"msek_base":500,"msek_high":900,"confidence":0.6,"method_note":"jämförbar reform"}',
    );
    const c = await estimateCost(cand(null), llm, "m");
    assert.equal(c.basis, "llm_estimat");
    assert.equal(c.msek_base, 500);
    assert.equal(c.confidence, 0.6);
    assert.equal(c.method_note, "jämförbar reform");
  });

  it("tvingar high ≥ 1,5 × low (R2)", async () => {
    const llm = mockLlm(
      '{"type":"utgift","period":"per_ar","msek_low":100,"msek_base":110,"msek_high":120,"confidence":0.5,"method_note":"x"}',
    );
    const c = await estimateCost(cand(null), llm, "m");
    assert.equal(c.msek_high, 150); // 1,5 × 100
  });

  it("kapar confidence under verifierat (0,65)", async () => {
    const llm = mockLlm(
      '{"type":"utgift","period":"per_ar","msek_low":100,"msek_base":500,"msek_high":900,"confidence":0.95,"method_note":"x"}',
    );
    const c = await estimateCost(cand(null), llm, "m");
    assert.equal(c.confidence, 0.65);
  });

  it("skalar bort ```-staket i LLM-svaret", async () => {
    const llm = mockLlm(
      '```json\n{"type":"besparing","period":"engang","msek_low":10,"msek_base":20,"msek_high":40,"confidence":0.4,"method_note":"y"}\n```',
    );
    const c = await estimateCost(cand(null), llm, "m");
    assert.equal(c.type, "besparing");
    assert.equal(c.period, "engang");
    assert.equal(c.msek_base, 20);
  });

  it("ogiltig JSON från LLM → platshållare 0,3", async () => {
    const c = await estimateCost(cand(null), mockLlm("inget vettigt svar"), "m");
    assert.equal(c.confidence, 0.3);
    assert.equal(c.basis, "llm_estimat");
  });
});
