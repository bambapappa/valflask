import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { forenaSokregister, lasForslagsdelta, skrivForslagsdelta } from "../src/forslagsdelta-skrivning.ts";
import type { KoPost } from "../src/granskning.ts";
import type { Sokregister } from "../src/provade.ts";

const source = resolve(import.meta.dirname, "../../data");
const filer = ["kopplingsforslag.json", "provade-par.json"] as const;
const tomtSok: Sokregister = { poster: {} };
const sokpost: Sokregister = { poster: { "p-2026-1912": { senast: "2026-09-22", kandidater: 0 } } };

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
    const ut = skrivForslagsdelta(dir, fore, ko, ko, provade, tomtSok, tomtSok, aktiva(ko));
    assert.equal(ut.andrat, false);
    for (const fil of filer) assert.equal(readFileSync(join(dir, fil), "utf8"), fore[fil]);
    assert.equal(fore["sokta-loften.json"], null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ny köpost och prövat par skrivs tillsammans och gammalt föreläge kan inte återanvändas", () => {
  const dir = kopia();
  try {
    const { fore, ko, provade } = lasForslagsdelta(dir);
    const resultat = nyttResultat(ko);
    const nyttPar = `${ko[0]!.promise_id}::h-syntetiskt-prov`;
    const ut = skrivForslagsdelta(dir, fore, ko, resultat, [...provade, nyttPar], tomtSok, sokpost, aktiva(ko));
    assert.equal(ut.andrat, true);
    assert.equal(ut.koNya, 1);
    assert.equal(lasForslagsdelta(dir).ko.length, ko.length + 1);
    assert.ok(lasForslagsdelta(dir).provade.includes(nyttPar));
    assert.equal(lasForslagsdelta(dir).sokregister.poster["p-2026-1912"]?.kandidater, 0);
    assert.throws(() => skrivForslagsdelta(dir, fore, ko, resultat, [...provade, nyttPar], tomtSok, sokpost, aktiva(ko)), /föreläge/u);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("konkurrerande ändring i någon av tre filer stoppar hela paketet", () => {
  for (const ändrad of [...filer, "sokta-loften.json"] as const) {
    const dir = kopia();
    try {
      const { fore, ko, provade } = lasForslagsdelta(dir);
      const konkurrerande = ändrad === "sokta-loften.json"
        ? JSON.stringify({ poster: { "p-annan": { senast: "2026-09-22", kandidater: 1 } } }) + "\n"
        : readFileSync(join(dir, ändrad), "utf8") + "\n";
      writeFileSync(join(dir, ändrad), konkurrerande);
      assert.throws(() => skrivForslagsdelta(dir, fore, ko, nyttResultat(ko), provade, tomtSok, sokpost, aktiva(ko)), /föreläge/u);
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
    const ut = skrivForslagsdelta(dir, fore, ko, ko, provade, tomtSok, tomtSok, aktiva(ko));
    assert.equal(ut.koNya, 0);
    assert.equal(lasForslagsdelta(dir).ko.length, ko.length - 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("både pushloop och salvage använder ett enda stoppande förslagsdelta", () => {
  const workflow = readFileSync(resolve(import.meta.dirname, "../../../.github/workflows/foreslag.yml"), "utf8");
  assert.equal((workflow.match(/node --import tsx\/esm scripts\/forslagsdelta-uppdatera\.mts \/tmp\/ko-start\.json \/tmp\/ko-resultat\.json \/tmp\/provade-resultat\.json \/tmp\/sok-start\.json \/tmp\/sok-resultat\.json/g) ?? []).length, 2);
  assert.equal((workflow.match(/förslagsdelta kunde inte skrivas — avbryter utan commit/g) ?? []).length, 2);
  assert.equal((workflow.match(/git add data\/sokta-loften\.json/g) ?? []).length, 2);
  assert.equal((workflow.match(/git clean -f -- data\/sokta-loften\.json/g) ?? []).length, 2);
  assert.doesNotMatch(workflow, /scripts\/(?:ko|provade)-uppdatera\.mts/u);
});

test("pushloop och salvage avbryter om Git-förberedelse eller diffkontroll faller", () => {
  const workflow = readFileSync(resolve(import.meta.dirname, "../../../.github/workflows/foreslag.yml"), "utf8");
  const start = workflow.indexOf("push_delta() {");
  const salvage = workflow.indexOf("name: Committa kön (slutlig salvage av sista löftet)", start);
  assert.ok(start >= 0);
  assert.ok(salvage > start);
  const delar = [workflow.slice(start, salvage), workflow.slice(salvage)];
  for (const del of delar) {
    assert.match(del, /git reset --hard "origin\/\$DEFAULT_BRANCH" \|\| (?:return|exit) 1/u);
    assert.match(del, /git clean -f -- data\/sokta-loften\.json \|\| (?:return|exit) 1/u);
    assert.match(del, /git add data\/kopplingsforslag\.json data\/provade-par\.json \|\| (?:return|exit) 1/u);
    assert.match(del, /git add data\/sokta-loften\.json \|\| (?:return|exit) 1/u);
    assert.match(del, /if \[ "\$diff_rc" -ne 1 \]; then.*(?:return|exit) 1/u);
    assert.match(del, /git commit -m "data: förslagskörning via workflow(?: \(löpande\))?" \|\| (?:return|exit) 1/u);
  }
});

test("färskare sökmätning bevaras när samma post ändrats efter körningens start", () => {
  const start: Sokregister = { poster: { "p-x": { senast: "2026-09-21", kandidater: 1 } } };
  const resultat: Sokregister = { poster: {
    "p-x": { senast: "2026-09-22", kandidater: 2 },
    "p-y": { senast: "2026-09-22", kandidater: 0 },
  } };
  const farsk: Sokregister = { poster: { "p-x": { senast: "2026-09-22", kandidater: 3 } } };
  assert.deepEqual(forenaSokregister(farsk, start, resultat), { poster: {
    "p-x": { senast: "2026-09-22", kandidater: 3 },
    "p-y": { senast: "2026-09-22", kandidater: 0 },
  } });
});
