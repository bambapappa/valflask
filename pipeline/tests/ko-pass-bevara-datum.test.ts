import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve("scripts/ko-pass-bevara-datum.py");

test("omkörning utan sakändring behåller indexet exakt, medan nytt utfall får nytt datum", () => {
  const repo = mkdtempSync(join(tmpdir(), "ko-pass-datum-"));
  try {
    execFileSync("git", ["init", "-q", repo]);
    mkdirSync(join(repo, "data"));
    const path = join(repo, "data", "provningar.json");
    const old = { poster: [
      { id: "ko:ett", slag: "lofte", datum: "2026-09-24", utfall: "haller", underlag_hash: "a" },
      { id: "ko:tva", slag: "lofte", datum: "2026-09-24", utfall: "oklart", underlag_hash: "b" },
    ] };
    const serialize = (value: unknown) => `${JSON.stringify(value, null, 1)}\n`;
    writeFileSync(path, serialize(old));
    execFileSync("git", ["-C", repo, "add", "data/provningar.json"]);
    execFileSync("git", ["-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "base"]);

    const datesOnly = structuredClone(old);
    for (const row of datesOnly.poster) row.datum = "2026-09-25";
    writeFileSync(path, serialize(datesOnly));
    execFileSync("python3", [script, repo]);
    assert.equal(readFileSync(path, "utf8"), serialize(old));

    datesOnly.poster[1]!.utfall = "haller-med-forbehall";
    writeFileSync(path, serialize(datesOnly));
    execFileSync("python3", [script, repo]);
    const actual = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(actual.poster[0].datum, "2026-09-24");
    assert.equal(actual.poster[1].datum, "2026-09-25");
    assert.equal(actual.poster[1].utfall, "haller-med-forbehall");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
