import test from "node:test";
import assert from "node:assert/strict";
import { sakmomentensBeredskap, ordnaSakreferenser, SAKMOMENT, type Sakmoment, type Sakreferens, type Sakbedomning } from "../src/sakmoment.ts";
const refs: Sakreferens[] = [{ id: "k", slag: "kalla", adress: "test:k", innehall: "Syntetiskt källmaterial." }, { id: "r", slag: "regel", adress: "test:r", innehall: "Syntetisk regel." }];
const bedomningar = (): Sakbedomning[] => (Object.keys(SAKMOMENT) as Sakmoment[]).map(moment => ({ moment, utfall: "styrkt", motivering: "Tekniskt formatprov, inte sakfacit.", belagg: ["k", "r"] }));
test("gemensamma sakmoment kräver komplett resultat och spårbara källor och regler", () => {
  assert.equal(sakmomentensBeredskap("Syntetiskt prov", bedomningar(), refs).klar, true);
  for (const material of [[], refs.slice(0, 1), [...refs, refs[0]!]]) assert.equal(sakmomentensBeredskap("Prov", bedomningar(), material).klar, false);
  assert.equal(sakmomentensBeredskap(null, bedomningar(), refs).klar, false);
  const b = bedomningar(); b[0]!.utfall = "oavgjort";
  assert.equal(sakmomentensBeredskap("Prov", b, refs).klar, false);
  b[0]!.utfall = "motsagt";
  assert.equal(sakmomentensBeredskap("Prov", b, refs).klar, false);
  assert.throws(() => ordnaSakreferenser([{ ...refs[0]!, innehall: "" }]));
});
