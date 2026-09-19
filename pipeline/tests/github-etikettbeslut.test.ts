import { it } from "node:test";
import assert from "node:assert/strict";
import { verifieraEtikettbeslut, type GitHubEtiketthandelse } from "../src/github-etikettbeslut.ts";

const handelser: GitHubEtiketthandelse[] = [
  { id: 10, event: "labeled", actor: { login: "bambapappa" }, label: { name: "beslut:avvisa" } },
  { id: 11, event: "unlabeled", actor: { login: "annan" }, label: { name: "beslut:avvisa" } },
  { id: 12, event: "labeled", actor: { login: "BambaPappa" }, label: { name: "beslut:avvisa" } },
];

it("binder det senaste etikettbeslutet från repots ägare till GitHub-händelsen", () => {
  assert.deepEqual(
    verifieraEtikettbeslut(handelser, "beslut:avvisa", "bambapappa", "bambapappa/valflask", 42),
    { actor: "BambaPappa", handelse: "https://github.com/bambapappa/valflask/issues/42#event-12" },
  );
});

it("avvisar etiketter som satts av någon annan eller saknar stabilt händelse-id", () => {
  assert.equal(verifieraEtikettbeslut([{ ...handelser[0]!, actor: { login: "annan" } }], "beslut:avvisa", "bambapappa", "bambapappa/valflask", 42), null);
  assert.equal(verifieraEtikettbeslut([{ event: "labeled", actor: { login: "bambapappa" }, label: { name: "beslut:avvisa" } }], "beslut:avvisa", "bambapappa", "bambapappa/valflask", 42), null);
});
