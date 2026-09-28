import { test } from "node:test";
import assert from "node:assert/strict";
import { hamtaIssueSidor } from "../src/github-issue-pages.ts";

test("läser även sida 21 så äldre kopplings-ID:n inte missas", async () => {
  const pages: number[] = [];
  const issues = await hamtaIssueSidor<{ number: number }>(
    "agare/repo", "koppling-kö", "all",
    async (path) => {
      const page = Number(new URL(`https://api.github.com${path}`).searchParams.get("page"));
      pages.push(page);
      return Array.from({ length: page <= 20 ? 100 : 78 }, (_, index) => ({ number: (page - 1) * 100 + index + 1 }));
    },
  );
  assert.equal(issues.length, 2078);
  assert.equal(issues.at(-1)?.number, 2078);
  assert.equal(pages.length, 21);
  assert.equal(pages.at(-1), 21);
});

test("avbryter om GitHub inte returnerar en lista", async () => {
  await assert.rejects(
    hamtaIssueSidor("agare/repo", "koppling-kö", "open", async () => ({ error: "rate limit" })),
    /issue-lista på sida 1/,
  );
});
