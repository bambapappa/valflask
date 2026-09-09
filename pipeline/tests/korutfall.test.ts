import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";
import { korutfall, sammanfattaKorning, type Kormatning } from "../src/korutfall.ts";
import { koraPipeline } from "../src/cli-run.ts";
import { runPipeline, type PipelineContext } from "../src/index.ts";
import { MemorySource } from "../src/fetch.ts";
import { mockArchive } from "../src/archive.ts";
import type { PipelinePromise } from "../src/publish.ts";

const repo = join(import.meta.dirname, "../..");
const promises = JSON.parse(readFileSync(join(repo, "data/promises.json"), "utf8")) as PipelinePromise[];
const p = promises.find((x) => x.status === "aktiv")!;
assert.ok(p?.quote && p.source.url, "provet behöver verkligt publicerat underlag");

async function medKorning(action: (ctx: PipelineContext, root: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "korutfall-"));
  const data = join(root, "data");
  mkdirSync(data);
  writeFileSync(join(data, "promises.json"), JSON.stringify([p]));
  const ctx: PipelineContext = {
    now: new Date("2026-09-08T12:00:00Z"), runId: "utfallsprov", dataDir: data, outputDir: data,
    llm: { complete: async () => '{"promises":[]}' },
    articleSource: new MemorySource([{
      url: p.source.url, title: p.title, text: p.quote, domain: new URL(p.source.url).hostname,
      published: "2026-09-08T00:00:00Z", feedType: "page",
    }]),
    mode: "review", allowlist: [], archiveFn: mockArchive,
    models: { extract: "extract", verify: "verify", copy: "copy", kostnad: "cost" },
  };
  try { await action(ctx, root); } finally { rmSync(root, { recursive: true }); }
}

test("leverantörsfel fäller den verkliga körvägen trots befintliga publicerade löften", async () => {
  await medKorning(async (ctx, root) => {
    ctx.llm = { complete: async () => { throw new Error("leverantören svarar inte"); } };
    await assert.rejects(koraPipeline(ctx), /1 av 1 artiklar misslyckades/u);
    const report = JSON.parse(readFileSync(join(root, ".report/utfallsprov.json"), "utf8"));
    assert.equal(report.outcome, "misslyckad");
    assert.equal(report.publishedTotal, 1);
    assert.equal(report.publishedAdded, 0);
    assert.equal(report.attempted, 1);
    assert.equal(report.failed, 1);
    assert.equal(report.succeeded, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(ctx.dataDir, "seen.json"), "utf8")), {});
    assert.equal(JSON.parse(readFileSync(join(ctx.dataDir, "promises.json"), "utf8")).length, 1);
  });
});

test("lyckad tolkning utan nya löften är grön och skiljs från gammalt bestånd", async () => {
  await medKorning(async (ctx) => {
    const r = await runPipeline(ctx);
    assert.equal(korutfall(r.runStats), "klar");
    assert.equal(r.runStats.attempted, 1);
    assert.equal(r.runStats.succeeded, 1);
    assert.equal(r.runStats.reviewCandidates, 0);
    assert.match(sammanfattaKorning(r.runStats), /0 nya publicerade löften/u);
    assert.match(sammanfattaKorning(r.runStats), /Bestånd: 1 löften/u);
    const again = await runPipeline(ctx);
    assert.equal(again.runStats.unseen, 0);
    assert.equal(again.runStats.attempted, 0);
    assert.equal(korutfall(again.runStats), "klar");
  });
});

test("ett delvis misslyckat pass bevarar lyckad artikel och lämnar felad osedd", async () => {
  await medKorning(async (ctx) => {
    const articles = await ctx.articleSource.fetch();
    const original = articles[0]!;
    const badUrl = original.url + "?utfallsprov=fel";
    ctx.articleSource = new MemorySource([original, { ...original, url: badUrl }]);
    ctx.llm = { complete: async (prompt) => {
      if (prompt.includes(badUrl)) throw new Error("tillfälligt fel");
      return '{"promises":[]}';
    } };
    const r = await runPipeline(ctx);
    assert.equal(korutfall(r.runStats), "delvis");
    assert.equal(r.runStats.attempted, 2);
    assert.equal(r.runStats.succeeded, 1);
    assert.equal(r.runStats.failed, 1);
    assert.deepEqual(Object.values(JSON.parse(readFileSync(join(ctx.dataDir, "seen.json"), "utf8"))), [original.url]);
    assert.equal(Object.values(r.runStats.bySource)[0]!.failed, 1);
  });
});

test("tom eller självmotsägande mätning får inte bli ett lyckat pass", () => {
  assert.throws(() => korutfall({} as Kormatning), /Ogiltig/u);
  assert.throws(() => korutfall({ fetched: 1, unseen: 1, attempted: 1, succeeded: 1, failed: 1 } as Kormatning), /går inte ihop/u);
});

test("köbeståndet mäter sparad verklig kö efter rensning även utan nya kandidater", async () => {
  await medKorning(async (ctx, root) => {
    const queue = JSON.parse(readFileSync(join(repo, "data/needs_review.json"), "utf8"));
    const pending = queue.find((r: any) => r.articleUrl !== p.source.url && r.candidate?.quote);
    assert.ok(pending, "provet behöver en verklig väntande post");
    const published = { candidate: { title: p.title, quote: p.quote }, failures: [],
      articleUrl: p.source.url, articleTitle: p.title };
    writeFileSync(join(ctx.dataDir, "needs_review.json"), JSON.stringify([pending, published]));
    const result = await runPipeline(ctx);
    const saved = JSON.parse(readFileSync(join(ctx.dataDir, "needs_review.json"), "utf8"));
    assert.deepEqual(saved, [pending]);
    assert.equal(result.runStats.reviewCandidates, 0);
    assert.equal(result.runStats.queuedTotal, saved.length);
    const report = JSON.parse(readFileSync(join(root, ".report/utfallsprov.json"), "utf8"));
    assert.equal(report.queuedTotal, saved.length);
  });
});

test("arbetsflödet döljer inte processfel och sparar rapporten även när körningen faller", () => {
  const text = readFileSync(join(repo, ".github/workflows/pipeline.yml"), "utf8");
  function kontrollera(raw: string) {
    const doc = parse(raw);
    const steps = doc?.jobs?.run?.steps;
    assert.ok(Array.isArray(steps) && steps.length > 0);
    const run = steps.find((s: any) => s.run === "pnpm pipeline:run");
    assert.ok(run);
    assert.notEqual(run["continue-on-error"], true);
    const artifact = steps.find((s: any) => s.with?.name === "run-report");
    assert.ok(artifact);
    assert.match(artifact.if, /!cancelled\(\)/u);
    assert.equal(artifact.with["include-hidden-files"], true);
    assert.deepEqual(artifact.with.path.trim().split("\n"), [
      ".report/*.json", "data/needs_review.json", "data/stances_review.json", "data/seen.json",
    ]);
  }
  kontrollera(text);
  assert.throws(() => kontrollera(""));
  const broken = text.replace('if: ${{ !cancelled() }}', 'if: ${{ success() }}');
  assert.notEqual(broken, text);
  assert.throws(() => kontrollera(broken));
  const hidden = text.replace("include-hidden-files: true", "include-hidden-files: false");
  assert.notEqual(hidden, text);
  assert.throws(() => kontrollera(hidden));
  const broad = text.replace(".report/*.json", ".report/");
  assert.notEqual(broad, text);
  assert.throws(() => kontrollera(broad));
});
