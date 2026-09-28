import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { lasBrodtextbackfill, skrivBrodtextbackfill } from "../src/brodtext-backfill-skrivning.ts";

const source = resolve(import.meta.dirname, "../../data/kopplingar.json");
function kopia(): string {
  const dir = mkdtempSync(join(tmpdir(), "brodtext-backfill-"));
  copyFileSync(source, join(dir, "kopplingar.json"));
  return dir;
}

test("tom brödtextmigrering lämnar verklig fil byteidentisk utan journal", () => {
  const dir = kopia();
  try {
    const { fore, kopplingar } = lasBrodtextbackfill(dir);
    assert.equal(skrivBrodtextbackfill(dir, fore, kopplingar), false);
    assert.equal(readFileSync(join(dir, "kopplingar.json"), "utf8"), fore["kopplingar.json"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ändrad kopplingsfil stoppar äldre migrering innan den skriver över den", () => {
  const dir = kopia();
  try {
    const { fore, kopplingar } = lasBrodtextbackfill(dir);
    const ändrade = structuredClone(kopplingar);
    ändrade[0]!.bevis = { ...ändrade[0]!.bevis, brodtext_oppen: "anslagsrad" };
    const konkurrerande = readFileSync(join(dir, "kopplingar.json"), "utf8") + "\n";
    writeFileSync(join(dir, "kopplingar.json"), konkurrerande);
    assert.throws(() => skrivBrodtextbackfill(dir, fore, ändrade), /föreläge/u);
    assert.equal(readFileSync(join(dir, "kopplingar.json"), "utf8"), konkurrerande);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
