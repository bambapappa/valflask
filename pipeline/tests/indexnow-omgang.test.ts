import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

test("samlad indexering tar med verkliga aktiva och indragna löftesadresser", () => {
  const root = resolve(import.meta.dirname, "../..");
  const promises = JSON.parse(readFileSync(resolve(root, "data/promises.json"), "utf8"));
  const aktiv = promises.find((p: any) => p.status === "aktiv");
  const indragen = promises.find((p: any) => p.status === "tillbakadragen");
  assert.ok(aktiv && indragen);
  const output = execFileSync(process.execPath, ["--experimental-strip-types", "site/scripts/indexnow-submit.mts", "--all", "--dry-run"], { cwd: root, encoding: "utf8" });
  for (const p of [aktiv, indragen]) assert.ok(output.includes(`https://utlovat.se/lofte/${p.id}/${p.slug}`));
  assert.ok(output.includes("inget skickat"));
});
