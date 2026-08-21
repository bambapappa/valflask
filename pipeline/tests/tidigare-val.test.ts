/**
 * G4b: adressen namnger ett tidigare val eller en tidigare budget.
 *
 * Proven är skrivna ur de adresser som faktiskt slank igenom 2026-08-21 och ur
 * de adresser som INTE får fällas — partiernas daterade nyheter är den stora
 * risken, för de bär ett årtal i adressen och bär ofta löftet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { kallanHorTillTidigareVal } from "../src/gates.ts";

test("fäller de adresser som skördades fel", () => {
  for (const url of [
    "https://www.vansterpartiet.se/var-politik/valplattform-2022-2/valplattformen-pa-latt-svenska/",
    "https://www.mp.se/politik/satsningar-nyanlandas-etablering-i-budgeten-2021-hela-listan/",
  ]) {
    assert.equal(kallanHorTillTidigareVal(url), true, `borde fällas: ${url}`);
  }
});

test("släpper igenom daterade nyheter — årtalet är ett datum, inte ett dokument", () => {
  for (const url of [
    "https://www.socialdemokraterna.se/nyheter/nyheter/2026-08-19-s-vallofte-kvinnors-halsa",
    "https://moderaterna.se/nyhet/sa-ska-sverige-bli-eus-rikaste-land/",
    "https://www.centerpartiet.se/nyheter/arkiv-2026/2026-06-24-loftet",
    "https://www.liberalerna.se/politik/forskolan",
  ]) {
    assert.equal(kallanHorTillTidigareVal(url), false, `borde släppas: ${url}`);
  }
});

test("ett dokumentord utan årtal är årets dokument", () => {
  assert.equal(kallanHorTillTidigareVal("https://www.liberalerna.se/valmanifest/"), false);
  assert.equal(
    kallanHorTillTidigareVal("https://val2026.centerpartiet.se/wp-content/uploads/2026/06/Valmanifest-2026.pdf"),
    false,
  );
});

test("dokumentordet och årtalet måste stå i samma adresspost", () => {
  // Nyhet från 2025 som råkar ligga under en manifest-katalog utan år: årtalet
  // hör till nyheten, inte till dokumentet, och sidan får inte fällas.
  assert.equal(kallanHorTillTidigareVal("https://mp.se/valmanifest/2025-11-03-presskonferens"), false);
  assert.equal(kallanHorTillTidigareVal("https://mp.se/politik/budgeten-2021-hela-listan/"), true);
});

test("en lång sifferkedja är inget årtal", () => {
  assert.equal(
    kallanHorTillTidigareVal("https://sd.se/download/18.68/1771599906618/Valplattform.pdf"),
    false,
  );
});
