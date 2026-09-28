import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { forberedReviewverkstall } from "../src/reviewverkstallpaket.ts";
it("tom lista och saknade obligatoriska data stoppas utan nya filer", () => {
  const dir = mkdtempSync(join(tmpdir(), "verkstall-tomt-"));
  try {
    assert.throws(() => forberedReviewverkstall([], dir), /tom/u);
    assert.throws(() => forberedReviewverkstall([{ id: "saknas", val: "ejlofte" }], dir), /Saknar promises/u);
    assert.deepEqual(readdirSync(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
