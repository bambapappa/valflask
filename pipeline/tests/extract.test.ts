import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractJsonPayload } from "../src/extract.ts";

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
