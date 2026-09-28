import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { identiteter, kanon, lasProvningar, provningsGrind } from "../src/provningar.ts";

test("maskinell omfattning från indexfilen räcker inte till sakgodkännande", () => {
  const data = resolve(import.meta.dirname, "../../data");
  const promises = JSON.parse(readFileSync(join(data, "promises.json"), "utf8"));
  const index = lasProvningar(data);
  const p = promises.find((p: any) => provningsGrind(index, identiteter("lofte", p.id, p), "lofte", p).ok);
  assert.ok(p, "Verkligt historiskt underlag ska finnas");
  const dir = mkdtempSync(join(tmpdir(), "omfattningsgrind-"));
  try {
    const post = { id: p.id, slag: "lofte", datum: "2026-09-12", utfall: "haller-med-forbehall", underlag_hash: kanon("lofte", p) };
    const scope = { metod: "maskinellt-svep", teknik: "enligt-inlasta-matningar", kallstod: "endast-uttryckliga-kallkontroller", sak: "inte-provats", ekonomi: "ingen-oberoende-sakprovning", manskligt_godkannande: "inte-kontrollerat" };
    for (const bedomningsomfang of [scope, {}, null, { ...scope, sak: "godkand" }]) {
      writeFileSync(join(dir, "provningar.json"), JSON.stringify({ poster: [{ ...post, bedomningsomfang }] }));
      const result = provningsGrind(lasProvningar(dir), [p.id], "lofte", p);
      assert.equal(result.ok, false, "Märkning får inte tolkas som utförd sakprövning");
    }
    // Historiskt format omtolkas inte till en ny eller fullständig prövning.
    writeFileSync(join(dir, "provningar.json"), JSON.stringify({ poster: [post] }));
    assert.equal(provningsGrind(lasProvningar(dir), [p.id], "lofte", p).ok, true);
    assert.equal(provningsGrind(new Map(), [p.id], "lofte", p).ok, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
