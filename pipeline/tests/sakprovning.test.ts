import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { type ReviewCandidate } from "../src/review.ts";
import { forberedLoftesforslag, type PromiseEntry } from "../src/loftesforslag.ts";
import { byggSakunderlag, skapaSakprovning, sakprovningsBeredskap } from "../src/sakprovning.ts";

const data = join(import.meta.dirname, "../../data");
const loften: PromiseEntry[] = JSON.parse(readFileSync(join(data, "promises.json"), "utf8"));
const ko: ReviewCandidate[] = JSON.parse(readFileSync(join(data, "needs_review.json"), "utf8"));
const index = ko.findIndex((p) => p.candidate?.quote && p.cost?.calculation && p.cost.calculation.length <= 800);
assert.ok(index >= 0);
const item = ko[index]!;
const target = loften.find((p) => p.status === "aktiv" && p.group_id === null)!;
assert.ok(target);
const forslag = forberedLoftesforslag(item, item.cost!, loften, target.id, new Date("2026-09-12T12:00:00Z"));
// Formatprov: den sparade citattexten är inte ett nytt uppslag eller ett sakfacit.
const material = [
  { id: "citat", slag: "kalla" as const, adress: item.articleUrl, innehall: item.candidate.quote! },
  { id: "metod", slag: "regel" as const, adress: "CLAUDE.md", innehall: readFileSync(join(data, "../CLAUDE.md"), "utf8") },
];
const underlag = byggSakunderlag(forslag, loften, item, material);

it("utkast binder slutform och gruppberoende men avstår i varje moment", () => {
  const provning = skapaSakprovning(underlag);
  assert.ok(provning.underlag.poster.poster.some((p) => p.id === target.id));
  assert.ok(provning.underlag.poster.poster.some((p) => p.id === forslag.nyttLofte.id));
  assert.ok(provning.bedomningar.length > 0);
  assert.ok(provning.bedomningar.every((p) => p.utfall === "oavgjort" && p.belagg.length === 0));
  assert.equal(sakprovningsBeredskap(provning, underlag).klar, false);
  assert.equal(provning.bedomare, null);
});

it("saknat material, ändrad regel och ändrat förslag ger inte beredskap", () => {
  const tomt = byggSakunderlag(forslag, loften, item, []);
  assert.equal(sakprovningsBeredskap(skapaSakprovning(tomt), tomt).klar, false);
  const gammal = skapaSakprovning(underlag);
  const nytt = byggSakunderlag(forslag, loften, item, material.map((r) => ({ ...r, innehall: r.innehall + " Ändrat." })));
  assert.equal(sakprovningsBeredskap(gammal, nytt).klar, false);
  const korrupt = structuredClone(underlag);
  korrupt.forslag.nyttLofte.category = "ändrad";
  assert.throws(() => skapaSakprovning(korrupt), /ändrat eller ogiltigt/);
});

it("varje moment kräver separat resultat, motivering och kända referenser", () => {
  const formatprov = skapaSakprovning(underlag);
  formatprov.bedomare = "formatprov, ingen faktisk bedömning";
  for (const b of formatprov.bedomningar) {
    b.utfall = "styrkt";
    b.motivering = "Test av struktur, inget sakfacit.";
    b.belagg = ["citat", "metod"];
  }
  assert.equal(sakprovningsBeredskap(formatprov, underlag).klar, true, "bara strukturell beredskap");
  const andradRegel = byggSakunderlag(forslag, loften, item, material.map((r) => ({ ...r, innehall: r.innehall + " Ändrat." })));
  assert.equal(sakprovningsBeredskap(formatprov, andradRegel).klar, false, "ett färdigt format får inte återanvändas efter regeländring");
  for (const utfall of ["oavgjort", "motsagt"] as const) {
    const changed = structuredClone(formatprov);
    changed.bedomningar[0]!.utfall = utfall;
    assert.equal(sakprovningsBeredskap(changed, underlag).klar, false);
  }
  const unknownRef = structuredClone(formatprov);
  unknownRef.bedomningar[0]!.belagg = ["okänd"];
  assert.equal(sakprovningsBeredskap(unknownRef, underlag).klar, false);
  const duplicate = structuredClone(formatprov);
  duplicate.bedomningar[0] = duplicate.bedomningar[1]!;
  assert.equal(sakprovningsBeredskap(duplicate, underlag).klar, false);
  assert.equal(sakprovningsBeredskap({ ...formatprov, humanApproved: true } as never, underlag).klar, false);
  assert.equal(sakprovningsBeredskap({} as never, underlag).klar, false);
});

it("kommandot skapar bara utkast och lämnar ingen fil när referensmaterialet är trasigt", () => {
  const dir = mkdtempSync(join(tmpdir(), "sakprovning-"));
  const before = readFileSync(join(data, "provningar.json"));
  try {
    const proposalFile = join(dir, "forslag.json"), refsFile = join(dir, "referenser.json"), out = join(dir, "utkast.json");
    writeFileSync(proposalFile, JSON.stringify(forslag));
    writeFileSync(refsFile, JSON.stringify(material));
    const run = () => spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/sakprovning-forbered.mts", proposalFile, refsFile, out], { encoding: "utf8" });
    const result = run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const saved = JSON.parse(readFileSync(out, "utf8"));
    assert.deepEqual(saved, skapaSakprovning(underlag));
    assert.equal(sakprovningsBeredskap(saved, underlag).klar, false);
    assert.notEqual(run().status, 0, "tidigare utkast skrivs inte över");
    rmSync(out);
    writeFileSync(refsFile, JSON.stringify([{ ...material[0], innehall: "" }]));
    assert.notEqual(run().status, 0);
    assert.equal(existsSync(out), false);
    assert.deepEqual(readFileSync(join(data, "provningar.json")), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
