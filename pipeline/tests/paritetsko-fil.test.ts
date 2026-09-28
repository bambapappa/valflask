import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lasParitetsunderlag, skrivParitetsko } from "../src/paritetsko-fil.ts";

test("ett senare kvittensbeslut eller ändrat löfte stoppar svepets köskrivning", () => {
  const dir = mkdtempSync(join(tmpdir(), "paritetsko-"));
  try {
    const ko = join(dir, "paritetskon.json");
    const loften = join(dir, "promises.json");
    writeFileSync(ko, '{"fynd":[]}\n');
    writeFileSync(loften, '[]\n');
    const foreKo = lasParitetsunderlag(dir);
    writeFileSync(ko, '{"fynd":[{"kvittens":"senare beslut"}]}\n');
    assert.throws(() => skrivParitetsko(dir, foreKo, { fynd: [] }), /föreläge har ändrats/);
    assert.match(readFileSync(ko, "utf8"), /senare beslut/);

    const foreLofte = lasParitetsunderlag(dir);
    writeFileSync(loften, '[{"id":"nytt"}]\n');
    assert.throws(() => skrivParitetsko(dir, foreLofte, { fynd: [] }), /föreläge har ändrats/);
    assert.match(readFileSync(ko, "utf8"), /senare beslut/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
