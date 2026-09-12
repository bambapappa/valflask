import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { lasPubliceringssummor } from "../src/publiceringssummor.ts";

// Verkliga filer behövs: även historisk beräkningskod ska styra den historiska summan.
test("summorna följer data och beräkningskod i respektive commit", () => {
  const dir = mkdtempSync(join(tmpdir(), "publiceringssummor-prov-"));
  const root = resolve(import.meta.dirname, "../..");
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  const commit = () => {
    git("add", "-A");
    git("-c", "user.name=Prov", "-c", "user.email=prov@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Underlag");
    return git("rev-parse", "HEAD").trim();
  };
  try {
    git("init", "-q");
    for (const path of ["site/src/lib/aggregates.ts", "data/promises.json", "data/parties.json"]) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), readFileSync(join(root, path)));
    }
    const fore = commit();
    const original = lasPubliceringssummor(dir, fore);
    assert.ok(original.utgifter > 0);
    assert.ok(original.partier.length > 0);
    const promisesPath = join(dir, "data/promises.json");
    const promises = JSON.parse(readFileSync(promisesPath, "utf8"));
    const p = promises.find((p: any) => p.status !== "tillbakadragen" && !p.group_id &&
      p.cost.period === "per_ar" && p.cost.type === "utgift" && p.cost.msek_base > 0);
    assert.ok(p);
    p.cost.msek_base += 5;
    writeFileSync(promisesPath, JSON.stringify(promises));
    const efter = commit();
    const andrat = lasPubliceringssummor(dir, efter);
    assert.equal(andrat.utgifter - original.utgifter, 20);
    assert.equal(andrat.gap - original.gap, 20);
    assert.equal(andrat.berakningshash, original.berakningshash);
    for (const kod of p.parties) {
      assert.equal(andrat.partier.find((x) => x.kod === kod)!.netto - original.partier.find((x) => x.kod === kod)!.netto, 20);
    }
    const kodfil = join(dir, "site/src/lib/aggregates.ts");
    const kod = readFileSync(kodfil, "utf8");
    assert.ok(kod.includes('? 4 : 1'));
    writeFileSync(kodfil, kod.replaceAll('? 4 : 1', '? 3 : 1'));
    const nyMetod = lasPubliceringssummor(dir, commit());
    assert.notEqual(nyMetod.berakningshash, andrat.berakningshash);
    assert.notEqual(nyMetod.utgifter, andrat.utgifter);
    writeFileSync(kodfil, "Avsiktligt trasig arbetskopia");
    assert.deepEqual(lasPubliceringssummor(dir, fore), original);
    writeFileSync(promisesPath, "[]");
    assert.throws(() => lasPubliceringssummor(dir, commit()), /data saknas/);
    assert.throws(() => lasPubliceringssummor(dir, "main"), /commit/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
