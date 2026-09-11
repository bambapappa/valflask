import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { lasPubliceringsfiler } from "../src/publiceringsfiler.ts";

test("hela filjämförelsen fångar kod, övriga data, binärt innehåll och borttagningar", () => {
  const dir = mkdtempSync(join(tmpdir(), "publiceringsfiler-"));
  const root = resolve(import.meta.dirname, "../..");
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  const commit = () => {
    git("add", "-A");
    git("-c", "user.name=Prov", "-c", "user.email=prov@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Underlag");
    return git("rev-parse", "HEAD").trim();
  };
  try {
    git("init", "-q");
    const fil = "site/src/lib/aggregates.ts";
    const data = "data/parties.json";
    for (const path of [fil, data]) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), readFileSync(join(root, path)));
    }
    const fore = commit();
    const original = readFileSync(join(dir, fil), "utf8");
    assert.ok(original.includes("export function totalFlasket"));
    writeFileSync(join(dir, fil), original.replace("export function totalFlasket", "export function andradSumma"));
    chmodSync(join(dir, fil), 0o755);
    rmSync(join(dir, data));
    const namn = 'ny\tfil <underlag>.bin';
    writeFileSync(join(dir, namn), Buffer.from([0, 1, 2, 255]));
    const efter = commit();
    writeFileSync(join(dir, fil), "Lokal fil får inte bli revisionsunderlag");
    const diff = lasPubliceringsfiler(dir, fore, efter);
    assert.deepEqual(diff.sokvagar, [fil, data, namn].sort());
    assert.ok(diff.patch.includes("+export function andradSumma"));
    assert.ok(diff.patch.includes("deleted file mode"));
    assert.ok(diff.patch.includes("new mode 100755"));
    assert.ok(diff.patch.includes("GIT binary patch"));
    assert.ok(!diff.patch.includes("Lokal fil får inte"));
    assert.deepEqual(lasPubliceringsfiler(dir, efter, efter), { sokvagar: [], patch: "" });
    assert.throws(() => lasPubliceringsfiler(dir, "main", efter), /commit/);
    assert.throws(() => lasPubliceringsfiler(dir, "0".repeat(40), efter));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
