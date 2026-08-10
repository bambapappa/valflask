/**
 * Reglerna för läskopian prövas mot påhittade poster; sist prövas den
 * INCHECKADE kopian mot en omräkning ur Fläskvågens löften. Den sista raden är
 * hela poängen — kopian har glidit två gånger utan att något sade ifrån, och
 * ett kommando någon ska komma ihåg att köra är inte en kontroll.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  byggKopia,
  jamforKopia,
  arSamstammig,
  glidningstext,
  type LoftesradIKopian,
  type RaLoftesuppgift,
} from "../src/vendorkopia.ts";

const ROT = resolve(import.meta.dirname, "..", "..");

function ralofte(over: Partial<RaLoftesuppgift>): RaLoftesuppgift {
  return {
    id: "p-0001",
    title: "Ett löfte",
    parties: ["v"],
    category: "välfärd",
    quote: "vi ska höja something",
    date_stated: "2026-06-01",
    source: { url: "https://exempel.se/", archive_url: null },
    ...over,
  };
}

test("tillbakadragna löften följer inte med i kopian", () => {
  const kopia = byggKopia([
    ralofte({ id: "p-0001" }),
    ralofte({ id: "p-0002", status: "tillbakadragen" }),
  ]);
  assert.deepEqual(
    kopia.map((l) => l.id),
    ["p-0001"],
  );
});

test("kopian sorteras på id, oavsett ordningen i källan", () => {
  const kopia = byggKopia([ralofte({ id: "p-0009" }), ralofte({ id: "p-0002" })]);
  assert.deepEqual(
    kopia.map((l) => l.id),
    ["p-0002", "p-0009"],
  );
});

test("ett publicerat löfte som saknas i kopian pekas ut", () => {
  const omraknad = byggKopia([ralofte({ id: "p-0001" }), ralofte({ id: "p-0002" })]);
  const g = jamforKopia(omraknad.slice(0, 1), omraknad);
  assert.deepEqual(g.saknas, ["p-0002"]);
  assert.equal(arSamstammig(g), false);
  assert.match(glidningstext(g), /löften partiet aldrig gett/u);
});

test("ett tillbakadraget löfte som ligger kvar i kopian pekas ut", () => {
  const incheckad = byggKopia([ralofte({ id: "p-0001" }), ralofte({ id: "p-0002" })]);
  const omraknad = byggKopia([
    ralofte({ id: "p-0001" }),
    ralofte({ id: "p-0002", status: "tillbakadragen" }),
  ]);
  assert.deepEqual(jamforKopia(incheckad, omraknad).kvarblivna, ["p-0002"]);
});

test("ett ändrat citat pekas ut även när antalet stämmer", () => {
  const incheckad = byggKopia([ralofte({ id: "p-0001", quote: "gammalt citat" })]);
  const omraknad = byggKopia([ralofte({ id: "p-0001", quote: "nytt citat" })]);
  const g = jamforKopia(incheckad, omraknad);
  assert.deepEqual(g.andrade, ["p-0001"]);
  assert.deepEqual(g.saknas, []);
});

test("en samstämmig kopia larmar inte", () => {
  const kopia = byggKopia([ralofte({})]);
  const g = jamforKopia(kopia, kopia);
  assert.equal(arSamstammig(g), true);
  assert.match(glidningstext(g), /stämmer med Fläskvågens löften/u);
});

test("den incheckade läskopian stämmer med Fläskvågens löften", () => {
  const incheckad: LoftesradIKopian[] = JSON.parse(
    readFileSync(resolve(ROT, "data", "loften-index.json"), "utf8"),
  );
  const promises: RaLoftesuppgift[] = JSON.parse(
    readFileSync(resolve(ROT, "..", "data", "promises.json"), "utf8"),
  );
  const g = jamforKopia(incheckad, byggKopia(promises));
  assert.ok(arSamstammig(g), glidningstext(g));
});
