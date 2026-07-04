import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseReviewCommand,
  reviewId,
  findIndexByReviewId,
  type ReviewCandidate,
} from "../src/review.ts";

describe("parseReviewCommand — issue-kommentar till beslut", () => {
  it("/godkänn utan argument", () => {
    assert.deepEqual(parseReviewCommand("/godkänn"), { action: "approve" });
    assert.deepEqual(parseReviewCommand("/approve"), { action: "approve" });
    assert.deepEqual(parseReviewCommand("/GODKÄNN  \nmed en radbrytning efter"), { action: "approve" });
  });

  it("/godkänn med tre belopp (ja med ändringarna)", () => {
    assert.deepEqual(parseReviewCommand("/godkänn 500 1000 2000"), {
      action: "approve",
      amounts: [500, 1000, 2000],
    });
  });

  it("/godkänn med --group (dublettlänkning)", () => {
    assert.deepEqual(parseReviewCommand("/godkänn --group p-2026-0318"), {
      action: "approve",
      group: "p-2026-0318",
    });
    assert.deepEqual(parseReviewCommand("/godkänn 1 2 3 --group p-2026-0001"), {
      action: "approve",
      amounts: [1, 2, 3],
      group: "p-2026-0001",
    });
  });

  it("fel antal belopp ⇒ null (be om förtydligande, gissa aldrig)", () => {
    assert.equal(parseReviewCommand("/godkänn 500 1000"), null);
    assert.equal(parseReviewCommand("/godkänn femhundra"), null);
  });

  it("/avvisa med och utan skäl", () => {
    assert.deepEqual(parseReviewCommand("/avvisa slogan, inget löfte"), {
      action: "reject",
      reason: "slogan, inget löfte",
    });
    assert.deepEqual(parseReviewCommand("/avvisa"), {
      action: "reject",
      reason: "avvisad via review-issue",
    });
  });

  it("icke-kommandon ⇒ null (vanliga kommentarer exekverar aldrig något)", () => {
    assert.equal(parseReviewCommand("ser rimligt ut, tar det imorgon"), null);
    assert.equal(parseReviewCommand("godkänn"), null);
    assert.equal(parseReviewCommand("/publicera"), null);
  });
});

describe("reviewId — stabil nyckel för issue ↔ kö-post", () => {
  const entry = (url: string, title: string): ReviewCandidate =>
    ({ candidate: { title }, failures: [], articleUrl: url, articleTitle: title }) as ReviewCandidate;

  it("deterministiskt och 12 hex-tecken", () => {
    const a = reviewId(entry("https://x.se/a", "Löfte A"));
    assert.match(a, /^[0-9a-f]{12}$/);
    assert.equal(a, reviewId(entry("https://x.se/a", "Löfte A")));
    assert.notEqual(a, reviewId(entry("https://x.se/a", "Löfte B")));
  });

  it("findIndexByReviewId överlever att kön förskjuts", () => {
    const items = [entry("https://x.se/a", "A"), entry("https://x.se/b", "B"), entry("https://x.se/c", "C")];
    const idB = reviewId(items[1]!);
    assert.equal(findIndexByReviewId(items, idB), 1);
    items.splice(0, 1); // posten före tas bort — index förskjuts
    assert.equal(findIndexByReviewId(items, idB), 0);
    assert.equal(findIndexByReviewId(items, "ffffffffffff"), -1);
  });
});
