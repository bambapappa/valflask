/**
 * Provar interimregeln för arkivväntan.
 *
 * Det som ska bevisas är inte att regeln släpper igenom — det är lätt — utan
 * att den **stänger igen**. En interimlösning som inte kan ta slut är ingen
 * interimlösning, den är en sänkt grind med bättre ordval.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TAK_DYGN,
  TOM_VANTAN,
  provaVantan,
  skrivForsok,
  type Vantan,
} from "../src/arkivvantan.ts";

const NU = "2026-08-17T09:00:00.000Z";
const post = (url: string, forsta: string, utfall = "arkivet_svarade_inte" as const) => ({
  url, forsta, senaste: forsta, forsok: 1, utfall,
});

test("tom väntan godtas inte — då gäller den vanliga täckningsregeln", () => {
  const b = provaVantan(TOM_VANTAN, NU);
  assert.equal(b.godtas, false);
  assert.equal(b.sedan, null);
  assert.equal(b.vantande.length, 0);
});

test("källor som väntar på ett tyst arkiv godtas — det är hela poängen", () => {
  const v: Vantan = { poster: [post("https://kd.se/a", "2026-08-16"), post("https://mp.se/b", "2026-08-17")] };
  const b = provaVantan(v, NU);
  assert.equal(b.godtas, true);
  assert.equal(b.vantande.length, 2);
  assert.equal(b.sedan, "2026-08-16", "raden läsaren ser ska bära ÄLDSTA väntan");
});

test("EN källa över åldersgränsen fäller alltihop", () => {
  // Det här är provet som gör regeln till en grind i stället för en ursäkt.
  const gammal = new Date(Date.parse(NU) - (TAK_DYGN + 1) * 86_400_000).toISOString();
  const v: Vantan = { poster: [post("https://kd.se/a", "2026-08-17"), post("https://kd.se/b", gammal)] };
  const b = provaVantan(v, NU);
  assert.equal(b.godtas, false, "en för gammal väntan ska stänga dörren");
  assert.equal(b.forGamla.length, 1);
  assert.equal(b.forGamla[0]!.url, "https://kd.se/b");
});

test("exakt på gränsen godtas — dagen efter gör det inte", () => {
  const pa = new Date(Date.parse(NU) - TAK_DYGN * 86_400_000).toISOString();
  const over = new Date(Date.parse(NU) - (TAK_DYGN + 1) * 86_400_000 - 1000).toISOString();
  assert.equal(provaVantan({ poster: [post("https://x.se/1", pa)] }, NU).godtas, true);
  assert.equal(provaVantan({ poster: [post("https://x.se/1", over)] }, NU).godtas, false);
});

test("«ingen kopia finns» är en mätning och räknas ALDRIG som väntan", () => {
  // Skillnaden hela modulen finns för. Ett arkiv som svarat att det inte har
  // någon kopia har gett besked; det är inte ett skäl att stå över taket.
  const v: Vantan = { poster: [post("https://kd.se/a", "2026-08-17", "ingen_kopia" as never)] };
  const b = provaVantan(v, NU);
  assert.equal(b.godtas, false);
  assert.equal(b.vantande.length, 0);
});

test("«kopian bär inte citatet» räknas heller inte som väntan", () => {
  const v: Vantan = { poster: [post("https://kd.se/a", "2026-08-17", "bar_inte_citatet" as never)] };
  assert.equal(provaVantan(v, NU).godtas, false);
});

/* ───────────────────────── skrivForsok ── */

test("första försöket sätter forsta och senaste till samma dag", () => {
  const v = skrivForsok(TOM_VANTAN, "https://kd.se/a", "arkivet_svarade_inte", NU);
  assert.equal(v.poster.length, 1);
  assert.equal(v.poster[0]!.forsta, NU);
  assert.equal(v.poster[0]!.forsok, 1);
});

test("nästa försök flyttar senaste men ALDRIG forsta — annars nollas åldern", () => {
  // Utan det här kan en källa vänta i evighet: varje nytt försök skulle
  // nollställa klockan, och åldersgränsen hade aldrig löst ut.
  let v = skrivForsok(TOM_VANTAN, "https://kd.se/a", "arkivet_svarade_inte", "2026-08-01T00:00:00.000Z");
  v = skrivForsok(v, "https://kd.se/a", "arkivet_svarade_inte", NU);
  assert.equal(v.poster.length, 1, "samma källa ska inte bli två poster");
  assert.equal(v.poster[0]!.forsta, "2026-08-01T00:00:00.000Z");
  assert.equal(v.poster[0]!.senaste, NU);
  assert.equal(v.poster[0]!.forsok, 2);
});

test("en lyckad arkivering tar bort posten — väntan är över", () => {
  let v = skrivForsok(TOM_VANTAN, "https://kd.se/a", "arkivet_svarade_inte", NU);
  v = skrivForsok(v, "https://kd.se/a", "kopia", NU);
  assert.equal(v.poster.length, 0);
});

test("posterna sorteras på url — filen ska inte ändra ordning av sig själv", () => {
  let v = skrivForsok(TOM_VANTAN, "https://z.se/a", "arkivet_svarade_inte", NU);
  v = skrivForsok(v, "https://a.se/a", "arkivet_svarade_inte", NU);
  assert.deepEqual(v.poster.map((p) => p.url), ["https://a.se/a", "https://z.se/a"]);
});
