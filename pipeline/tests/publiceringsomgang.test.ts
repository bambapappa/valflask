import test from "node:test";
import assert from "node:assert/strict";
import { arPubliceringsomgang } from "../src/publiceringsomgang.ts";

test("endast schemalagd eller uttryckligt beställd omgång på main kan publicera", () => {
  for (const [event, ref, input, expected] of [
    ["schedule", "refs/heads/main", "", true],
    ["workflow_dispatch", "refs/heads/main", "true", true],
    ["workflow_dispatch", "refs/heads/main", "false", false],
    ["workflow_dispatch", "refs/heads/main", "", false],
    ["push", "refs/heads/main", "true", false],
    ["pull_request", "refs/pull/1/merge", "true", false],
    ["workflow_dispatch", "refs/heads/annan", "true", false],
    ["schedule", "refs/heads/annan", "true", false],
    ["", "", "", false],
  ] as const) assert.equal(arPubliceringsomgang(event, ref, input), expected, `${event} ${ref} ${input}`);
});
