import { it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reviewId, type ReviewCandidate } from "../src/review.ts";

const ko = JSON.parse(readFileSync(new URL("../../data/needs_review.json", import.meta.url), "utf8")) as ReviewCandidate[];
assert.ok(ko.length > 0);

it("review-CLI kan inte avvisa utan ett fullständigt beslutspaket", () => {
  const root = mkdtempSync(join(tmpdir(), "avvisningsvagar-"));
  const pipeline = join(root, "pipeline");
  const data = join(root, "data");
  try {
    mkdirSync(pipeline);
    mkdirSync(data);
    for (const namn of ["src", "schemas", "prompts"]) {
      cpSync(join(import.meta.dirname, "..", namn), join(pipeline, namn), { recursive: true });
    }
    cpSync(join(import.meta.dirname, "../package.json"), join(pipeline, "package.json"));
    symlinkSync(join(import.meta.dirname, "../node_modules"), join(pipeline, "node_modules"), "dir");
    writeFileSync(join(data, "needs_review.json"), JSON.stringify(ko, null, 2) + "\n");
    writeFileSync(join(data, "avvisade.json"), "[]\n");
    const fore = {
      ko: readFileSync(join(data, "needs_review.json"), "utf8"),
      avvisade: readFileSync(join(data, "avvisade.json"), "utf8"),
    };
    const run = (...args: string[]) => spawnSync(
      process.execPath,
      ["--import", "tsx/esm", "src/review.ts", ...args],
      { cwd: pipeline, encoding: "utf8" },
    );
    for (const args of [
      ["reject", "0", "Detta ska inte kunna kringgå beslutspaketet."],
      ["reject-id", reviewId(ko[0]!), "Detta ska inte kunna kringgå beslutspaketet."],
    ]) {
      const resultat = run(...args);
      assert.notEqual(resultat.status, 0);
      assert.match(resultat.stderr, /Direktavslag är avstängt/u);
      assert.match(resultat.stderr, /avvisa-lista/u);
      assert.equal(readFileSync(join(data, "needs_review.json"), "utf8"), fore.ko);
      assert.equal(readFileSync(join(data, "avvisade.json"), "utf8"), fore.avvisade);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("workflowernas avslagskonsumenter använder avvisningspaketet", () => {
  for (const namn of ["handle-review-comment.mts", "apply-labeled-decisions.mts"]) {
    const text = readFileSync(join(import.meta.dirname, "../scripts", namn), "utf8");
    assert.match(text, /forberedAvvisningspaket/u);
    assert.match(text, /verkstallAvvisningspaket/u);
    assert.doesNotMatch(text, /\breject\s*\(/u);
  }
});
