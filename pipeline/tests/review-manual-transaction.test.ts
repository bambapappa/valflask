import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { add, havAvvisning } from "../src/review.ts";
import { avvisa } from "../src/avvisningar.ts";
import { taLaset, TRANSAKTION } from "../src/datalas.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "review-manual-"));
  const queue = join(dir, "needs_review.json");
  const memory = join(dir, "avvisade.json");
  const source = join(dir, "manual.json");
  writeFileSync(queue, "[]\n");
  const entries = avvisa([], "https://example.org/politik", "Inför en reform", "Tidigare nej", "2026-09-01");
  writeFileSync(memory, JSON.stringify(entries, null, 2) + "\n");
  writeFileSync(source, JSON.stringify({ title: "En reform", parties: ["s"], quote: "Inför en reform", source: "https://example.org/politik" }));
  return { dir, queue, memory, source, key: entries[0]!.nyckel };
}

it("manuell köpost skriver via filpaket och respekterar datalåset", () => {
  const s = setup();
  try {
    const before = readFileSync(s.queue, "utf8");
    const release = taLaset(s.dir, "annat arbete");
    try { assert.throws(() => add(s.source, s.dir), /låst/u); }
    finally { release(); }
    assert.equal(readFileSync(s.queue, "utf8"), before);
    add(s.source, s.dir);
    const after = JSON.parse(readFileSync(s.queue, "utf8"));
    assert.equal(after.length, 1);
    assert.equal(after[0].candidate.title, "En reform");
    assert.equal(existsSync(join(s.dir, TRANSAKTION)), false);
  } finally { rmSync(s.dir, { recursive: true, force: true }); }
});

it("hävt avslag skriver via filpaket och respekterar datalåset", () => {
  const s = setup();
  try {
    const before = readFileSync(s.memory, "utf8");
    const release = taLaset(s.dir, "annat arbete");
    try { assert.throws(() => havAvvisning(s.key, "Nytt belägg", s.dir), /låst/u); }
    finally { release(); }
    assert.equal(readFileSync(s.memory, "utf8"), before);
    havAvvisning(s.key, "Nytt belägg", s.dir);
    const after = JSON.parse(readFileSync(s.memory, "utf8"));
    assert.equal(after.length, 1);
    assert.equal(after[0].havd.skal, "Nytt belägg");
    assert.equal(existsSync(join(s.dir, TRANSAKTION)), false);
  } finally { rmSync(s.dir, { recursive: true, force: true }); }
});
