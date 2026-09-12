import test from "node:test";
import assert from "node:assert/strict";
import { kontrolleraPubliceringsbeslut } from "../src/publiceringsbeslut.ts";

// Uppmätt miljö 2026-09-10: inget krav på granskare och tom granskningshistorik.
const faktiskMiljo = { id: 16695666381, name: "github-pages", can_admins_bypass: true,
  protection_rules: [{ type: "branch_policy" }] };
const hash = "a".repeat(64);
test("aktuell oskyddad miljö och tom historik stoppar publicering", () => {
  assert.throws(() => kontrolleraPubliceringsbeslut(faktiskMiljo, [], hash));
  assert.throws(() => kontrolleraPubliceringsbeslut({}, [], hash));
});
test("endast utsedd användares entydiga godkännande av exakt manifest accepteras", () => {
  const user = { id: 123, type: "User", login: "granskare" };
  const miljo = { ...faktiskMiljo, can_admins_bypass: false,
    protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: user }] }] };
  const rad = { state: "approved", user, comment: `Godkänn publiceringspaket ${hash}`,
    environments: [{ id: miljo.id }] };
  assert.equal(kontrolleraPubliceringsbeslut(miljo, [rad], hash), "granskare");
  for (const fel of [{ state: "rejected" }, { comment: "Godkänt" },
    { user: { ...user, type: "Bot" } }, { user: { ...user, id: 456 } },
    { environments: [{ id: 1 }] }]) {
    assert.throws(() => kontrolleraPubliceringsbeslut(miljo, [{ ...rad, ...fel }], hash));
  }
  assert.throws(() => kontrolleraPubliceringsbeslut(miljo, [rad], "b".repeat(64)));
  assert.throws(() => kontrolleraPubliceringsbeslut(miljo, [rad, rad], hash));
  // En avvisning behöver inte upprepa godkännandets kontrollsumma.
  assert.throws(() => kontrolleraPubliceringsbeslut(miljo,
    [rad, { ...rad, state: "rejected", comment: "Fel period i underlaget" }], hash));
});
