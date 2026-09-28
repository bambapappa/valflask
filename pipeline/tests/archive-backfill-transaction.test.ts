import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, symlinkSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const source = "https://example.org/besked";
const quote = "Vi vill bygga fler bostäder i hela landet.";
const snapshot = "https://web.archive.org/web/20260921000000/https://example.org/besked";

for (const stale of [false, true]) {
  test(`löftenas arkivbackfill ${stale ? "stoppar ändrat föreläge" : "skriver samlat filpaket"}`, () => {
    const root = mkdtempSync(join(tmpdir(), "promise-archive-"));
    try {
      const pipeline = resolve(import.meta.dirname, "..");
      const scripts = join(root, "pipeline", "scripts");
      const data = join(root, "data");
      mkdirSync(scripts, { recursive: true });
      mkdirSync(data);
      copyFileSync(join(pipeline, "scripts", "archive-backfill.mts"), join(scripts, "archive-backfill.mts"));
      symlinkSync(join(pipeline, "src"), join(root, "pipeline", "src"), "dir");
      const promisePath = join(data, "promises.json");
      const changelogPath = join(data, "changelog.json");
      const waitingPath = join(data, "arkivvantan.json");
      const promisesBefore = JSON.stringify([{ id: "p-test", quote, source: { url: source, archive_url: null } }], null, 2) + "\n";
      const changelogBefore = "[]\n";
      writeFileSync(promisePath, promisesBefore);
      writeFileSync(changelogPath, changelogBefore);
      const preload = join(root, "mock.mjs");
      writeFileSync(preload, `import { readFileSync, writeFileSync } from "node:fs";
globalThis.fetch = async (url) => {
  if (String(url).includes("wayback/available")) {
    if (process.env.TEST_STALE === "1") {
      const path = process.env.TEST_CHANGELOG_FILE;
      writeFileSync(path, readFileSync(path, "utf8") + " ");
    }
    return new Response(JSON.stringify({ archived_snapshots: { closest: { available: true, url: ${JSON.stringify(snapshot)} } } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response(${JSON.stringify(`<html><body>${quote}</body></html>`)}, { status: 200, headers: { "content-type": "text/html" } });
};
`);
      const run = spawnSync(process.execPath, ["--import", preload, "--import", "tsx/esm", join(scripts, "archive-backfill.mts"), "avail", "0", "1"], {
        cwd: pipeline, encoding: "utf8", env: { ...process.env, TEST_CHANGELOG_FILE: changelogPath, TEST_STALE: stale ? "1" : "0" },
      });
      if (stale) {
        assert.notEqual(run.status, 0);
        assert.match(run.stderr, /föreläge/u);
        assert.equal(readFileSync(promisePath, "utf8"), promisesBefore);
        assert.equal(readFileSync(changelogPath, "utf8"), changelogBefore + " ");
        assert.equal(existsSync(waitingPath), false);
      } else {
        assert.equal(run.status, 0, run.stderr);
        assert.equal(JSON.parse(readFileSync(promisePath, "utf8"))[0].source.archive_url, snapshot);
        assert.deepEqual(JSON.parse(readFileSync(changelogPath, "utf8"))[0].updated, ["p-test"]);
        assert.equal(existsSync(waitingPath), true);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
