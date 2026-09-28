import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { forberedAnkarforslag, tillampaAnkarforslag } from "../src/ankarforslag.ts";
import type { PromiseEntry } from "../src/loftesforslag.ts";

const verkliga: PromiseEntry[] = JSON.parse(readFileSync(new URL("../../data/promises.json", import.meta.url), "utf8"));
function bestånd(): PromiseEntry[] {
  const mal = structuredClone(verkliga.find((p) => p.status === "aktiv")!);
  const ankare = structuredClone(verkliga.find((p) => p.status === "aktiv" && p.id !== mal.id)!);
  mal.id = "p-2026-9001"; mal.loftestyp = "inriktning";
  mal.cost = { ...mal.cost, type: "utgift", period: "per_ar", msek_low: 0, msek_base: 0, msek_high: 0, calculation: "" };
  ankare.id = "p-2026-9002"; ankare.loftestyp = "reform";
  ankare.cost = { ...ankare.cost, type: "utgift", period: "per_ar", msek_low: 10, msek_base: 20, msek_high: 30, calculation: "20 gånger 1." };
  return [mal, ankare];
}
const rad = { id: "p-2026-9001", ankare: "p-2026-9002", utrakning: "Beloppet är lånat från ett jämförbart löfte om samma bestämda åtgärd.", skal: "Tekniskt formatprov av ankare och slutform, inte en saklig bedömning." };

it("binder hela föreläget, ankaret och exakt slutform", () => {
  const loften = bestånd();
  const f = forberedAnkarforslag(rad, loften, new Date("2026-09-14T12:00:00Z"));
  const efter = tillampaAnkarforslag(f, loften, f.hash);
  assert.deepEqual(efter.find((p) => p.id === rad.id), f.nyttLofte);
  assert.deepEqual(f.ankare, loften[1]);
  assert.throws(() => tillampaAnkarforslag(f, [...loften, { ...loften[0]!, id: "p-2026-9003" }], f.hash), /föreläge/u);
  const bytt = structuredClone(f); (bytt.ankare.cost as Record<string, unknown>).msek_base = 21;
  assert.throws(() => tillampaAnkarforslag(bytt, loften, f.hash), /ändrats/u);
});
