import { it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync, symlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { kanon, konyckel } from "../src/provningar.ts";
import { parseReviewCommand, reviewId, type ReviewCandidate } from "../src/review.ts";
import { provatBeslutsunderlag } from "./fixtures/provat-beslutsunderlag.ts";
import {
  bindGithubGodkannande,
  forberedGodkannandepaket,
  godkannandeforslagshash,
  godkannandepakethash,
  verkstallGodkannandepaket,
  type Godkannandepaket,
} from "../src/godkannandepaket.ts";

const data = join(import.meta.dirname, "../../data");
const loften = JSON.parse(readFileSync(join(data, "promises.json"), "utf8"));
const ko = JSON.parse(readFileSync(join(data, "needs_review.json"), "utf8")) as ReviewCandidate[];
const kandidat = ko.find((p) => p.candidate?.quote && p.cost?.calculation && p.cost.calculation.length <= 800)!;
assert.ok(kandidat);

function init(dir: string): void {
  writeFileSync(join(dir, "promises.json"), JSON.stringify(loften));
  writeFileSync(join(dir, "needs_review.json"), JSON.stringify([kandidat]));
  writeFileSync(join(dir, "changelog.json"), "[]");
}

function klart(paket: Godkannandepaket): Godkannandepaket {
  const p = structuredClone(paket);
  p.beslut = {
    bedomare: "syntetiskt-testkonto",
    utfall: "godkann",
    motivering: "Tekniskt prov av det fullständiga godkännandepaketet.",
    forslagshash: godkannandeforslagshash(p),
    kalla: {
      system: "github",
      association: "OWNER",
      actor: "syntetiskt-testkonto",
      handelse: "https://github.com/test/repo/issues/1#issuecomment-1",
    },
  };
  return p;
}

it("binder förslag, sakprövning, slutform och verifierad mänsklig beslutskälla", () => {
  const dir = mkdtempSync(join(tmpdir(), "godkannandepaket-"));
  try {
    init(dir);
    const args = [reviewId(kandidat)];
    const underlag = provatBeslutsunderlag(args, dir);
    writeFileSync(join(dir, "provningar.json"), JSON.stringify({ poster: [{
      id: konyckel(underlag.forslag.nyttLofte.source.url, underlag.forslag.nyttLofte.quote),
      slag: "lofte",
      datum: "2026-09-15",
      utfall: "haller",
      underlag_hash: kanon("lofte", underlag.forslag.nyttLofte as unknown as Record<string, unknown>),
    }] }));
    const utkast = forberedGodkannandepaket([{ args, underlag, provningshash: underlag.provningshash }], dir, new Date("2026-09-15T08:00:00Z"));
    assert.throws(() => verkstallGodkannandepaket(dir, utkast, godkannandepakethash(utkast)), /mänskligt godkännande/u);
    const paket = klart(utkast);
    const felActor = structuredClone(paket);
    felActor.beslut!.kalla.actor = "annat-konto";
    assert.throws(() => verkstallGodkannandepaket(dir, felActor, godkannandepakethash(felActor)), /mänskligt godkännande/u);
    const andrad = structuredClone(paket);
    andrad.rader[0]!.underlag.provning.bedomningar[0]!.motivering = "Ändrad slutsats";
    assert.throws(() => verkstallGodkannandepaket(dir, andrad, godkannandepakethash(andrad)), /Förprövningen|sakprövning eller slutform/u);
    assert.throws(() => verkstallGodkannandepaket(dir, paket, "0".repeat(64)), /hela godkännandepaketet/u);
    verkstallGodkannandepaket(dir, paket, godkannandepakethash(paket));
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "promises.json"), "utf8")).at(-1), underlag.forslag.nyttLofte);
    assert.throws(() => verkstallGodkannandepaket(dir, paket, godkannandepakethash(paket)), /föreläge/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("verklig CLI kräver privat paket och hela beslutets externa hash", () => {
  const root = mkdtempSync(join(tmpdir(), "godkannandepaket-cli-"));
  const dir = join(root, "data");
  const pipeline = join(root, "pipeline");
  try {
    mkdirSync(dir);
    mkdirSync(join(pipeline, "scripts"), { recursive: true });
    for (const namn of ["src", "schemas", "prompts"]) cpSync(join(import.meta.dirname, "..", namn), join(pipeline, namn), { recursive: true });
    cpSync(join(import.meta.dirname, "../package.json"), join(pipeline, "package.json"));
    cpSync(join(import.meta.dirname, "../scripts/godkann-paket.mts"), join(pipeline, "scripts/godkann-paket.mts"));
    symlinkSync(join(import.meta.dirname, "../node_modules"), join(pipeline, "node_modules"), "dir");
    init(dir);
    const args = [reviewId(kandidat)];
    const underlag = provatBeslutsunderlag(args, dir);
    writeFileSync(join(dir, "provningar.json"), JSON.stringify({ poster: [{
      id: konyckel(underlag.forslag.nyttLofte.source.url, underlag.forslag.nyttLofte.quote),
      slag: "lofte", datum: "2026-09-15", utfall: "haller",
      underlag_hash: kanon("lofte", underlag.forslag.nyttLofte as unknown as Record<string, unknown>),
    }] }));
    const rader = join(root, "rader.json");
    const paketfil = join(root, "paket.json");
    writeFileSync(rader, JSON.stringify([{ args, underlag, provningshash: underlag.provningshash }]));
    const run = (...argv: string[]) => spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/godkann-paket.mts", ...argv], { cwd: pipeline, encoding: "utf8" });
    let result = run("forbered", rader, paketfil);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(statSync(paketfil).mode & 0o777, 0o600);
    assert.notEqual(run("kontroll", paketfil).status, 0);
    const paket = klart(JSON.parse(readFileSync(paketfil, "utf8")) as Godkannandepaket);
    writeFileSync(paketfil, JSON.stringify(paket));
    result = run("kontroll", paketfil);
    assert.equal(result.status, 0, result.stderr);
    assert.notEqual(run("verkstall", paketfil, "0".repeat(64), "--skriv").status, 0);
    result = run("verkstall", paketfil, godkannandepakethash(paket), "--skriv");
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "promises.json"), "utf8")).at(-1), underlag.forslag.nyttLofte);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("GitHub-bryggan binder rätt issue, mänsklig aktör och exakt förslag utan originalskrivning vid fel", () => {
  const root = mkdtempSync(join(tmpdir(), "github-godkannande-"));
  const dir = join(root, "repo/data");
  const pipeline = join(root, "repo/pipeline");
  try {
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(pipeline, "scripts"), { recursive: true });
    for (const namn of ["src", "schemas", "prompts"]) cpSync(join(import.meta.dirname, "..", namn), join(pipeline, namn), { recursive: true });
    cpSync(join(import.meta.dirname, "../package.json"), join(pipeline, "package.json"));
    cpSync(join(import.meta.dirname, "../scripts/handle-review-comment.mts"), join(pipeline, "scripts/handle-review-comment.mts"));
    symlinkSync(join(import.meta.dirname, "../node_modules"), join(pipeline, "node_modules"), "dir");
    init(dir);
    const id = reviewId(kandidat), args = [id];
    const underlag = provatBeslutsunderlag(args, dir);
    writeFileSync(join(dir, "provningar.json"), JSON.stringify({ poster: [{
      id: konyckel(underlag.forslag.nyttLofte.source.url, underlag.forslag.nyttLofte.quote),
      slag: "lofte", datum: "2026-09-19", utfall: "haller",
      underlag_hash: kanon("lofte", underlag.forslag.nyttLofte as unknown as Record<string, unknown>),
    }] }));
    const paket = forberedGodkannandepaket([{ args, underlag, provningshash: underlag.provningshash }], dir, new Date("2026-09-19T08:00:00Z"));
    const hash = godkannandeforslagshash(paket);
    const event = { repository: "syntetiskt-testkonto/repo", issue: 1, reviewId: id, actor: "syntetiskt-testkonto", actorType: "User", association: "OWNER", handelse: "https://github.com/syntetiskt-testkonto/repo/issues/1#issuecomment-1", forslagshash: hash };
    assert.deepEqual(parseReviewCommand(`/godkänn paket ${hash}`), { action: "approve-package", hash });
    assert.equal(parseReviewCommand(`/godkänn paket ${hash} annat`), null);
    const bundet = bindGithubGodkannande(paket, event);
    assert.equal(paket.beslut, null);
    assert.equal(bundet.beslut!.bedomare, event.actor);
    for (const fel of [{ actorType: "Bot" }, { actor: "annan" }, { association: "MEMBER" }, { issue: 2 }, { repository: "annat/repo" }, { handelse: event.handelse + "x" }, { forslagshash: "0".repeat(64) }, { reviewId: "0".repeat(12) }]) {
      assert.throws(() => bindGithubGodkannande(paket, { ...event, ...fel }));
    }
    assert.throws(() => bindGithubGodkannande(bundet, event), /redan/u);
    const fil = join(root, "privat.json");
    writeFileSync(fil, JSON.stringify(paket), { mode: 0o600 });
    const env = { ...process.env, ISSUE_TITLE: `[review ${id}] prov`, COMMENT_BODY: `/godkänn paket ${hash}`, DECISION_ACTOR: event.actor, DECISION_ACTOR_TYPE: "User", DECISION_ASSOCIATION: "OWNER", DECISION_REF: event.handelse, GITHUB_REPOSITORY: event.repository, ISSUE_NUMBER: "1", GODKANNANDEPAKET_FIL: fil };
    const run = (extra: Record<string, string> = {}) => spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/handle-review-comment.mts"], { cwd: pipeline, encoding: "utf8", env: { ...env, ...extra } });
    const fore = Object.fromEntries(Object.keys(paket.filer.fore).map(n => [n, readFileSync(join(dir, n), "utf8")]));
    for (const extra of [{ GODKANNANDEPAKET_FIL: "" }, { COMMENT_BODY: `/godkänn paket ${"0".repeat(64)}` }, { ISSUE_NUMBER: "2" }, { DECISION_ACTOR_TYPE: "Bot" }]) {
      const r = run(extra); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /\[error\]/u);
      for (const [n, innehall] of Object.entries(fore)) assert.equal(readFileSync(join(dir, n), "utf8"), innehall);
    }
    const andrat = structuredClone(paket);
    andrat.rader[0]!.underlag.provning.bedomningar[0]!.motivering = "Privat ändrad prövning som aldrig får läcka";
    writeFileSync(fil, JSON.stringify(andrat));
    let r = run(); assert.match(r.stdout, /\[error\]/u); assert.doesNotMatch(r.stdout + r.stderr, /Privat ändrad/u);
    writeFileSync(fil, JSON.stringify(paket));
    r = run(); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /\[approved\]/u);
    for (const [n, innehall] of Object.entries(paket.filer.efter)) assert.equal(readFileSync(join(dir, n), "utf8"), innehall);
    r = run(); assert.match(r.stdout, /\[error\]/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
