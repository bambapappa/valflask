import { it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reviewId, type ReviewCandidate } from "../src/review.ts";
import { avvisningsforslagshash, forberedAvvisningspaket } from "../src/avvisningspaket.ts";

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

it("GitHub-avslag kan bara verkställa ett redan hämtat privat paket", () => {
  const kommentar = readFileSync(join(import.meta.dirname, "../scripts/handle-review-comment.mts"), "utf8");
  assert.match(kommentar, /bindGithubAvvisning/u);
  assert.match(kommentar, /verkstallAvvisningspaket/u);
  assert.doesNotMatch(kommentar, /forberedAvvisningspaket/u);
  const etikett = readFileSync(join(import.meta.dirname, "../scripts/apply-labeled-decisions.mts"), "utf8");
  assert.doesNotMatch(etikett, /verkstallAvvisningspaket|forberedAvvisningspaket|\breject\s*\(/u);
});

it("issue-kommentar avvisar inte ändrat citat eller oförberett avslag", () => {
  const root = mkdtempSync(join(tmpdir(), "avvisningsissue-"));
  const privat = mkdtempSync(join(tmpdir(), "avvisningsprivat-"));
  const pipeline = join(root, "pipeline"), data = join(root, "data");
  try {
    mkdirSync(join(pipeline, "scripts"), { recursive: true });
    mkdirSync(data);
    for (const namn of ["src", "schemas", "prompts"]) cpSync(join(import.meta.dirname, "..", namn), join(pipeline, namn), { recursive: true });
    cpSync(join(import.meta.dirname, "../package.json"), join(pipeline, "package.json"));
    cpSync(join(import.meta.dirname, "../scripts/handle-review-comment.mts"), join(pipeline, "scripts/handle-review-comment.mts"));
    symlinkSync(join(import.meta.dirname, "../node_modules"), join(pipeline, "node_modules"), "dir");
    const fore = { "needs_review.json": JSON.stringify(ko), "avvisade.json": "[]" };
    for (const [namn, text] of Object.entries(fore)) writeFileSync(join(data, namn), text);
    const id = reviewId(ko[0]!);
    const paket = forberedAvvisningspaket([{ id, skal: "Kandidaten saknar ett kontrollerbart åtagande enligt den sparade sakprövningen." }], fore, new Date("2026-09-24T00:00:00Z"));
    const fil = join(privat, "paket.json"), hash = avvisningsforslagshash(paket);
    writeFileSync(fil, JSON.stringify(paket));
    const run = (kommando: string) => {
      const output = join(root, "output.txt");
      writeFileSync(output, "");
      const res = spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/handle-review-comment.mts"], {
        cwd: pipeline, encoding: "utf8", env: { ...process.env,
          ISSUE_TITLE: `[review ${id}] prov`, COMMENT_BODY: kommando,
          DECISION_ACTOR: "bambapappa", DECISION_ACTOR_TYPE: "User", DECISION_ASSOCIATION: "OWNER",
          DECISION_REF: "https://github.com/bambapappa/valflask/issues/42#issuecomment-7",
          GITHUB_REPOSITORY: "bambapappa/valflask", ISSUE_NUMBER: "42",
          GODKANNANDEPAKET_FIL: fil, GITHUB_OUTPUT: output,
        },
      });
      assert.equal(res.status, 0, res.stderr);
      return readFileSync(output, "utf8");
    };
    assert.match(run("/avvisa utan paket"), /result=error/u);
    assert.equal(readFileSync(join(data, "needs_review.json"), "utf8"), fore["needs_review.json"]);
    const andrad = structuredClone(ko);
    andrad[0]!.candidate!.quote = `${ko[0]!.candidate!.quote} ändrat citat`;
    assert.equal(reviewId(andrad[0]!), id);
    writeFileSync(join(data, "needs_review.json"), JSON.stringify(andrad));
    assert.match(run(`/avvisa paket ${hash}`), /result=error/u);
    assert.equal(readFileSync(join(data, "avvisade.json"), "utf8"), "[]");
    writeFileSync(join(data, "needs_review.json"), fore["needs_review.json"]);
    assert.match(run(`/avvisa paket ${hash}`), /result=rejected/u);
    assert.equal(JSON.parse(readFileSync(join(data, "avvisade.json"), "utf8")).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(privat, { recursive: true, force: true }); }
});
