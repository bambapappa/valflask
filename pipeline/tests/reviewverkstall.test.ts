import { provatKalkylunderlag } from "./fixtures/provat-kalkylunderlag.ts";
import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { reviewId, type ReviewCandidate } from "../src/review.ts";
import { kanon, konyckel } from "../src/provningar.ts";
import { provatBeslutsunderlag } from "./fixtures/provat-beslutsunderlag.ts";
import { forberedReviewverkstall, forberedReviewverkstallMedRapport, VERKSTALLFILER } from "../src/reviewverkstallpaket.ts";
import { lasFillage, skrivFilpaket } from "../src/datatransaktion.ts";
import type { Beslut } from "../src/reviewbeslut.ts";
const data = new URL("../../data/", import.meta.url);
const loften = JSON.parse(readFileSync(new URL("promises.json", data), "utf8"));
const ko: ReviewCandidate[] = JSON.parse(readFileSync(new URL("needs_review.json", data), "utf8"));
const items = ko.filter((p) => p.candidate?.quote && p.cost?.calculation && p.cost.calculation.length <= 800).slice(0, 3);
assert.equal(items.length, 3);
const target = loften.find((p: { status: string; group_id: string | null }) => p.status === "aktiv" && !p.group_id);
function init(dir: string): Beslut[] {
  cpSync(join(import.meta.dirname, "../../data/parties.json"), join(dir, "parties.json"));
  writeFileSync(join(dir, "promises.json"), JSON.stringify(loften));
  writeFileSync(join(dir, "needs_review.json"), JSON.stringify(items));
  for (const n of ["changelog.json", "rattelser.json", "avvisade.json"]) writeFileSync(join(dir, n), "[]");
  const underlag = provatBeslutsunderlag([reviewId(items[1]!), "--group", target.id], dir);
  const p = underlag.forslag.nyttLofte;
  writeFileSync(join(dir, "provningar.json"), JSON.stringify({ poster: [{ id: konyckel(p.source.url, p.quote), slag: "lofte", datum: "2026-09-13", utfall: "haller", underlag_hash: kanon("lofte", p as unknown as Record<string, unknown>) }] }));
  return [
    { id: reviewId(items[0]!), val: "ejlofte", not: "Endast prov av verkställning; inget sakligt facit." },
    { id: reviewId(items[1]!), val: "delat", grupp_id: target.id, beslutsunderlag: underlag, provningshash: underlag.provningshash },
  ];
}
function kalkylrad(dir: string): Beslut {
  const k = items[2]!;
  const best = JSON.parse(readFileSync(join(dir, "promises.json"), "utf8"));
  const mal = best.find((p: { status: string; loftestyp: string; parties: string[]; person: unknown; cost: { calculation: string } }) =>
    p.status === "aktiv" && p.loftestyp === "reform" && JSON.stringify(p.person ?? null) === JSON.stringify(k.candidate.person ?? null) &&
    JSON.stringify([...p.parties].sort()) === JSON.stringify([...(k.candidate.parties ?? [])].sort()) && p.cost.calculation !== k.cost!.calculation);
  assert.ok(mal);
  const rad = { fran: reviewId(k), till: mal.id, kostnad: { ...k.cost! }, skal: "Tekniskt prov; period och kostnadstyp följer den nya kalkylen." };
  const u = provatKalkylunderlag(rad, best, k);
  return { id: rad.fran, val: "dubblett_kalkyl", kalkyl_till: rad.till, kostnad_da: rad.kostnad, not: rad.skal, kalkylbeslutsunderlag: u, provningshash: u.provningshash };
}
it("avvisning och godkännande förprövas tillsammans och skriver exakt paket", () => {
  const dir = mkdtempSync(join(tmpdir(), "blandat-"));
  try {
    const beslut = init(dir), fore = lasFillage(dir, VERKSTALLFILER);
    const paket = forberedReviewverkstall(beslut, dir);
    assert.deepEqual(lasFillage(dir, VERKSTALLFILER), fore);
    assert.equal(JSON.parse(paket.efter["needs_review.json"]!).length, 1);
    assert.equal(JSON.parse(paket.efter["avvisade.json"]!).length, 1);
    assert.equal(JSON.parse(paket.efter["promises.json"]!).length, loften.length + 1);
    skrivFilpaket(dir, paket);
    assert.deepEqual(lasFillage(dir, VERKSTALLFILER), paket.efter);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("fel efter kalkylflytt och avvisning lämnar alla originalfiler orörda", () => {
  const dir = mkdtempSync(join(tmpdir(), "blandat-fel-"));
  try {
    const beslut = init(dir);
    beslut[1]!.provningshash = "0".repeat(64);
    beslut.unshift(kalkylrad(dir));
    const fore = lasFillage(dir, VERKSTALLFILER);
    assert.throws(() => forberedReviewverkstall(beslut, dir), (error: Error) => /inga originaldata skrivna/u.test(error.message) && /Avbröt efter 2 av 3/u.test(error.message));
    assert.deepEqual(lasFillage(dir, VERKSTALLFILER), fore);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("verklig CLI för blandade beslut torrkör, stoppar sent fel och skriver giltigt paket", () => {
  const root = mkdtempSync(join(tmpdir(), "blandad-cli-"));
  const dir = join(root, "data"), pipeline = join(root, "pipeline");
  try {
    mkdirSync(dir); mkdirSync(join(pipeline, "scripts"), { recursive: true });
    for (const n of ["src", "schemas"]) cpSync(join(import.meta.dirname, "..", n), join(pipeline, n), { recursive: true });
    cpSync(join(import.meta.dirname, "../package.json"), join(pipeline, "package.json"));
    cpSync(join(import.meta.dirname, "../scripts/review-verkstall.mts"), join(pipeline, "scripts/review-verkstall.mts"));
    mkdirSync(join(root, "site/src/lib"), { recursive: true });
    cpSync(new URL("../../site/src/lib/aggregates.ts", import.meta.url), join(root, "site/src/lib/aggregates.ts"));
    symlinkSync(join(import.meta.dirname, "../node_modules"), join(pipeline, "node_modules"), "dir");
    const beslut = init(dir), fore = lasFillage(dir, VERKSTALLFILER);
    const fil = join(root, "beslut.jsonl");
    writeFileSync(join(root, "underlag.json"), JSON.stringify(beslut[1]!.beslutsunderlag));
    delete beslut[1]!.beslutsunderlag; beslut[1]!.underlagsfil = "underlag.json";
    const save = () => writeFileSync(fil, beslut.map((b) => JSON.stringify(b)).join("\n"));
    const run = (skriv = false) => spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/review-verkstall.mts", fil, ...(skriv ? ["--skriv"] : [])], { cwd: pipeline, encoding: "utf8" });
    save(); const dry = run(); assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /Förprövning: 2 att verkställa, 0 hålls tillbaka/u);
    assert.match(dry.stdout, /Att verkställa:.*ejlofte/u);
    assert.deepEqual(lasFillage(dir, VERKSTALLFILER), fore);
    const hash = beslut[1]!.provningshash!; beslut[1]!.provningshash = "0".repeat(64); save();
    const bad = run(true); assert.notEqual(bad.status, 0); assert.match(bad.stderr, /prövningshash/u);
    assert.deepEqual(lasFillage(dir, VERKSTALLFILER), fore);
    beslut[1]!.provningshash = hash; save(); const good = run(true); assert.equal(good.status, 0, good.stderr);
    assert.equal(JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8")).length, 1);
    assert.equal(JSON.parse(readFileSync(join(dir, "avvisade.json"), "utf8")).length, 1);
    const kalkyl = kalkylrad(dir), u = kalkyl.kalkylbeslutsunderlag!;
    writeFileSync(join(root, "kalkylunderlag.json"), JSON.stringify(u));
    delete kalkyl.kalkylbeslutsunderlag;
    beslut.splice(0, beslut.length, kalkyl); save();
    const innanKalkyl = lasFillage(dir, VERKSTALLFILER);
    const saknat = run(true); assert.notEqual(saknat.status, 0); assert.match(saknat.stderr, /Kalkylflytt kräver/u);
    assert.deepEqual(lasFillage(dir, VERKSTALLFILER), innanKalkyl);
    kalkyl.kalkylunderlagsfil = "kalkylunderlag.json"; save();
    const kalkylOk = run(true); assert.equal(kalkylOk.status, 0, kalkylOk.stderr);
    const efterKalkyl = JSON.parse(readFileSync(join(dir, "promises.json"), "utf8"));
    assert.deepEqual(efterKalkyl.find((p: { id: string }) => p.id === kalkyl.kalkyl_till), u.forslag.nyttLofte);
    assert.equal(JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8")).length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("kalkylflyttens ändrade löfte, rättelse och avvisning finns i samma paket", () => {
  const dir = mkdtempSync(join(tmpdir(), "kalkylpaket-"));
  try {
    const beslut = init(dir).slice(0, 1);
    beslut.unshift(kalkylrad(dir));
    const fore = lasFillage(dir, VERKSTALLFILER);
    const paket = forberedReviewverkstall(beslut, dir);
    assert.deepEqual(lasFillage(dir, VERKSTALLFILER), fore);
    const efter = JSON.parse(paket.efter["promises.json"]!).find((p: { id: string }) => p.id === beslut[0]!.kalkyl_till);
    assert.equal(efter.cost.calculation, items[2]!.cost!.calculation);
    assert.equal(JSON.parse(paket.efter["rattelser.json"]!).length, 1);
    assert.equal(JSON.parse(paket.efter["avvisade.json"]!).length, 2);
    assert.equal(JSON.parse(paket.efter["needs_review.json"]!).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("verkställningspaketet stoppas om partiposter ändrats efter förprövningen", () => {
  const dir = mkdtempSync(join(tmpdir(), "verkstall-parti-"));
  try {
    const beslut = init(dir).slice(0, 1);
    const paket = forberedReviewverkstall(beslut, dir);
    assert.equal(paket.efter["parties.json"], paket.fore["parties.json"]);
    const loftenFore = readFileSync(join(dir, "promises.json"), "utf8");
    const partier = JSON.parse(readFileSync(join(dir, "parties.json"), "utf8"));
    partier[0].name += " ändrat";
    writeFileSync(join(dir, "parties.json"), JSON.stringify(partier));
    assert.throws(() => skrivFilpaket(dir, paket), /föreläge har ändrats/u);
    assert.equal(readFileSync(join(dir, "promises.json"), "utf8"), loftenFore);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("rapporten skiljer utförda, tillbakahållna, saknade och oavgjorda beslut", () => {
  const dir = mkdtempSync(join(tmpdir(), "verkstallrapport-"));
  try {
    const beslut = init(dir);
    writeFileSync(join(dir, "provningar.json"), JSON.stringify({ poster: [] }));
    beslut.push({ id: "finns-inte", val: "ejlofte" }, { id: reviewId(items[2]!), val: "oklart" });
    const fore = lasFillage(dir, VERKSTALLFILER);
    const { paket, rapport } = forberedReviewverkstallMedRapport(beslut, dir);
    assert.deepEqual(rapport, {
      version: "verkstallrapport/1",
      utforda: [{ id: beslut[0]!.id, val: "ejlofte" }],
      hallna: [{ id: beslut[1]!.id, skal: "oprövad" }],
      hoppade: ["finns-inte"],
      oavgjorda: [reviewId(items[2]!)],
    });
    assert.deepEqual(lasFillage(dir, VERKSTALLFILER), fore);
    assert.equal(JSON.parse(paket.efter["needs_review.json"]!).length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("enbart oavgjorda beslut ger explicit rapport och identiska före-/efterfiler", () => {
  const dir = mkdtempSync(join(tmpdir(), "verkstall-oavgjort-"));
  try {
    init(dir);
    const { paket, rapport } = forberedReviewverkstallMedRapport([{ id: reviewId(items[0]!), val: "oklart" }], dir);
    assert.deepEqual(paket.efter, paket.fore);
    assert.deepEqual(rapport.utforda, []);
    assert.deepEqual(rapport.hallna, []);
    assert.deepEqual(rapport.oavgjorda, [reviewId(items[0]!)]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
