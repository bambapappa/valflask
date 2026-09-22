import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { lasForslagsdelta, skrivForslagsdelta } from "../src/forslagsdelta-skrivning.ts";
import type { KoPost } from "../src/granskning.ts";

const source = resolve(import.meta.dirname, "../../data");
const filer = ["kopplingsforslag.json", "provade-par.json"] as const;

function kopia(): string {
  const dir = mkdtempSync(join(tmpdir(), "forslagsdelta-"));
  for (const fil of filer) copyFileSync(join(source, fil), join(dir, fil));
  return dir;
}

function aktiva(ko: KoPost[]): Set<string> {
  return new Set(ko.flatMap((p) => p.promise_id ? [p.promise_id] : []));
}

function nyttResultat(ko: KoPost[]): KoPost[] {
  assert.ok(ko.length > 0);
  return [...ko, { ...ko[0]!, handling_id: "h-syntetiskt-prov" }];
}

test("tomt delta lämnar båda verkliga filkopior byteidentiska", () => {
  const dir = kopia();
  try {
    const { fore, ko, provade } = lasForslagsdelta(dir);
    const ut = skrivForslagsdelta(dir, fore, ko, ko, provade, aktiva(ko));
    assert.equal(ut.andrat, false);
    for (const fil of filer) assert.equal(readFileSync(join(dir, fil), "utf8"), fore[fil]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ny köpost och prövat par skrivs tillsammans och gammalt föreläge kan inte återanvändas", () => {
  const dir = kopia();
  try {
    const { fore, ko, provade } = lasForslagsdelta(dir);
    const resultat = nyttResultat(ko);
    const nyttPar = `${ko[0]!.promise_id}::h-syntetiskt-prov`;
    const ut = skrivForslagsdelta(dir, fore, ko, resultat, [...provade, nyttPar], aktiva(ko));
    assert.equal(ut.andrat, true);
    assert.equal(ut.koNya, 1);
    assert.equal(lasForslagsdelta(dir).ko.length, ko.length + 1);
    assert.ok(lasForslagsdelta(dir).provade.includes(nyttPar));
    assert.throws(() => skrivForslagsdelta(dir, fore, ko, resultat, [...provade, nyttPar], aktiva(ko)), /föreläge/u);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("konkurrerande ändring i endera filen stoppar hela paketet", () => {
  for (const ändrad of filer) {
    const dir = kopia();
    try {
      const { fore, ko, provade } = lasForslagsdelta(dir);
      const konkurrerande = readFileSync(join(dir, ändrad), "utf8") + "\n";
      writeFileSync(join(dir, ändrad), konkurrerande);
      assert.throws(() => skrivForslagsdelta(dir, fore, ko, nyttResultat(ko), provade, aktiva(ko)), /föreläge/u);
      assert.equal(readFileSync(join(dir, ändrad), "utf8"), konkurrerande);
      const andra = filer.find((fil) => fil !== ändrad)!;
      assert.equal(readFileSync(join(dir, andra), "utf8"), fore[andra]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("en redan avgjord köpost återuppstår inte ur körningens gamla resultat", () => {
  const dir = kopia();
  try {
    const { ko, provade } = lasForslagsdelta(dir);
    assert.ok(ko.length > 0);
    writeFileSync(join(dir, filer[0]), JSON.stringify(ko.slice(1), null, 2) + "\n");
    const { fore } = lasForslagsdelta(dir);
    const ut = skrivForslagsdelta(dir, fore, ko, ko, provade, aktiva(ko));
    assert.equal(ut.koNya, 0);
    assert.equal(lasForslagsdelta(dir).ko.length, ko.length - 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("både pushloop och salvage använder ett enda stoppande förslagsdelta", () => {
  const workflow = readFileSync(resolve(import.meta.dirname, "../../../.github/workflows/foreslag.yml"), "utf8");
  assert.equal((workflow.match(/node --import tsx\/esm scripts\/forslagsdelta-uppdatera\.mts/g) ?? []).length, 2);
  assert.equal((workflow.match(/förslagsdelta kunde inte skrivas — avbryter utan commit/g) ?? []).length, 2);
  assert.doesNotMatch(workflow, /scripts\/(?:ko|provade)-uppdatera\.mts/u);
});
