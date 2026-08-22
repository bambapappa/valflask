/**
 * Vaktar paritetssvepet — kontrollen som jämför löften med varandra i stället
 * för att läsa ett i taget.
 *
 * Proven håller de fyra villkor som avgör om ett par alls ska ställas till en
 * människa: samma parti räknas aldrig som paritetsfel, ett delat löfte är
 * lösningen och inte felet, ett inriktningslöftes nolla är en annan fråga, och
 * ett delat ord som står i vartannat löfte är ett ordsammanträffande. Sista
 * provet håller ordningen: kön betas uppifrån, så störst belopp ska ligga
 * först.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { paritetsfynd, okvitterade, vantarPaBeslut, nyckelFor, type Kvittens, type ParitetsLofte } from "../src/pariteten.ts";

const lofte = (id: string, over: Partial<ParitetsLofte> = {}): ParitetsLofte => ({
  id,
  title: "Avskaffa marknadsskolan",
  quote: "Vi vill avskaffa marknadsskolan.",
  parties: ["mp"],
  category: "skola",
  group_id: null,
  status: "aktiv",
  loftestyp: "reform",
  cost: { msek_base: 0, period: "per_ar" },
  ...over,
});

const prissatt = (id: string, over: Partial<ParitetsLofte> = {}): ParitetsLofte =>
  lofte(id, { parties: ["v"], cost: { msek_base: 50, period: "per_ar" }, ...over });

test("nollat reformlöfte och prissatt motpart hos annat parti blir ett fynd", () => {
  const fynd = paritetsfynd([lofte("p-1"), prissatt("p-2")]);
  assert.equal(fynd.length, 1);
  assert.equal(fynd[0]!.nyckel, nyckelFor("p-1", "p-2"));
  assert.equal(fynd[0]!.msek_base, 50);
  assert.ok(fynd[0]!.delade_ord.includes("marknadsskolan"));
});

test("samma parti är ingen paritetsfråga — det är en dubblett, och den prövas någon annanstans", () => {
  assert.deepEqual(paritetsfynd([lofte("p-1"), prissatt("p-2", { parties: ["mp"] })]), []);
});

test("delat löfte flaggas inte — grupperingen ÄR svaret på frågan svepet ställer", () => {
  const g = "g-marknadsskolan";
  assert.deepEqual(paritetsfynd([lofte("p-1", { group_id: g }), prissatt("p-2", { group_id: g })]), []);
});

test("ett inriktningslöftes nolla säger att löftet inte går att prissätta — en annan fråga", () => {
  assert.deepEqual(paritetsfynd([lofte("p-1", { loftestyp: "inriktning" }), prissatt("p-2")]), []);
});

test("olika kategori paras inte ihop", () => {
  assert.deepEqual(paritetsfynd([lofte("p-1"), prissatt("p-2", { category: "vard" })]), []);
});

test("ett ord som står i vartannat löfte är inget sakord", () => {
  // Samma par som första provet, men nu står "marknadsskolan" i tolv löften
  // till. Med taket satt under det räknas ordet som vanligt, och paret faller.
  const utfyllnad = Array.from({ length: 12 }, (_, i) =>
    lofte(`p-fyll-${i}`, { parties: ["s"], cost: { msek_base: 10, period: "per_ar" } }),
  );
  const alla = [lofte("p-1"), prissatt("p-2"), ...utfyllnad];
  assert.equal(paritetsfynd(alla, { sallsyntTak: 100 }).length > 0, true);
  assert.deepEqual(paritetsfynd(alla, { sallsyntTak: 5 }), []);
});

test("citatet ensamt räcker inte — sakordet ska stå i båda rubrikerna", () => {
  const bakgrundsnamn = lofte("p-1", {
    title: "Höj lärarlönerna",
    quote: "Vi vill höja lärarlönerna, och på sikt avskaffa marknadsskolan.",
  });
  assert.deepEqual(paritetsfynd([bakgrundsnamn, prissatt("p-2")]), []);
});

test("kön sorteras på beloppet som står på spel", () => {
  const fynd = paritetsfynd([
    lofte("p-1"),
    prissatt("p-2"),
    lofte("p-3", { parties: ["s"], title: "Avskaffa karensavdraget", quote: "Avskaffa karensavdraget." }),
    prissatt("p-4", { parties: ["kd"], title: "Avskaffa karensavdraget", quote: "Avskaffa karensavdraget.", cost: { msek_base: 5000, period: "per_ar" } }),
  ]);
  assert.deepEqual(
    fynd.map((f) => f.msek_base),
    [5000, 50],
  );
});

test("okvitterade är de fynd ingen läst — en kvittens tystar bara sin egen rad", () => {
  const fynd = paritetsfynd([lofte("p-1"), prissatt("p-2")]);
  const kvittens: Kvittens = { utfall: "olika_atgarder", skal: "Skilda åtgärder.", datum: "2026-08-22" };
  assert.equal(okvitterade(fynd, new Map()).length, 1);
  assert.equal(okvitterade(fynd, new Map([[fynd[0]!.nyckel, kvittens]])).length, 0);
});

test("en läst men olöst rad räknas för sig — annars ser den ut som en oläst", () => {
  const fynd = paritetsfynd([lofte("p-1"), prissatt("p-2")]);
  const tillBeslut = new Map<string, Kvittens>([
    [fynd[0]!.nyckel, { utfall: "till_beslut", skal: "Rör en publicerad siffra.", datum: "2026-08-22" }],
  ]);
  // Den är kvitterad, så den ligger inte kvar i läslistan …
  assert.equal(okvitterade(fynd, tillBeslut).length, 0);
  // … men den är inte avgjord, och det ska synas.
  assert.equal(vantarPaBeslut(fynd, tillBeslut).length, 1);
  const avgjord = new Map<string, Kvittens>([
    [fynd[0]!.nyckel, { utfall: "rattat", skal: "Beloppet räknades om.", datum: "2026-08-22" }],
  ]);
  assert.equal(vantarPaBeslut(fynd, avgjord).length, 0);
});
