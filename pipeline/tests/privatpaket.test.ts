import { it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { privatPaketnamn, valjPrivatArtefakt, privatPubliceringsnamn, valjPrivatPubliceringsprovning, kontrolleraPrivatKorning, kontrolleraPrivatZip } from "../src/privatpaket.ts";

const hash = "a".repeat(64), sha = "b".repeat(40), bytes = Buffer.from("syntetiskt zip-prov");
const artifact = { id: 1, name: privatPaketnamn(2, hash), expired: false, size_in_bytes: bytes.length, digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, workflow_run: { id: 3, head_branch: "main", head_sha: sha, repository_id: 4, head_repository_id: 4 } };
const run = { id: 3, path: ".github/workflows/godkannandepaket.yml", event: "workflow_dispatch", status: "completed", conclusion: "success", head_branch: "main", head_sha: sha, repository: { id: 4 }, head_repository: { id: 4 } };
it("väljer exakt paket och stoppar saknat, dubblerat, utgånget och orimligt underlag", () => {
  assert.deepEqual(valjPrivatArtefakt([artifact], 2, hash), artifact);
  for (const lista of [[], [artifact, artifact], [{ ...artifact, expired: true }], [{ ...artifact, digest: "" }], [{ ...artifact, size_in_bytes: 33 * 1024 * 1024 }]]) assert.throws(() => valjPrivatArtefakt(lista, 2, hash));
  assert.throws(() => valjPrivatArtefakt([artifact], 3, hash));
  assert.throws(() => privatPaketnamn(0, hash));
});
it("kräver lyckad producent på huvudgrenen med samma repo, revision och körning", () => {
  kontrolleraPrivatKorning(artifact, run);
  for (const fel of [{ id: 5 }, { event: "pull_request" }, { path: "annat.yml" }, { conclusion: "failure" }, { head_branch: "annan" }, { head_sha: "c".repeat(40) }, { head_repository: { id: 5 } }]) assert.throws(() => kontrolleraPrivatKorning(artifact, { ...run, ...fel }));
  assert.throws(() => kontrolleraPrivatKorning({ ...artifact, workflow_run: { ...artifact.workflow_run, repository_id: 6 } }, run));
});
it("kontrollerar hämtade byte mot separat kontrollsumma och storlek", () => {
  kontrolleraPrivatZip(artifact, bytes);
  assert.throws(() => kontrolleraPrivatZip(artifact, Buffer.from("ändrat")));
  assert.throws(() => kontrolleraPrivatZip({ ...artifact, digest: `sha256:${"0".repeat(64)}` }, bytes));
});

it("publiceringsprövning kräver eget manifestnamn och egen producent", () => {
  const a = { ...artifact, name: privatPubliceringsnamn(hash) };
  assert.deepEqual(valjPrivatPubliceringsprovning([a], hash), a);
  assert.throws(() => valjPrivatPubliceringsprovning([artifact], hash));
  assert.throws(() => valjPrivatPubliceringsprovning([a, a], hash));
  assert.throws(() => kontrolleraPrivatKorning(a, run, "publiceringsprovning"));
  const producer = { ...run, path: ".github/workflows/publiceringsprovning.yml" };
  kontrolleraPrivatKorning(a, producer, "publiceringsprovning");
  assert.throws(() => kontrolleraPrivatKorning(a, producer));
});
