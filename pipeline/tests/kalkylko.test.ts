import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sparaKalkylko, lasKalkylko } from "../src/kalkylko.ts";
it("checkpoint bevarar gamla förslag, undviker dubbletter och stoppar trasig kö", () => {
  const dir = mkdtempSync(join(tmpdir(), "kalkylko-"));
  try {
    writeFileSync(join(dir, "calculation_review.json"), JSON.stringify([{ id: "gammal" }]));
    sparaKalkylko(dir, [{ id: "ny" }]); sparaKalkylko(dir, [{ id: "ny" }]);
    assert.deepEqual(lasKalkylko(dir), [{ id: "gammal" }, { id: "ny" }]);
    writeFileSync(join(dir, "calculation_review.json"), "trasig");
    assert.throws(() => sparaKalkylko(dir, [{ id: "ny" }]));
    assert.equal(readFileSync(join(dir, "calculation_review.json"), "utf8"), "trasig");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
