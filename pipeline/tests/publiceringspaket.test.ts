import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { byggUnderlagsregister } from "../src/underlagsregister.ts";
import { bindUnderlag } from "../src/underlagsversion.ts";
import { byggPubliceringspaket } from "../src/publiceringspaket.ts";

const root = resolve(import.meta.dirname, "../..");
const read = (file: string) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const register = byggUnderlagsregister({ loften: read("data/promises.json"),
  standpunkter: read("data/stances.json"), kopplingar: read("handlingsvagen/data/kopplingar.json"),
  handlingar: read("handlingsvagen/data/handlingar.json") });
const sha = "a".repeat(40), next = "b".repeat(40);

test("ändrat verkligt ankare tar med beroende löfte även när dess egen post är oförändrad", () => {
  const p = register.find((p) => p.slag === "lofte" && p.beroenden.length)!;
  assert.ok(p);
  const fore = bindUnderlag(`lofte:${p.id}`, register).poster;
  const efter = structuredClone(fore);
  const anchor = efter.find((x) => `lofte:${x.id}` === p.beroenden[0])!;
  assert.ok(anchor);
  (anchor.innehall.cost as any).msek_base += 1;
  const packet = byggPubliceringspaket(sha, next, fore, efter);
  const changed = packet.andringar.find((x) => x.rot === `lofte:${p.id}`)!;
  assert.ok(changed);
  assert.equal(changed.direkt, false);
  assert.notEqual(changed.fore!.hash, changed.efter!.hash);
  assert.equal(byggPubliceringspaket(sha, next, [...fore].reverse(), [...efter].reverse()).hash, packet.hash);
  assert.equal(byggPubliceringspaket(sha, next, fore, fore).andringar.length, 0);
});

test("en ändrad avsändare tar med den verkliga kopplingen", () => {
  const k = register.find((p) => p.slag === "koppling")!;
  const fore = bindUnderlag(`koppling:${k.id}`, register).poster;
  const efter = structuredClone(fore);
  const h = efter.find((p) => p.slag === "handling")!;
  h.innehall.parties = ["annat-parti"];
  const packet = byggPubliceringspaket(sha, next, fore, efter);
  assert.equal(packet.andringar.find((p) => p.rot === `koppling:${k.id}`)!.direkt, false);
  assert.equal(packet.andringar.find((p) => p.rot === `handling:${h.id}`)!.direkt, true);
});

test("tillagda och borttagna verkliga poster redovisas och trasiga register stoppas", () => {
  const posts = register.filter((p) => p.slag === "lofte" && !p.beroenden.length).slice(0, 2);
  assert.equal(posts.length, 2);
  const added = byggPubliceringspaket(sha, next, posts.slice(0, 1), posts);
  assert.equal(added.andringar[0]!.sort, "tillagd");
  assert.equal(added.andringar[0]!.fore, null);
  const removed = byggPubliceringspaket(sha, next, posts, posts.slice(0, 1));
  assert.equal(removed.andringar[0]!.sort, "borttagen");
  assert.equal(removed.andringar[0]!.efter, null);
  assert.throws(() => byggPubliceringspaket("main", next, posts, posts), /commit/u);
  assert.throws(() => byggPubliceringspaket(sha, next, [], posts), /Tomt/u);
  assert.throws(() => byggPubliceringspaket(sha, next, posts, [...posts, posts[0]!]), /Dubblerad/u);
  const broken = structuredClone(posts);
  broken[0]!.beroenden = ["lofte:saknas"];
  assert.throws(() => byggPubliceringspaket(sha, next, posts, broken), /saknas/u);
});
