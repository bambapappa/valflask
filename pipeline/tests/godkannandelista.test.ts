import { spawnSync } from "node:child_process";
import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approve, reviewId, type ReviewCandidate } from "../src/review.ts";
import { kanon, konyckel } from "../src/provningar.ts";
import { provatBeslutsunderlag } from "./fixtures/provat-beslutsunderlag.ts";
import { forprovaGodkannandelista, kontrolleraListansForelage, type Listgodkannande } from "../src/godkannandelista.ts";
const data = join(import.meta.dirname, "../../data");
const loften = JSON.parse(readFileSync(join(data, "promises.json"), "utf8"));
const ko: ReviewCandidate[] = JSON.parse(readFileSync(join(data, "needs_review.json"), "utf8"));
const items = ko.filter((p) => p.candidate?.quote && p.cost?.calculation && p.cost.calculation.length <= 800).slice(0, 2);
assert.equal(items.length, 2);
const target = loften.find((p: { status: string; group_id: string | null }) => p.status === "aktiv" && !p.group_id);
assert.ok(target);
const files = ["promises.json", "needs_review.json", "changelog.json", "provningar.json"];
function init(dir: string) {
  writeFileSync(join(dir, "promises.json"), JSON.stringify(loften));
  writeFileSync(join(dir, "needs_review.json"), JSON.stringify(items));
  writeFileSync(join(dir, "changelog.json"), "[]");
}
function rad(dir: string, i: number): Listgodkannande {
  const args = [reviewId(items[i]!), "--group", target.id];
  const underlag = provatBeslutsunderlag(args, dir);
  return { args, underlag, provningshash: underlag.provningshash };
}
function index(dir: string, rader: Listgodkannande[]) {
  writeFileSync(join(dir, "provningar.json"), JSON.stringify({ poster: rader.map((r) => {
    const p = r.underlag.forslag.nyttLofte;
    return { id: konyckel(p.source.url, p.quote), slag: "lofte", datum: "2026-09-13", utfall: "haller", underlag_hash: kanon("lofte", p as unknown as Record<string, unknown>) };
  }) }));
}

it("hela ordningen förprövas utan originalskrivning och ändrat föreläge stoppas", () => {
  const dir = mkdtempSync(join(tmpdir(), "listprov-"));
  try {
    init(dir);
    const first = rad(dir, 0);
    index(dir, [first]);
    // Förbered nästa förslag mot föregående efterläge i enbart testkatalogen.
    approve(first.args, dir, first.underlag, first.provningshash);
    const second = rad(dir, 1);
    init(dir);
    index(dir, [first, second]);
    const before = files.map((f) => readFileSync(join(dir, f)));
    const hash = forprovaGodkannandelista([first, second], dir);
    kontrolleraListansForelage(dir, hash);
    files.forEach((f, i) => assert.deepEqual(readFileSync(join(dir, f)), before[i], f));
    writeFileSync(join(dir, "needs_review.json"), "[]");
    assert.throws(() => kontrolleraListansForelage(dir, hash), /ändrades/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("två förslag mot samma gamla bestånd stoppas före någon originalskrivning", () => {
  const dir = mkdtempSync(join(tmpdir(), "listprov-konflikt-"));
  try {
    init(dir);
    const rader = [rad(dir, 0), rad(dir, 1)];
    index(dir, rader);
    const before = files.map((f) => readFileSync(join(dir, f)));
    assert.throws(() => forprovaGodkannandelista(rader, dir), /rad 2/);
    files.forEach((f, i) => assert.deepEqual(readFileSync(join(dir, f)), before[i], f));
    assert.throws(() => forprovaGodkannandelista([], dir), /tom/);
    assert.throws(() => forprovaGodkannandelista([{ ...rader[0]!, provningshash: "" }], dir), /saknar/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


it("listkommandot torrkör och skriver bara med komplett beslutsunderlag", () => {
  const root = mkdtempSync(join(tmpdir(), "listkommando-"));
  const dir = join(root, "data"), pipeline = join(root, "pipeline");
  try {
    mkdirSync(dir);
    mkdirSync(join(pipeline, "scripts"), { recursive: true });
    cpSync(join(import.meta.dirname, "../schemas"), join(pipeline, "schemas"), { recursive: true });
    cpSync(join(import.meta.dirname, "../package.json"), join(pipeline, "package.json"));
    cpSync(join(import.meta.dirname, "../src"), join(pipeline, "src"), { recursive: true });
    cpSync(join(import.meta.dirname, "../scripts/godkann-lista.mts"), join(pipeline, "scripts/godkann-lista.mts"));
    symlinkSync(join(import.meta.dirname, "../node_modules"), join(pipeline, "node_modules"), "dir");
    init(dir);
    const first = rad(dir, 0);
    index(dir, [first]);
    writeFileSync(join(root, "underlag.json"), JSON.stringify(first.underlag));
    const list = join(root, "lista.json");
    const row = { id: first.args[0], group: target.id, underlagsfil: "underlag.json", provningshash: first.provningshash };
    writeFileSync(list, JSON.stringify([row]));
    const run = (skriv = false) => spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/godkann-lista.mts", list, ...(skriv ? ["--skriv"] : [])], { cwd: pipeline, encoding: "utf8" });
    const before = files.map((f) => readFileSync(join(dir, f)));
    const dry = run();
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    files.forEach((f, i) => assert.deepEqual(readFileSync(join(dir, f)), before[i], f));
    writeFileSync(list, JSON.stringify([{ ...row, provningshash: "0".repeat(64) }]));
    assert.notEqual(run(true).status, 0);
    files.forEach((f, i) => assert.deepEqual(readFileSync(join(dir, f)), before[i], f));
    writeFileSync(list, JSON.stringify([row]));
    const applied = run(true);
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
    const after = JSON.parse(readFileSync(join(dir, "promises.json"), "utf8"));
    assert.deepEqual(after.find((p: { id: string }) => p.id === first.underlag.forslag.nyttLofte.id), first.underlag.forslag.nyttLofte);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
