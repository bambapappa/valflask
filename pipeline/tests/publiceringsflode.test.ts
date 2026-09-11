import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

test("det verkliga byggflödet kontrollerar samma artefaktnamn innan Pages kan publicera", () => {
  const flow = parse(readFileSync(new URL("../../.github/workflows/build.yml", import.meta.url), "utf8"));
  const bygg = flow.jobs["build-and-test"].steps;
  const upload = bygg.find((s: any) => s.id === "pages-artifact");
  assert.equal(upload.with.name, "github-pages-${{ github.run_id }}-${{ github.run_attempt }}");
  const prepare = bygg.findIndex((s: any) => s.run?.includes("publiceringsforbered.mts"));
  assert.ok(prepare > bygg.indexOf(upload));
  const save = bygg.findIndex((s: any) => s.with?.name === "publiceringsunderlag-${{ github.run_id }}-${{ github.run_attempt }}");
  assert.ok(save > prepare);
  assert.equal(bygg[save].with["if-no-files-found"], "error");
  const jobb = flow.jobs["deploy-pages"];
  assert.equal(jobb.needs, "build-and-test");
  assert.equal(jobb.environment.name, "github-pages");
  const check = jobb.steps.findIndex((s: any) => s.run?.includes("publiceringskontroll.mts"));
  const deploy = jobb.steps.findIndex((s: any) => s.id === "deployment");
  assert.ok(check >= 0 && check < deploy);
  assert.equal(jobb.steps[check]["continue-on-error"], undefined);
  assert.equal(jobb.steps[deploy].if, undefined);
  assert.equal(jobb.steps[deploy].with.artifact_name, upload.with.name);
  assert.ok(jobb.steps[check].run.includes('"github-pages-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"'));
  assert.ok(jobb.steps[check].run.includes('"$RUNNER_TEMP/underlag/paket.json"'));
  assert.equal(flow.permissions.actions, "read");
  assert.equal(flow.permissions.deployments, "read");
});
