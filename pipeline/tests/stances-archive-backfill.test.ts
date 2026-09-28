import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, symlinkSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const source = "https://example.org/besked";
const quote = "Vi vill bygga fler bostäder i hela landet.";
const snapshot = "https://web.archive.org/web/20260921000000/https://example.org/besked";

for (const stale of [false, true]) {
  test(`arkivbackfill ${stale ? "stoppar ändrat föreläge" : "skriver verifierad kopia"}`, () => {
    const root = mkdtempSync(join(tmpdir(), "stances-archive-"));
    try {
      const pipeline = resolve(import.meta.dirname, "..");
      const scripts = join(root, "pipeline", "scripts");
      const data = join(root, "data");
      mkdirSync(scripts, { recursive: true });
      mkdirSync(data);
      copyFileSync(join(pipeline, "scripts", "stances-archive-backfill.mts"), join(scripts, "stances-archive-backfill.mts"));
      symlinkSync(join(pipeline, "src"), join(root, "pipeline", "src"), "dir");
      const path = join(data, "stances.json");
      const fore = JSON.stringify([{ subquestion_id: "sq-test", party: "m", statements: [{
        id: "s-test", quote, date_stated: "2026-09-20", source: { url: source, domain: "example.org", archive_url: null },
      }] }], null, 2) + "\n";
      writeFileSync(path, fore);
      const preload = join(root, "mock.mjs");
      writeFileSync(preload, `import { readFileSync, writeFileSync } from "node:fs";
const target = process.env.TEST_STANCE_FILE;
globalThis.fetch = async (url) => {
  if (String(url).includes("wayback/available")) {
    if (process.env.TEST_STALE === "1") writeFileSync(target, readFileSync(target, "utf8") + " ");
    return new Response(JSON.stringify({ archived_snapshots: { closest: { available: true, url: ${JSON.stringify(snapshot)} } } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response(${JSON.stringify(`<html><body>${quote}</body></html>`)}, { status: 200, headers: { "content-type": "text/html" } });
};
`);
      const run = spawnSync(process.execPath, ["--import", preload, "--import", "tsx/esm", join(scripts, "stances-archive-backfill.mts"), "avail", "0", "1"], {
        cwd: pipeline, encoding: "utf8", env: { ...process.env, TEST_STANCE_FILE: path, TEST_STALE: stale ? "1" : "0" },
      });
      if (stale) {
        assert.notEqual(run.status, 0);
        assert.match(run.stderr, /föreläge/u);
        assert.equal(readFileSync(path, "utf8"), fore + " ");
      } else {
        assert.equal(run.status, 0, run.stderr);
        assert.equal(JSON.parse(readFileSync(path, "utf8"))[0].statements[0].source.archive_url, snapshot);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
