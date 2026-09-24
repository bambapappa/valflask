import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, symlinkSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { sammanfogaKostnadOmkorning } from "../src/kostnad-omkorning-sammanfogning.ts";
import { lasFillage, skapaFilpaket, skrivFilpaket } from "../src/datatransaktion.ts";

const post = (title: string) => ({ articleUrl: `https://example.org/${title}`, candidate: { title }, cost: null as unknown, costReason: "gammal" });

test("omkörning flyttar bara ändrad kostnad och bevarar färska köbeslut", () => {
  const bas = [post("a"), post("b")];
  const resultat = structuredClone(bas);
  resultat[0]!.cost = { msek_base: 100 };
  resultat[0]!.costReason = "ny uträkning";
  const aktuell = [post("b"), post("c"), post("a")];
  aktuell[0]!.costReason = "nytt beslut";
  const ut = sammanfogaKostnadOmkorning(bas, resultat, aktuell);
  assert.equal(ut[0]!.costReason, "nytt beslut");
  assert.equal(ut[1]!.candidate.title, "c");
  assert.deepEqual(ut[2], resultat[0]);
});

test("ändrad, borttagen eller dubblerad målpost stoppar överföring", () => {
  const bas = [post("a"), post("b")];
  const resultat = structuredClone(bas);
  resultat[0]!.cost = { msek_base: 100 };
  const andrad = structuredClone(bas);
  andrad[0]!.costReason = "ändrat på main";
  assert.throws(() => sammanfogaKostnadOmkorning(bas, resultat, andrad), /ändrats på main/u);
  assert.throws(() => sammanfogaKostnadOmkorning(bas, resultat, [post("b")]), /ändrats på main/u);
  assert.throws(() => sammanfogaKostnadOmkorning(bas, resultat, [post("a"), post("a")]), /dubbelt kö-id/u);
});

test("resultatet får bara ändra kostnad och får inte ta bort andra köposter", () => {
  const bas = [post("a"), post("b")];
  const fel = structuredClone(bas);
  fel[0]!.candidate.title = "annan kandidat";
  assert.throws(() => sammanfogaKostnadOmkorning(bas, fel, bas), /lagt till eller tagit bort/u);
  const annanAndring = structuredClone(bas) as Array<typeof bas[number] & { articleTitle?: string }>;
  annanAndring[0]!.articleTitle = "annan rubrik";
  assert.throws(() => sammanfogaKostnadOmkorning(bas, annanAndring, bas), /annat än kostnad/u);
  assert.throws(() => sammanfogaKostnadOmkorning(bas, [post("a")], bas), /lagt till eller tagit bort/u);
});

test("checkpoint vägrar ändrat föreläge och bevarar senaste lyckade post", () => {
  const dir = mkdtempSync(join(tmpdir(), "kostnad-checkpoint-"));
  try {
    const fil = join(dir, "needs_review.json");
    writeFileSync(fil, JSON.stringify([post("a")]) + "\n");
    const fore = lasFillage(dir, ["needs_review.json"]);
    const efter = { "needs_review.json": JSON.stringify([post("a"), post("b")]) + "\n" };
    skrivFilpaket(dir, skapaFilpaket(fore, efter));
    assert.equal(readFileSync(fil, "utf8"), efter["needs_review.json"]);
    assert.throws(() => skrivFilpaket(dir, skapaFilpaket(fore, { "needs_review.json": "[]\n" })), /föreläge/u);
    assert.equal(readFileSync(fil, "utf8"), efter["needs_review.json"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("workflowen bevarar färsk main och använder radvis sammanfogning", () => {
  const workflow = readFileSync(resolve(import.meta.dirname, "../../.github/workflows/kostnad-omkorning.yml"), "utf8");
  assert.match(workflow, /cp data\/needs_review\.json \/tmp\/needs_review-fore\.json/u);
  assert.match(workflow, /kostnad-omkorning-sammanfoga\.mts/u);
  assert.match(workflow, /\[ -d data\/\.datatransaktion \]/u);
  assert.doesNotMatch(workflow, /cp \/tmp\/needs_review\.json data\/needs_review\.json/u);
});

test("stubomkörning checkpointar en post i isolerad kö", () => {
  const root = mkdtempSync(join(tmpdir(), "kostnad-om-"));
  try {
    const pipeline = resolve(import.meta.dirname, "..");
    const scripts = join(root, "pipeline", "scripts");
    const data = join(root, "data");
    mkdirSync(scripts, { recursive: true });
    mkdirSync(data);
    copyFileSync(join(pipeline, "scripts", "kostnad-omkorning.mts"), join(scripts, "kostnad-omkorning.mts"));
    symlinkSync(join(pipeline, "src"), join(root, "pipeline", "src"), "dir");
    symlinkSync(resolve(pipeline, "../site"), join(root, "site"), "dir");
    const ko = [{ articleUrl: "https://example.org/a", articleTitle: "Ett löfte", candidate: {
      title: "Bygga fler bostäder", parties: ["m"], quote: "Vi vill bygga fler bostäder.",
      category: "bostader", amount_in_text_msek: null, financing_mentioned: false,
    }, failures: [], cost: null }];
    writeFileSync(join(data, "needs_review.json"), JSON.stringify(ko, null, 2) + "\n");
    const run = spawnSync(process.execPath, ["--import", "tsx/esm", join(scripts, "kostnad-omkorning.mts"), "--stub", "--skriv", "--max=1"], {
      cwd: pipeline, encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    const efter = JSON.parse(readFileSync(join(data, "needs_review.json"), "utf8"));
    assert.equal(typeof efter[0].cost.calculation, "string");
    assert.equal(efter[0].cost.basis, "llm_estimat");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
