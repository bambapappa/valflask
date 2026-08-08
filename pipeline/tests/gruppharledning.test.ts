import { test } from "node:test";
import assert from "node:assert/strict";
import {
  grupper,
  provaGruppen,
  totalForMandatperioden,
  domsdubbletter,
  type HarledningsLofte,
} from "../src/gruppharledning.ts";

function lofte(
  id: string,
  base: number,
  group_id: string | null = null,
  period = "per_ar",
  parties = ["s"],
): HarledningsLofte {
  return { id, title: id, parties, status: "aktiv", group_id, cost: { msek_base: base, period } };
}

test("totalen för mandatperioden räknas som sajten räknar den", () => {
  assert.equal(totalForMandatperioden(lofte("p-1", 1000, null, "per_ar")), 4000);
  assert.equal(totalForMandatperioden(lofte("p-2", 1000, null, "engang")), 1000);
});

test("representanten är den med högst total, inte högst basbelopp", () => {
  // 1 400 engång = 1 400; 500 per år = 2 000. Basbeloppet pekar fel väg.
  const g = grupper([lofte("p-1", 1400, "g", "engang"), lofte("p-2", 500, "g", "per_ar")]);
  assert.equal(g[0]?.representant.id, "p-2");
  assert.equal(g[0]?.publicerat, 2000);
});

test("vid lika total avgör det lägsta id:t — samma regel som dedupeByGroup", () => {
  const g = grupper([lofte("p-9", 100, "g"), lofte("p-1", 100, "g")]);
  assert.equal(g[0]?.representant.id, "p-1");
});

test("tillbakadragna löften räknas inte in i gruppen", () => {
  const draget = { ...lofte("p-2", 9000, "g"), status: "tillbakadragen" };
  const g = grupper([lofte("p-1", 100, "g"), draget]);
  assert.equal(g[0]?.medlemmar.length, 1);
  assert.equal(g[0]?.publicerat, 400);
});

/**
 * Mönstret som hindrar dubbelräkning: en medlem bär beloppet, de övriga står på
 * noll. Det ska aldrig flaggas — 8 grupper i beståndet är helt nollade och 8 har
 * en bärare plus nollor.
 */
test("en bärare och nollor är mönstret, inte ett fynd", () => {
  const g = grupper([lofte("p-1", 5000, "g"), lofte("p-2", 0, "g"), lofte("p-3", 0, "g")]);
  assert.deepEqual(provaGruppen(g[0]!).map((i) => i.kontroll), []);
});

test("en helt nollad grupp är inget fynd — laglöften kostar noll", () => {
  const g = grupper([lofte("p-1", 0, "g"), lofte("p-2", 0, "g")]);
  assert.deepEqual(provaGruppen(g[0]!).map((i) => i.kontroll), []);
});

test("två skilda icke-nollor är en fråga, och mätningen namnger vad som försvinner", () => {
  const g = grupper([lofte("p-1", 7000, "g"), lofte("p-2", 4600, "g")]);
  const i = provaGruppen(g[0]!);
  assert.deepEqual(i.map((x) => x.kontroll), ["gruppen_bar_skilda_belopp"]);
  assert.match(i[0]!.matt, /28000 mkr/);
  assert.match(i[0]!.matt, /p-2 18400/);
});

test("en grupp med en enda medlem har ingen att dela med", () => {
  const g = grupper([lofte("p-1", 100, "g")]);
  assert.deepEqual(provaGruppen(g[0]!).map((i) => i.kontroll), ["gruppen_ar_ensam"]);
});

test("ett löfte utan grupp bildar ingen grupp", () => {
  assert.deepEqual(grupper([lofte("p-1", 100, null)]), []);
});

/**
 * Kostnadssidan räknar gruppen en gång; Handlingsvågen fäller en dom per löfte.
 * Bär samma parti två avgjorda domar för samma grupp är reformen dömd två
 * gånger.
 */
test("samma parti med två avgjorda domar i samma grupp är en dubblett", () => {
  const loften = [lofte("p-1", 100, "g", "per_ar", ["c"]), lofte("p-2", 0, "g", "per_ar", ["c"])];
  const d = domsdubbletter(
    [
      { target_id: "p-1", party: "c", status: "agerat_i_linje" },
      { target_id: "p-2", party: "c", status: "agerat_i_linje" },
    ],
    loften,
  );
  assert.equal(d.length, 1);
  assert.deepEqual(d[0]?.loften, ["p-1", "p-2"]);
});

test("två partier med en dom var i samma grupp är riktigt, inte en dubblett", () => {
  const loften = [lofte("p-1", 100, "g", "per_ar", ["s"]), lofte("p-2", 100, "g", "per_ar", ["m"])];
  assert.deepEqual(
    domsdubbletter(
      [
        { target_id: "p-1", party: "s", status: "agerat_i_linje" },
        { target_id: "p-2", party: "m", status: "agerat_i_linje" },
      ],
      loften,
    ),
    [],
  );
});

test("en dom utan handling har inte fällts och räknas inte dubbelt", () => {
  const loften = [lofte("p-1", 100, "g", "per_ar", ["c"]), lofte("p-2", 0, "g", "per_ar", ["c"])];
  assert.deepEqual(
    domsdubbletter(
      [
        { target_id: "p-1", party: "c", status: "agerat_i_linje" },
        { target_id: "p-2", party: "c", status: "ingen_handling_annu" },
      ],
      loften,
    ),
    [],
  );
});
