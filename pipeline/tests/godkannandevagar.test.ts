import { it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reviewId, type ReviewCandidate } from "../src/review.ts";

const ko = JSON.parse(readFileSync(new URL("../../data/needs_review.json", import.meta.url), "utf8")) as ReviewCandidate[];
assert.ok(ko.length > 0);

it("issue-kommentaren kan inte publicera utan ett redan förberett beslutspaket", () => {
  const root = mkdtempSync(join(tmpdir(), "godkannandevag-"));
  const pipeline = join(root, "pipeline");
  const data = join(root, "data");
  try {
    mkdirSync(join(pipeline, "scripts"), { recursive: true });
    mkdirSync(data);
    for (const namn of ["src", "schemas", "prompts"]) cpSync(join(import.meta.dirname, "..", namn), join(pipeline, namn), { recursive: true });
    cpSync(join(import.meta.dirname, "../package.json"), join(pipeline, "package.json"));
    cpSync(join(import.meta.dirname, "../scripts/handle-review-comment.mts"), join(pipeline, "scripts/handle-review-comment.mts"));
    symlinkSync(join(import.meta.dirname, "../node_modules"), join(pipeline, "node_modules"), "dir");
    writeFileSync(join(data, "needs_review.json"), JSON.stringify(ko, null, 2) + "\n");
    writeFileSync(join(data, "avvisade.json"), "[]\n");
    const fore = readFileSync(join(data, "needs_review.json"), "utf8");
    const output = join(root, "output.txt");
    const result = spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/handle-review-comment.mts"], {
      cwd: pipeline,
      encoding: "utf8",
      env: {
        ...process.env,
        ISSUE_TITLE: `[review ${reviewId(ko[0]!)}] prov`,
        COMMENT_BODY: "/godkänn",
        DECISION_ACTOR: "bambapappa",
        DECISION_ASSOCIATION: "OWNER",
        DECISION_REF: "https://github.com/bambapappa/valflask/issues/1#issuecomment-1",
        GITHUB_OUTPUT: output,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(output, "utf8"), /result=error/u);
    assert.match(result.stdout, /redan sparat löftesförslag/u);
    assert.equal(readFileSync(join(data, "needs_review.json"), "utf8"), fore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("ingen GitHub-konsument anropar den äldre direkta godkännandevägen", () => {
  for (const namn of ["handle-review-comment.mts", "apply-labeled-decisions.mts"]) {
    const text = readFileSync(join(import.meta.dirname, "../scripts", namn), "utf8");
    assert.doesNotMatch(text, /\bapprove\s*\(/u);
    assert.doesNotMatch(text, /\bapprove\s*,/u);
    assert.match(text, /separata prövningshash/u);
  }
  const synk = readFileSync(join(import.meta.dirname, "../scripts/sync-review-issues.mts"), "utf8");
  assert.doesNotMatch(synk, /beslut:godkänn/u);
  assert.doesNotMatch(synk, /\/godkänn/u);
});
