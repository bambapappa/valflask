import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lasFillage } from "../src/datatransaktion.ts";
import { computeDataHash } from "../src/publish.ts";
import { skrivUnderlagskomplettering } from "../src/underlagskomplettering.ts";

const namn = ["promises.json", "changelog.json"] as const;

it("belägg och nytt datafingeravtryck skrivs tillsammans", () => {
  const dir = mkdtempSync(join(tmpdir(), "underlag-"));
  try {
    writeFileSync(join(dir, "promises.json"), '[{"id":"p1"}]\n');
    writeFileSync(join(dir, "changelog.json"), "[]\n");
    const fore = lasFillage(dir, namn);
    const efter = [{ id: "p1", source: { video_archive_url: "https://example.org/varchive/1" } }];
    skrivUnderlagskomplettering(dir, fore, efter, ["p1"], "film-arkiv", new Date("2026-09-24T12:00:00Z"));
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "promises.json"), "utf8")), efter);
    const logg = JSON.parse(readFileSync(join(dir, "changelog.json"), "utf8"));
    assert.equal(logg.length, 1);
    assert.deepEqual(logg[0].updated, ["p1"]);
    assert.equal(logg[0].data_hash, computeDataHash(efter));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("trasig logg eller ändrade löften lämnar originalfilerna orörda", () => {
  const dir = mkdtempSync(join(tmpdir(), "underlag-stale-"));
  try {
    writeFileSync(join(dir, "promises.json"), '[{"id":"p1"}]\n');
    writeFileSync(join(dir, "changelog.json"), "{trasig");
    const fore = lasFillage(dir, namn);
    assert.throws(() => skrivUnderlagskomplettering(dir, fore, [{ id: "p1", nytt: true }], ["p1"], "avskrift-kontroll", new Date()), SyntaxError);
    assert.equal(readFileSync(join(dir, "promises.json"), "utf8"), fore["promises.json"]);
    assert.equal(readFileSync(join(dir, "changelog.json"), "utf8"), "{trasig");
    writeFileSync(join(dir, "changelog.json"), "[]\n");
    const nyttFore = lasFillage(dir, namn);
    writeFileSync(join(dir, "promises.json"), '[{"id":"p1","annan":true}]\n');
    assert.throws(() => skrivUnderlagskomplettering(dir, nyttFore, [{ id: "p1", nytt: true }], ["p1"], "avskrift-kontroll", new Date()), /föreläge har ändrats/u);
    assert.equal(readFileSync(join(dir, "changelog.json"), "utf8"), "[]\n");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
