import { godkannMedTestunderlag as approve } from "./fixtures/provat-beslutsunderlag.ts";
import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forberedLoftesforslag, tillampaLoftesforslag, type PromiseEntry } from "../src/loftesforslag.ts";
import { type ReviewCandidate } from "../src/review.ts";
import { kanon, konyckel } from "../src/provningar.ts";

const data = join(import.meta.dirname, "../../data");
const loften: PromiseEntry[] = JSON.parse(readFileSync(join(data, "promises.json"), "utf8"));
const ko: ReviewCandidate[] = JSON.parse(readFileSync(join(data, "needs_review.json"), "utf8"));
const item = ko.find((p) => p.candidate?.quote && p.cost?.calculation && p.cost.calculation.length <= 800)!;
assert.ok(item, "verklig köpost med beräkning krävs");
const target = loften.find((p) => p.status === "aktiv" && p.group_id === null)!;
assert.ok(target, "verkligt löfte utan grupp krävs");
const nu = new Date("2026-09-12T08:00:00.000Z");

it("sparad slutform och gruppändring återanvänds vid en senare tidpunkt", (t) => {
  const fore = JSON.stringify(loften);
  const forslag = forberedLoftesforslag(item, item.cost!, loften, target.id, nu);
  const sparat = JSON.parse(JSON.stringify(forslag));
  assert.equal(JSON.stringify(loften), fore, "förberedelsen muterar inte föreläget");
  assert.equal(forslag.gruppandring?.history.length, target.history.length + 1);
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-15T21:00:00.000Z") });
  const efter = tillampaLoftesforslag(sparat, loften, item, forslag.hash);
  assert.deepEqual(efter.find((p) => p.id === forslag.nyttLofte.id), forslag.nyttLofte);
  assert.deepEqual(efter.find((p) => p.id === target.id), forslag.gruppandring);
  assert.equal(efter.length, loften.length + 1);
  for (const p of loften.filter((p) => p.id !== target.id)) {
    assert.deepEqual(efter.find((q) => q.id === p.id), p);
  }
  assert.equal(forslag.nyttLofte.source.fetched_at, nu.toISOString());
  efter.find((p) => p.id === forslag.nyttLofte.id)!.parties.push("ändrat");
  assert.deepEqual(sparat, forslag, "tillämpningen muterar inte förslaget");
});

it("ändrade sakfält i föreläge eller kö stoppar även med samma identitet", () => {
  const forslag = forberedLoftesforslag(item, item.cost!, loften, target.id, nu);
  const changed = structuredClone(loften);
  changed.find((p) => p.id === target.id)!.person = { name: "ändrat", role: "ändrat" };
  assert.throws(() => tillampaLoftesforslag(forslag, changed, item, forslag.hash), /underlag har ändrats/);
  const changedItem = structuredClone(item);
  changedItem.candidate.category = "ändrat";
  assert.throws(() => tillampaLoftesforslag(forslag, loften, changedItem, forslag.hash), /underlag har ändrats/);
});

it("ändrad slutform eller ersatt förslag kan inte använda den sparade hashen", () => {
  const forslag = forberedLoftesforslag(item, item.cost!, loften, target.id, nu);
  const changed = structuredClone(forslag);
  changed.nyttLofte.cost.msek_base = Number(changed.nyttLofte.cost.msek_base) + 1;
  assert.throws(() => tillampaLoftesforslag(changed, loften, item, forslag.hash), /har ändrats/);
  const annat = forberedLoftesforslag(item, item.cost!, loften, target.id, new Date("2026-09-13T00:00:00Z"));
  assert.throws(() => tillampaLoftesforslag(annat, loften, item, forslag.hash), /har ändrats/);
});

it("tomt underlag och saknat gruppmål ger inga efter-poster", () => {
  assert.throws(() => forberedLoftesforslag({} as ReviewCandidate, item.cost!, [], undefined, nu), /saknar löftesunderlag/);
  assert.throws(() => forberedLoftesforslag(item, item.cost!, [], target.id, nu), /Hittade inget löfte/);
  assert.throws(() => forberedLoftesforslag(item, item.cost!, [target, target], undefined, nu), /Dubblerade/);
});

it("befintligt godkännande skriver förberedelsens slutform och grupphistorik", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "loftesforslag-"));
  try {
    t.mock.timers.enable({ apis: ["Date"], now: nu });
    const forslag = forberedLoftesforslag(item, item.cost!, loften, target.id, nu);
    writeFileSync(join(dir, "promises.json"), JSON.stringify(loften));
    writeFileSync(join(dir, "needs_review.json"), JSON.stringify([item]));
    writeFileSync(join(dir, "changelog.json"), "[]");
    // Teknisk integrationskontroll av den historiska grinden, ingen faktisk sakattest.
    writeFileSync(join(dir, "provningar.json"), JSON.stringify({ poster: [{
      id: konyckel(item.articleUrl, item.candidate.quote), slag: "lofte",
      datum: "2026-09-12", utfall: "haller",
      underlag_hash: kanon("lofte", forslag.nyttLofte as unknown as Record<string, unknown>),
    }] }));
    approve(["0", "--group", target.id], dir);
    const efter = JSON.parse(readFileSync(join(dir, "promises.json"), "utf8"));
    assert.deepEqual(efter, tillampaLoftesforslag(forslag, loften, item, forslag.hash));
    const log = JSON.parse(readFileSync(join(dir, "changelog.json"), "utf8"));
    assert.equal(log[0].timestamp, forslag.tidpunkt);
    assert.deepEqual(log[0].updated, [target.id]);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8")), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
