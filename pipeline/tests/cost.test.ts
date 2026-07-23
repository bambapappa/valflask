import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimateCost, looksLikeOneOff, costDeviation } from "../src/cost.ts";
import type { ComparableCost } from "../src/similarity.ts";
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

  it("per-enhetsbelopp i citatet auto-publiceras ALDRIG som totalkostnad (p-2026-0337)", async () => {
    // "30 000 kronor per barn" extraherades som 0.03 msek och publicerades som
    // hela löftets prislapp. Sådana belopp ska till LLM-estimat ⇒ review (§8).
    const c = await estimateCost({
      ...cand(0.03),
      quote:
        "Därför vill vi införa en ny jämställdhetsbonus på 30 000 kronor per barn när du och din partner delar lika på föräldraledigheten.",
    });
    assert.equal(c.basis, "llm_estimat", "per-enhetspris får inte bli basis parti");
    assert.ok(c.confidence < 0.6, "hamnar under auto-publiceringströskeln");
  });

  it("belopp under golvet (50 msek) utan enhetsfras går också till estimat", async () => {
    const c = await estimateCost(cand(30));
    assert.equal(c.basis, "llm_estimat", "30 msek är misstänkt litet för ett nationellt löfte");
  });

  it("'per år' är INTE en enhetsfras — äkta totalbelopp per år behåller basis parti", async () => {
    const c = await estimateCost({
      ...cand(12000),
      quote: "Vi satsar 12 miljarder kronor per år på järnvägsunderhåll i hela landet.",
    });
    assert.equal(c.basis, "parti");
    assert.equal(c.msek_base, 12000);
  });

  it("'i månaden' i citatet stoppar parti-basis även för stora belopp", async () => {
    const c = await estimateCost({
      ...cand(499),
      quote: "Med vårt Sverigekort reser du för 499 kronor i månaden på all kollektivtrafik.",
    });
    assert.equal(c.basis, "llm_estimat");
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

  it("ogiltig JSON från LLM → failedCost (base 0, ej trovärdigt schablonbelopp)", async () => {
    const c = await estimateCost(cand(null), mockLlm("inget vettigt svar"), "m");
    assert.equal(c.msek_base, 0, "får INTE returnera 4000 som kan bulk-godkännas");
    assert.equal(c.confidence, 0.1);
    assert.equal(c.basis, "llm_estimat");
    assert.match(c.method_note, /MÅSTE sättas/);
  });

  it("LLM-anrop som kastar → failedCost base 0 (p-2026-0371-buggen)", async () => {
    const llm: LlmClient = { complete: async () => { throw new Error("nätfel"); } };
    const c = await estimateCost(cand(null), llm, "m");
    assert.equal(c.msek_base, 0);
    assert.equal(c.confidence, 0.1);
    assert.match(c.method_note, /misslyckades/);
  });

  it("engångssignal tvingar period=engang trots LLM per_ar (p-0043/p-0336-buggen)", async () => {
    const llm = mockLlm(
      '{"type":"utgift","period":"per_ar","msek_low":15000,"msek_base":20000,"msek_high":30000,"confidence":0.4,"method_note":"Gripen-gåva"}',
    );
    const c = await estimateCost(
      { ...cand(null), quote: "16 JAS 39 Gripen C/D skänks till Ukraina" },
      llm,
      "m",
    );
    assert.equal(c.period, "engang");
    assert.match(c.method_note, /engångssignal/);
  });

  it("injicerar jämförbara löften i prompten (kostnadsankring)", async () => {
    let captured = "";
    const llm: LlmClient = {
      complete: async (prompt: string) => {
        captured = prompt;
        return '{"type":"utgift","period":"per_ar","msek_low":1000,"msek_base":1500,"msek_high":2000,"confidence":0.5,"method_note":"i linje med p-2026-0462"}';
      },
    };
    const c = await estimateCost(cand(null), llm, "m", [
      { id: "p-2026-0462", title: "Slopad mängdrabatt", party: "l", msek_base: 1500, period: "per_ar", basis: "llm_estimat" },
    ]);
    assert.match(captured, /JÄMFÖRBARA LÖFTEN/);
    assert.match(captured, /p-2026-0462/);
    assert.match(captured, /1500 msek\/år/);
    assert.equal(c.msek_base, 1500);
  });

  it("utan jämförbara löften läggs inget block till i prompten", async () => {
    let captured = "";
    const llm: LlmClient = {
      complete: async (prompt: string) => {
        captured = prompt;
        return '{"type":"utgift","period":"per_ar","msek_low":100,"msek_base":200,"msek_high":300,"confidence":0.4,"method_note":"x"}';
      },
    };
    await estimateCost(cand(null), llm, "m");
    assert.doesNotMatch(captured, /JÄMFÖRBARA/);
  });

  it("looksLikeOneOff: gåva/inlösen/mandatperiod ja; löpande nej", () => {
    assert.equal(looksLikeOneOff("16 Gripen skänks till Ukraina"), true);
    assert.equal(looksLikeOneOff("investera 50 miljarder under nästa mandatperiod"), true);
    assert.equal(looksLikeOneOff("inlösen av friskoleaktiebolag"), true);
    assert.equal(looksLikeOneOff("höja barnbidraget varje månad"), false);
  });
});

describe("costDeviation — avvikelseflagg mot jämförbara", () => {
  const cmp = (bases: number[]): ComparableCost[] =>
    bases.map((b, i) => ({
      id: `p-2026-99${i}`,
      title: "grannlöfte",
      party: "m",
      msek_base: b,
      period: "per_ar",
      basis: "llm_estimat",
    }));

  it("flaggar när beloppet är ≥ 3× över medianen", () => {
    const d = costDeviation(5000, cmp([1500, 1500]));
    assert.ok(d, "ska flaggas");
    assert.equal(d?.median, 1500);
    assert.match(d!.message, /3\.3×/);
  });

  it("flaggar när beloppet är ≥ 3× UNDER medianen", () => {
    const d = costDeviation(500, cmp([1500, 1500]));
    assert.ok(d);
    assert.match(d!.message, /3\.0×/);
  });

  it("flaggar inte inom tröskeln", () => {
    assert.equal(costDeviation(1500, cmp([1500, 1000])), null);
    assert.equal(costDeviation(2000, cmp([1500, 1500])), null);
  });

  it("jämförbara på 0 men beloppet > 0 flaggas (nytt förbud satt högt)", () => {
    const d = costDeviation(600, cmp([0, 0]));
    assert.ok(d);
    assert.equal(d?.factor, 0);
    assert.match(d!.message, /ligger på 0/);
  });

  it("beloppet 0 men jämförbara > 0 flaggas", () => {
    const d = costDeviation(0, cmp([1500, 1500]));
    assert.ok(d);
    assert.match(d!.message, /satt till 0/);
  });

  it("båda 0 → ingen flagg", () => {
    assert.equal(costDeviation(0, cmp([0, 0])), null);
  });

  it("inga jämförbara → ingen flagg", () => {
    assert.equal(costDeviation(9999, []), null);
  });

  it("median av udda antal", () => {
    // [80, 300, 10000] → median 300; 80 avviker 3,75× under → flagg
    const d = costDeviation(80, cmp([300, 80, 10000]));
    assert.ok(d);
    assert.equal(d?.median, 300);
  });
});

describe("looksLikeOneOff (fristående)", () => {
  it("gåva/inlösen/mandatperiod ja; löpande nej", () => {
    assert.equal(looksLikeOneOff("16 Gripen skänks till Ukraina"), true);
    assert.equal(looksLikeOneOff("investera 50 miljarder under nästa mandatperiod"), true);
    assert.equal(looksLikeOneOff("inlösen av friskoleaktiebolag"), true);
    assert.equal(looksLikeOneOff("höja barnbidraget varje månad"), false);
  });
});
