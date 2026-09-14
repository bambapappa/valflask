import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { forberedKalkylforslag, tillampaKalkylforslag } from "../src/kalkylforslag.ts";
import { byggSakunderlag, skapaSakprovning, sakprovningsBeredskap } from "../src/sakprovning.ts";
import { reviewId, type ReviewCandidate } from "../src/review.ts";
import type { PromiseEntry } from "../src/loftesforslag.ts";
import type { Flyttrad } from "../src/kalkylflytt.ts";
const loften: PromiseEntry[] = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8"));
const ko: ReviewCandidate[] = JSON.parse(readFileSync(new URL("../../data/needs_review.json", import.meta.url), "utf8"));
const kandidat = ko.find((p) => p.candidate?.quote && !p.candidate.person && p.cost?.calculation && p.cost.calculation.length <= 800)!;
assert.ok(kandidat);
const mal = loften.find((p) => p.status === "aktiv" && p.loftestyp === "reform" && !p.person && JSON.stringify([...p.parties].sort()) === JSON.stringify([...(kandidat.candidate.parties ?? [])].sort()))!;
assert.ok(mal);
const rad: Flyttrad = { fran: reviewId(kandidat), till: mal.id, kostnad: { ...kandidat.cost! }, skal: "Tekniskt prov; period och kostnadstyp följer den nya kalkylen." };
const tid = new Date("2026-09-13T10:00:00Z");
it("fryst ändring bevarar hela slutformen, aktören och kostnadens källa utan mutation", () => {
  const fore = JSON.stringify(loften), kopia = JSON.stringify(kandidat);
  const f = forberedKalkylforslag(rad, loften, kandidat, tid);
  const efter = tillampaKalkylforslag(JSON.parse(JSON.stringify(f)), loften, kandidat, f.hash);
  assert.deepEqual(efter.find((p) => p.id === mal.id), f.nyttLofte);
  assert.equal(efter.length, loften.length);
  assert.equal(f.nyttLofte.cost.basis_url, kandidat.cost?.basis_url ?? null);
  assert.deepEqual(f.kopost, kandidat);
  assert.deepEqual(f.tidigareLofte, mal);
  assert.deepEqual(f.nyttLofte.parties, mal.parties);
  assert.equal(f.nyttLofte.quote, mal.quote);
  assert.equal(JSON.stringify(loften), fore); assert.equal(JSON.stringify(kandidat), kopia);
});
it("ändrat föreläge, kandidat eller förslag stoppar tillämpning", () => {
  const f = forberedKalkylforslag(rad, loften, kandidat, tid);
  const andra = structuredClone(loften); andra[0]!.title += " ändrad";
  assert.throws(() => tillampaKalkylforslag(f, andra, kandidat, f.hash), /ändrats/u);
  const k = structuredClone(kandidat); k.candidate.quote += " ändrad";
  assert.throws(() => tillampaKalkylforslag(f, loften, k, f.hash), /ändrats/u);
  const f2 = structuredClone(f); f2.nyttLofte.title += " ändrad";
  assert.throws(() => tillampaKalkylforslag(f2, loften, kandidat, f.hash), /ändrats/u);
});
it("annan aktör, påförd inriktningskostnad, ändrad kostnad och tomt bestånd stoppas", () => {
  const p = structuredClone(loften); const target = p.find((x) => x.id === mal.id)!;
  target.person = { name: "Annan person", role: "ledamot" };
  assert.throws(() => forberedKalkylforslag(rad, p, kandidat, tid), /aktörsnivå/u);
  target.person = null; target.parties = ["ANNAT"];
  assert.throws(() => forberedKalkylforslag(rad, p, kandidat, tid), /aktörsnivå/u);
  target.parties = mal.parties; target.loftestyp = "inriktning";
  const k = structuredClone(kandidat); k.cost = { ...k.cost!, msek_low: 1, msek_base: 1, msek_high: 1 };
  assert.throws(() => forberedKalkylforslag({ ...rad, kostnad: { ...k.cost! } }, p, k, tid), /inriktning/u);
  assert.throws(() => forberedKalkylforslag({ ...rad, kostnad: { ...rad.kostnad, msek_base: 123456 } }, loften, kandidat, tid), /Kostnaden skiljer/u);
  assert.throws(() => forberedKalkylforslag(rad, [], kandidat, tid), /Tomt/u);
});
it("befintligt löftes ändring får bundet sakunderlag med alla moment oavgjorda", () => {
  const f = forberedKalkylforslag(rad, loften, kandidat, tid);
  const refs = [{ id: "kalla", slag: "kalla" as const, adress: kandidat.articleUrl, innehall: kandidat.candidate.quote! },
    { id: "regel", slag: "regel" as const, adress: "test", innehall: "Formatprov, inget sakfacit." }];
  const underlag = byggSakunderlag(f, loften, kandidat, refs);
  assert.equal(underlag.poster.rot, `lofte:${mal.id}`);
  const prov = skapaSakprovning(underlag);
  assert.ok(prov.bedomningar.every((b) => b.utfall === "oavgjort"));
  assert.equal(sakprovningsBeredskap(prov, underlag).klar, false);
  prov.bedomare = "Tekniskt formatprov, inte mänsklig attest";
  for (const b of prov.bedomningar) { b.utfall = "styrkt"; b.motivering = "Syntetiskt formatprov, ingen sakbedömning."; b.belagg = ["kalla", "regel"]; }
  assert.equal(sakprovningsBeredskap(prov, underlag).klar, true);
  const andraRefs = structuredClone(refs); andraRefs[1]!.innehall += " ändrad";
  assert.equal(sakprovningsBeredskap(prov, byggSakunderlag(f, loften, kandidat, andraRefs)).klar, false);
});
