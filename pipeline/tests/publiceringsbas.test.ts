import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { valjPubliceringsbas } from "../src/publiceringsbas.ts";

// Tre oförändrade noder ur GitHubs verkliga svar 2026-09-11. Sidindelningen varierar i proven.
const noder = JSON.parse(readFileSync(new URL("./fixtures/publiceringsdrift.json", import.meta.url), "utf8"));
const sidor = (nodes = structuredClone(noder)) => [0, 1].map((i) => ({ data: { repository: { deployments: {
  totalCount: nodes.length, nodes: i === 0 ? nodes.slice(0, 1) : nodes.slice(1),
  pageInfo: { hasNextPage: i === 0, endCursor: `sida-${i}` },
} } } }));

test("senaste lyckade publicering väljs även med två aktiva versioner och omvänd ordning", () => {
  assert.equal(noder.filter((n: any) => n.state === "ACTIVE").length, 2);
  const bas = valjPubliceringsbas(sidor());
  assert.equal(bas.revision, noder[0].commitOid);
  assert.equal(bas.deploymentId, String(noder[0].databaseId));
  assert.equal(bas.publiceradVid, noder[0].latestStatus.createdAt);
  assert.deepEqual(valjPubliceringsbas(sidor([...noder].reverse())), bas);
  const rollback = structuredClone(noder);
  rollback[1].latestStatus.createdAt = "2026-09-11T01:00:00Z";
  assert.equal(valjPubliceringsbas(sidor(rollback)).revision, noder[1].commitOid);
  const misslyckad = structuredClone(noder);
  misslyckad[0].state = "FAILURE";
  misslyckad[0].latestStatus.state = "FAILURE";
  assert.equal(valjPubliceringsbas(sidor(misslyckad)).revision, noder[1].commitOid);
});

test("tom, avklippt, ändrad eller tvetydig drifthistorik får inte ge en bas", () => {
  assert.throws(() => valjPubliceringsbas([]), /saknas/);
  assert.throws(() => valjPubliceringsbas(sidor().slice(0, 1)), /Ofullständig/);
  const andrad = sidor();
  andrad[1]!.data.repository.deployments.totalCount += 1;
  assert.throws(() => valjPubliceringsbas(andrad), /ändrades/);
  const saknad = sidor();
  saknad[1]!.data.repository.deployments.nodes.pop();
  assert.throws(() => valjPubliceringsbas(saknad), /ofullständig/);
  const lika = structuredClone(noder);
  lika[1].latestStatus.createdAt = lika[0].latestStatus.createdAt;
  assert.throws(() => valjPubliceringsbas(sidor(lika)), /samma senaste/);
  const okand = structuredClone(noder);
  okand[0].latestStatus.state = "OKAND";
  assert.throws(() => valjPubliceringsbas(sidor(okand)), /Okänd/);
  const utan = structuredClone(noder).map((n: any) => ({ ...n, state: "INACTIVE", latestStatus: { state: "INACTIVE" } }));
  assert.throws(() => valjPubliceringsbas(sidor(utan)), /kunde inte fastställas/);
  const fel = sidor();
  (fel[0] as any).errors = [{ message: "Ofullständigt API-svar" }];
  assert.throws(() => valjPubliceringsbas(fel), /API-fel/);
});
