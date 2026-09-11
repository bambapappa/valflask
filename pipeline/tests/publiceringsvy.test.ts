import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { byggPubliceringspaket } from "../src/publiceringspaket.ts";
import { publiceringsvy } from "../src/publiceringsvy.ts";

test("verklig post visas före och efter med säker återgivning av källtext", () => {
  const promise = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8"))[0];
  assert.ok(promise.id);
  const fore = [{ slag: "lofte" as const, id: promise.id, innehall: promise, beroenden: [] }];
  const efter = structuredClone(fore);
  efter[0]!.innehall.title = '<script>alert("källtext")</script>';
  const paket = byggPubliceringspaket("a".repeat(40), "b".repeat(40), fore, efter);
  const vy = publiceringsvy(paket);
  assert.ok(vy.includes(promise.id));
  assert.ok(vy.includes(paket.hash));
  assert.ok(vy.includes("&lt;script&gt;"));
  assert.ok(!vy.includes("<script>"));
  assert.ok(vy.includes("Före") && vy.includes("Efter"));
  assert.ok(vy.includes('<th scope="row">Rubrik</th>'));
  assert.ok(!vy.includes('<th scope="row">Historik</th>'));
  assert.ok(vy.indexOf("Ändrat fält") < vy.indexOf("Visa hela underlaget"));
  const andrat = structuredClone(paket);
  andrat.andringar[0]!.efter!.poster[0]!.innehall.title = "Utbytt efter granskning";
  assert.throws(() => publiceringsvy(andrat), /ogiltigt/);
  assert.throws(() => publiceringsvy({} as any));
});
