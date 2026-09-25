import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lasArkivfil, skrivArkivfil } from "../src/arkivfil.ts";

test("arkivcheckpoint behåller tidigare steg men vägrar skriva över en senare verifiering", () => {
  const dir = mkdtempSync(join(tmpdir(), "hv-arkiv-"));
  try {
    const fil = join(dir, "arkiv.json");
    writeFileSync(fil, "[]\n");
    let fore = lasArkivfil(dir);
    fore = skrivArkivfil(dir, fore, [{ handling_id: "h1", utfall: "bar" }]);
    assert.match(readFileSync(fil, "utf8"), /"h1"/);
    writeFileSync(fil, '[{"handling_id":"h1","utfall":"rattad senare"}]\n');
    assert.throws(() => skrivArkivfil(dir, fore, [{ handling_id: "h1", utfall: "bar" }, { handling_id: "h2" }]), /föreläge har ändrats/);
    assert.match(readFileSync(fil, "utf8"), /rattad senare/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
