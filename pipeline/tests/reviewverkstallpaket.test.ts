import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
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

it("felaktigt okänt belopp stoppas före paketförberedelse och lämnar originalen orörda", () => {
  const dir = mkdtempSync(join(tmpdir(), "verkstall-okant-"));
  try {
    const posts = [{id: "syntetiskt", cost: {msek_low: 1, msek_base: 0, msek_high: 0, harledning: {belopp_okant: {skal: "Test"}}}}];
    writeFileSync(join(dir, "promises.json"), JSON.stringify(posts));
    for (const name of ["needs_review.json", "provningar.json", "parties.json"]) writeFileSync(join(dir, name), "[]");
    const before = readdirSync(dir).map(n => [n, readFileSync(join(dir, n), "utf8")]);
    assert.throws(() => forberedReviewverkstall([{id: "syntetiskt", val: "ejlofte"}], dir), /okänt belopp/);
    assert.deepEqual(readdirSync(dir).map(n => [n, readFileSync(join(dir, n), "utf8")]), before);
  } finally {rmSync(dir, {recursive: true, force: true});}
});
