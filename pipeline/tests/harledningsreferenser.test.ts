import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {forberedRubrikforslag} from "../src/rubrikforslag.ts";
import {byggRubrikunderlag, skapaSakprovning, sakprovningsBeredskap} from "../src/sakprovning.ts";
import type {PromiseEntry} from "../src/loftesforslag.ts";
const seed = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8"))[0];
function fixture() {
  const p = structuredClone(seed) as PromiseEntry;
  p.group_id = null; p.status = "aktiv"; p.title = "Tidigare rubrik"; p.quote = "Vi ska bygga fler bostäder.";
  p.cost.anchor_ids = [];
  p.cost.harledning = {version: "harledning/1", led: [{roll: "extern-kalla", text: "Syntetiskt prov", kalla: "https://example.test/kalla", kalla_ref: "k1"}], arsprofil: {status: "okand", skal: "Prov"}};
  const f = forberedRubrikforslag({id: p.id, rubrik: "Bygga fler bostäder", skal: "Tekniskt prov av referensbindning utan sakgodkännande."}, [p], new Date("2026-10-07T12:00:00Z"));
  return {p, f};
}
const ref = {id: "k1", slag: "kalla" as const, adress: "https://example.test/kalla", innehall: "Syntetiskt fryst källmaterial"};
test("faktiskt sakunderlag binder ledets material och ändrat innehåll gör prövningen inaktuell", () => {
  const {p, f} = fixture(); const before = JSON.stringify(p);
  const u = byggRubrikunderlag(f, [p], [ref]);
  assert.equal(u.referenser[0]!.innehall, ref.innehall);
  const changed = byggRubrikunderlag(f, [p], [{...ref, innehall: "Ändrat material på samma adress"}]);
  assert.notEqual(u.hash, changed.hash);
  assert.equal(sakprovningsBeredskap(skapaSakprovning(u), changed).klar, false);
  assert.equal(JSON.stringify(p), before);
});
test("sakunderlag avvisar saknad, fel och dubblerad referens utan originalskrivning", () => {
  const {p, f} = fixture(); const before = JSON.stringify(p);
  for (const refs of [[], [{...ref, id: "annan"}], [{...ref, adress: "https://example.test/fel"}], [{...ref, slag: "regel" as const}], [ref, ref]]) {
    assert.throws(() => byggRubrikunderlag(f, [p], refs));
    assert.equal(JSON.stringify(p), before);
  }
});

test("källgrinden når ett ankare via två beroendeled och lämnar orelaterade poster utanför", () => {
  const {p} = fixture();
  const root = structuredClone(p), middle = structuredClone(p), deep = structuredClone(p), unrelated = structuredClone(p);
  root.id = "p-2026-9901"; middle.id = "p-2026-9902"; deep.id = "p-2026-9903"; unrelated.id = "p-2026-9904";
  delete root.cost.harledning; delete middle.cost.harledning;
  root.cost.anchor_ids = [middle.id]; middle.cost.anchor_ids = [deep.id];
  (unrelated.cost.harledning as any).led[0].kalla_ref = "orelaterad";
  const posts = [root, middle, deep, unrelated], before = JSON.stringify(posts);
  const f = forberedRubrikforslag({id: root.id, rubrik: "Bygga fler bostäder", skal: "Tekniskt prov av rekursiv källbindning utan sakgodkännande."}, posts, new Date("2026-10-07T12:00:00Z"));
  assert.throws(() => byggRubrikunderlag(f, posts, []), /fryst källmaterial/);
  const u = byggRubrikunderlag(f, posts, [ref]);
  assert.ok(u.poster.poster.some(x => x.id === deep.id));
  assert.ok(!u.poster.poster.some(x => x.id === unrelated.id));
  assert.equal(JSON.stringify(posts), before);
});

test("egna antaganden kan granskas utan att uppfinna extern källa", () => {
  const {p} = fixture();
  p.cost.harledning = {version: "harledning/1", led: [{roll: "antagande", text: "Syntetiskt eget antagande"}, {roll: "egen-berakning", text: "Syntetisk egen beräkning"}], arsprofil: {status: "okand", skal: "Prov"}};
  const f = forberedRubrikforslag({id: p.id, rubrik: "Bygga fler bostäder", skal: "Tekniskt prov av egna antaganden utan sakgodkännande."}, [p], new Date("2026-10-07T12:00:00Z"));
  const u = byggRubrikunderlag(f, [p], []);
  assert.deepEqual(u.referenser, []);
  assert.equal(sakprovningsBeredskap(skapaSakprovning(u), u).klar, false);
});
