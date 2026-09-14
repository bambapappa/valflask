import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { kanoniskJson } from "../src/underlagsversion.ts";
import { forberedSortforslag, tillampaSortforslag } from "../src/sortforslag.ts";
import { byggSortunderlag, skapaSakprovning, sakprovningsBeredskap } from "../src/sakprovning.ts";
import type { PromiseEntry } from "../src/loftesforslag.ts";
const loften: PromiseEntry[] = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8"));
const mal = loften.find((p) => p.status === "aktiv" && p.loftestyp === "inriktning")!;
assert.ok(mal);
const rad = { id: mal.id, sort: "reform", utrakning: "Tekniskt kontraktsprov av löftestypens slutform. Detta är ingen saklig bedömning av citatet.", skal: "Tekniskt prov av ändrad klassning, utan faktiskt publiceringsbeslut." };
const nu = new Date("2026-09-14T11:00:00Z");
it("fryser typändring och aktuell motivering med bevarad aktör och kostnad", () => {
  const fore = JSON.stringify(loften), f = forberedSortforslag(rad, loften, nu);
  assert.deepEqual(f.tidigareLofte, mal);
  assert.deepEqual(f.nyttLofte.cost, { ...mal.cost, calculation: rad.utrakning });
  assert.deepEqual({ ...f.nyttLofte, cost: mal.cost, history: mal.history, loftestyp: mal.loftestyp }, mal);
  assert.match(JSON.stringify(f.nyttLofte.history.at(-1)), /Tekniskt prov av ändrad klassning/u);
  assert.deepEqual(tillampaSortforslag(f, loften, f.hash).find((p) => p.id === mal.id), f.nyttLofte);
  assert.equal(JSON.stringify(loften), fore);
});
it("fel hash, ändrat bestånd och manipulerad slutform stoppas", () => {
  const f = forberedSortforslag(rad, loften, nu), andra = structuredClone(loften);
  andra[0]!.title += " ändrad";
  assert.throws(() => tillampaSortforslag(f, andra, f.hash), /ändrats/u);
  assert.throws(() => tillampaSortforslag(f, loften, "0".repeat(64)), /ändrats/u);
  const bytt = structuredClone(f); bytt.nyttLofte.parties = ["ANNAT"];
  const { hash: _, ...payload } = bytt;
  bytt.hash = createHash("sha256").update(kanoniskJson(payload)).digest("hex");
  assert.throws(() => tillampaSortforslag(bytt, loften, bytt.hash), /slutform/u);
});
it("tomt bestånd, okänt mål och inriktning med positivt spann stoppas", () => {
  assert.throws(() => forberedSortforslag(rad, [], nu), /Tomt/u);
  assert.throws(() => forberedSortforslag({ ...rad, id: "saknas" }, loften, nu), /finns inte/u);
  const p = structuredClone(mal); p.loftestyp = "reform"; p.cost.msek_high = 1;
  assert.throws(() => forberedSortforslag({ ...rad, sort: "inriktning" }, [p], nu), /nollat/u);
});
it("separat typunderlag börjar oavgjort och avvisar dubbla samtidiga mål", () => {
  const f = forberedSortforslag(rad, loften, nu), u = byggSortunderlag(f, loften, []);
  const p = skapaSakprovning(u);
  assert.equal(u.poster.rot, `lofte:${mal.id}`);
  assert.ok(p.bedomningar.every((b) => b.utfall === "oavgjort"));
  assert.equal(sakprovningsBeredskap(p, u).klar, false);
  assert.throws(() => byggSortunderlag(f, loften, [], [f]), /Dubblerad/u);
});
