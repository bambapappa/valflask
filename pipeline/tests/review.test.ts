import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseReviewCommand,
  reviewId,
  findIndexByReviewId,
  approve,
  type ReviewCandidate,
} from "../src/review.ts";
import { computeDataHash } from "../src/publish.ts";

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

describe("approve — synkar changelog + data_hash vid godkännande", () => {
  const pub = {
    id: "p-2026-0001", group_id: null, title: "Befintligt", slug: "befintligt",
    parties: ["s"], person: null, quote: "q", date_stated: "2026-01-01",
    source: { url: "https://x.se", domain: "x.se", archive_url: null, fetched_at: "2026-01-01T00:00:00Z" },
    category: "övrigt",
    cost: { type: "utgift", period: "per_ar", msek_low: 1, msek_base: 2, msek_high: 3, basis: "media", basis_url: null, method_note: "", confidence: 0.9 },
    financing_claimed: { described: false, summary: null, msek: null },
    comparisons: [], quip: null, status: "aktiv", history: [],
    extraction: { model: "x", verified_by: "y", run_id: "r" },
  };
  const queueItem: ReviewCandidate = {
    candidate: { title: "Nytt löfte", parties: ["m"], quote: "Vi vill X.", category: "skatter", person: null, amount_in_text_msek: null },
    failures: [], articleUrl: "https://y.se/a", articleTitle: "A",
    cost: { type: "utgift", period: "per_ar", msek_low: 100, msek_base: 200, msek_high: 300, basis: "llm_estimat", basis_url: null, method_note: "note", confidence: 0.5 },
  };

  it("appendar en changelog-post vars data_hash matchar de faktiska löftena", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-approve-"));
    try {
      writeFileSync(join(dir, "promises.json"), JSON.stringify([pub]));
      writeFileSync(join(dir, "needs_review.json"), JSON.stringify([queueItem]));
      writeFileSync(join(dir, "changelog.json"), JSON.stringify([
        { run_id: "seed", added: [], updated: [], retracted: [], data_hash: "old", timestamp: "2026-01-01T00:00:00Z" },
      ]));

      const res = approve(["0"], dir);

      const promises = JSON.parse(readFileSync(join(dir, "promises.json"), "utf8"));
      const queueAfter = JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8"));
      const changelog = JSON.parse(readFileSync(join(dir, "changelog.json"), "utf8"));
      const last = changelog[changelog.length - 1];

      assert.equal(promises.length, 2, "nytt löfte publicerat");
      assert.equal(queueAfter.length, 0, "kö-posten borttagen");
      assert.equal(changelog.length, 2, "changelog appenderad, ej överskriven");
      assert.deepEqual(last.added, [res.id]);
      assert.deepEqual(last.updated, []);
      assert.deepEqual(last.retracted, []);
      assert.equal(last.data_hash, computeDataHash(promises), "hashen matchar promises.json");
      assert.match(last.run_id, /^review-p-2026-\d{4}$/);
      assert.ok(last.timestamp, "timestamp satt (matar 'senast uppdaterad')");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
