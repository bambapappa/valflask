import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractJsonPayload, normalizeCandidate, trimQuoteToWords } from "../src/extract.ts";
import type { ExtractionCandidate } from "../src/gates.ts";

function cand(partial: Partial<ExtractionCandidate>): ExtractionCandidate {
  return {
    title: "Titel",
    parties: ["mp"],
    person: null,
    quote: "ordagrann text",
    category: "skatter",
    amount_in_text_msek: null,
    financing_mentioned: false,
    ...partial,
  } as ExtractionCandidate;
}

describe("trimQuoteToWords", () => {
  it("lämnar citat inom gränsen orört", () => {
    const q = "ett kort citat med fem ord";
    assert.equal(trimQuoteToWords(q, 40), q);
  });

  it("kortar för långt citat och behåller prefix (ordagrant bevaras)", () => {
    const q = Array.from({ length: 45 }, (_, i) => `ord${i + 1}`).join(" ");
    const out = trimQuoteToWords(q, 40);
    assert.equal(out.split(/\s+/).length, 40);
    assert.ok(q.startsWith(out), "resultatet ska vara ett prefix av originalet");
  });

  it("avslutar vid sista meningsslut inom taket (om ≥5 ord)", () => {
    const q = "Vi vill sänka skatten rejält för alla hushåll. " + Array.from({ length: 40 }, () => "extra").join(" ");
    const out = trimQuoteToWords(q, 40);
    assert.equal(out, "Vi vill sänka skatten rejält för alla hushåll.");
  });
});

describe("normalizeCandidate", () => {
  it("gemenar partikoder", () => {
    const c = normalizeCandidate(cand({ parties: ["MP", "V"] as unknown as ExtractionCandidate["parties"] }));
    assert.deepEqual(c.parties, ["mp", "v"]);
  });
  it("gemenar kategori", () => {
    assert.equal(normalizeCandidate(cand({ category: "Skatter" as ExtractionCandidate["category"] })).category, "skatter");
  });
  it("lämnar redan korrekta värden orörda", () => {
    const c = normalizeCandidate(cand({ parties: ["s"], category: "välfärd" }));
    assert.deepEqual(c.parties, ["s"]);
    assert.equal(c.category, "välfärd");
  });
});

describe("extractJsonPayload", () => {
  it("lämnar rent JSON-objekt orört", () => {
    assert.equal(extractJsonPayload('{"promises":[]}'), '{"promises":[]}');
  });

  it("skalar bort ```json-staket", () => {
    const s = '```json\n{"promises":[{"title":"x"}]}\n```';
    assert.equal(extractJsonPayload(s), '{"promises":[{"title":"x"}]}');
  });

  it("skalar bort ``` utan språkangivelse", () => {
    assert.equal(extractJsonPayload('```\n{"promises":[]}\n```'), '{"promises":[]}');
  });

  it("plockar objektet ur omgivande prosa", () => {
    const s = 'Här är resultatet:\n{"promises":[]}\nHoppas det hjälper!';
    assert.equal(extractJsonPayload(s), '{"promises":[]}');
  });

  it("ger parsebart objekt efter rensning", () => {
    const s = '```json\n{"promises":[{"title":"Sänkt skatt"}]}\n```';
    const parsed = JSON.parse(extractJsonPayload(s)) as { promises: unknown[] };
    assert.equal(parsed.promises.length, 1);
  });
});
