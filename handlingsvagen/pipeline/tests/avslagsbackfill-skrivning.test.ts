import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { lasAvslagsbackfill, skrivAvslagsbackfill } from "../src/avslagsbackfill-skrivning.ts";

const source = resolve(import.meta.dirname, "../../data");

function kopia(): string {
  const dir = mkdtempSync(join(tmpdir(), "avslagsbackfill-"));
  for (const fil of ["kopplingar.json", "handlingar.json"]) copyFileSync(join(source, fil), join(dir, fil));
  return dir;
}

test("avslagsbackfill binder både verkliga kopplingar och handlingar före skrivning", () => {
  for (const andrad of ["kopplingar.json", "handlingar.json"]) {
    const dir = kopia();
    try {
      const { fore, kopplingar } = lasAvslagsbackfill(dir);
      assert.ok(kopplingar.length > 0);
      const konkurrerande = readFileSync(join(dir, andrad), "utf8") + "\n";
      writeFileSync(join(dir, andrad), konkurrerande);
      assert.throws(() => skrivAvslagsbackfill(dir, fore, kopplingar), /föreläge/u);
      assert.equal(readFileSync(join(dir, andrad), "utf8"), konkurrerande);
      assert.equal(readFileSync(join(dir, andrad === "kopplingar.json" ? "handlingar.json" : "kopplingar.json"), "utf8"),
        fore[andrad === "kopplingar.json" ? "handlingar.json" : "kopplingar.json"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("syntetisk metadata skrivs med journal och bevarar handlingarnas bytes", () => {
  const dir = kopia();
  try {
    const { fore, kopplingar } = lasAvslagsbackfill(dir);
    const första = kopplingar[0]!;
    const ändrade = [{ ...första, avslaget: [{ motion: "test", parti: "", dok_id: "syntetisk", lydelse: "syntetisk" }] }, ...kopplingar.slice(1)];
    skrivAvslagsbackfill(dir, fore, ändrade);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "kopplingar.json"), "utf8"))[0].avslaget, ändrade[0]!.avslaget);
    assert.equal(readFileSync(join(dir, "handlingar.json"), "utf8"), fore["handlingar.json"]);
    assert.throws(() => skrivAvslagsbackfill(dir, fore, ändrade), /föreläge/u);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
