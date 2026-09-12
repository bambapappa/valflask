import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { approve, type ReviewCandidate } from "../src/review.ts";
import { kanon, konyckel } from "../src/provningar.ts";
import { kanoniskJson } from "../src/underlagsversion.ts";
import { provatBeslutsunderlag } from "./fixtures/provat-beslutsunderlag.ts";

const data = join(import.meta.dirname, "../../data");
const files = ["promises.json", "needs_review.json", "changelog.json", "provningar.json"];
const ko: ReviewCandidate[] = JSON.parse(readFileSync(join(data, "needs_review.json"), "utf8"));
const item = ko.find((p) => p.candidate?.quote && p.cost?.calculation && p.cost.calculation.length <= 800)!;
assert.ok(item);
const loften = JSON.parse(readFileSync(join(data, "promises.json"), "utf8"));
const target = loften.find((p: { group_id: string | null; status: string }) => !p.group_id && p.status === "aktiv");
assert.ok(target);
const args = ["0", "--group", target.id];

function badda() {
  const dir = mkdtempSync(join(tmpdir(), "beslutsunderlag-"));
  writeFileSync(join(dir, "promises.json"), JSON.stringify(loften));
  writeFileSync(join(dir, "needs_review.json"), JSON.stringify([item]));
  writeFileSync(join(dir, "changelog.json"), "[]");
  const underlag = provatBeslutsunderlag(args, dir);
  writeFileSync(join(dir, "provningar.json"), JSON.stringify({ poster: [{
    id: konyckel(item.articleUrl, item.candidate.quote), slag: "lofte", datum: "2026-09-12", utfall: "haller",
    underlag_hash: kanon("lofte", underlag.forslag.nyttLofte as unknown as Record<string, unknown>),
  }] }));
  return { dir, underlag };
}

it("ett giltigt äldre index räcker inte för att skriva ett nytt löfte", () => {
  const { dir } = badda();
  try {
    const before = files.map((f) => readFileSync(join(dir, f)));
    assert.throws(() => approve(args, dir), /äldre prövningsindex räcker inte/);
    files.forEach((f, i) => assert.deepEqual(readFileSync(join(dir, f)), before[i], f));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("ändrad prövning, ändrat referensmaterial och oavgjort stoppar före skrivning", () => {
  const { dir, underlag } = badda();
  try {
    const before = files.map((f) => readFileSync(join(dir, f)));
    const changed = structuredClone(underlag);
    changed.provning.bedomningar[0]!.motivering += " Ändrad.";
    assert.throws(() => approve(args, dir, changed), /prövningshash/);
    assert.throws(() => approve([...args, "--calc", "Ändrad beräkningsgrund."], dir, underlag), /argument eller underlag/);
    const ref = structuredClone(underlag);
    ref.aktuellaReferenser[0]!.innehall += " Ändrat.";
    assert.throws(() => approve(args, dir, ref), /annat underlag/);
    const open = structuredClone(underlag);
    open.provning.bedomningar[0]!.utfall = "oavgjort";
    open.provningshash = createHash("sha256").update(kanoniskJson(open.provning)).digest("hex");
    assert.throws(() => approve(args, dir, open), /oavgjort/);
    files.forEach((f, i) => assert.deepEqual(readFileSync(join(dir, f)), before[i], f));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("godkännandet skriver exakt den tidigare sparade slutformen trots senare klockslag", (t) => {
  const { dir, underlag } = badda();
  try {
    const saved = JSON.parse(JSON.stringify(underlag));
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-20T12:00:00Z") });
    approve(args, dir, saved);
    const after = JSON.parse(readFileSync(join(dir, "promises.json"), "utf8"));
    assert.deepEqual(after.find((p: { id: string }) => p.id === saved.forslag.nyttLofte.id), saved.forslag.nyttLofte);
    assert.deepEqual(after.find((p: { id: string }) => p.id === target.id), saved.forslag.gruppandring);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8")), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
