import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arTaladKalla,
  tidpunktISekunder,
  tidpunktSomText,
  provaTaladKalla,
  avskriftensAdress,
} from "../src/talad-kalla.ts";

test("spelarsidor känns igen som talade källor", () => {
  assert.equal(
    arTaladKalla("https://www.svtplay.se/video/KnDABAQ/almedalen-partiledartal/ebba-busch-kd"),
    true,
  );
  assert.equal(arTaladKalla("https://youtube.com/watch?v=NZyztg_ESaY&t=1180s"), true);
  assert.equal(arTaladKalla("https://sverigesradio.se/artikel/123"), true);
});

test("en vanlig textsida är ingen talad källa — den ska prövas mot ögonblicksbilden", () => {
  assert.equal(arTaladKalla("https://www.socialdemokraterna.se/val-2026"), false);
  assert.equal(arTaladKalla("https://data.riksdagen.se/dokument/HA11610"), false);
  assert.equal(arTaladKalla(null), false);
  assert.equal(arTaladKalla(""), false);
});

test("tidpunkten läses i de former värdarna faktiskt skriver", () => {
  assert.equal(tidpunktISekunder("https://www.svtplay.se/video/x?position=377"), 377);
  assert.equal(tidpunktISekunder("https://youtube.com/watch?v=abc&t=1180s"), 1180);
  assert.equal(tidpunktISekunder("https://youtu.be/abc#t=19m40s"), 19 * 60 + 40);
  assert.equal(tidpunktISekunder("https://youtu.be/abc?t=1h2m3s"), 3723);
  assert.equal(tidpunktISekunder("https://sverigesradio.se/x?startTime=95"), 95);
  assert.equal(tidpunktISekunder("https://example.com/x?t=2:35"), 155);
});

test("noll är en tidpunkt, inte ett saknat värde", () => {
  assert.equal(tidpunktISekunder("https://www.svtplay.se/video/x?position=0"), 0);
  assert.notEqual(tidpunktISekunder("https://www.svtplay.se/video/x?position=0"), null);
});

test("utan tidpunkt är svaret null, inte noll", () => {
  assert.equal(tidpunktISekunder("https://www.svtplay.se/video/KnDABAQ/ebba-busch-kd"), null);
  assert.equal(tidpunktISekunder(""), null);
});

test("tidpunkten skrivs som en läsare läser den", () => {
  assert.equal(tidpunktSomText(377), "6.17");
  assert.equal(tidpunktSomText(95), "1.35");
  assert.equal(tidpunktSomText(3723), "1.02.03");
  assert.equal(tidpunktSomText(0), "0.00");
});

const SANDNING = "https://www.svtplay.se/video/KnDABAQ/almedalen-partiledartal/ebba-busch-kd";

/**
 * Beslutet 2026-08-09: **avskrift och tidsstämpel**, eller en alternativ källa.
 *
 * Det skärper beslutet från 2026-08-08, som lät tidsstämpeln ensam räcka. En
 * tidsstämpel säger var i sändningen orden finns, aldrig att de finns — den som
 * vill kontrollera måste fortfarande lyssna. Avskriften är text och går att
 * pröva ord för ord.
 */
test("tidsstämpeln ensam räcker inte längre — avskriften är det som gör citatet kontrollerbart", () => {
  assert.equal(provaTaladKalla(`${SANDNING}?position=377`, true), "talad-belagd");
  assert.equal(provaTaladKalla(`${SANDNING}?position=377`, false), "talad-utan-avskrift");
  assert.equal(provaTaladKalla(`${SANDNING}?position=377`), "talad-utan-avskrift");
});

test("utan tidsstämpel faller posten på tidpunkten, oavsett avskrift", () => {
  assert.equal(provaTaladKalla(SANDNING), "talad-utan-tid");
  assert.equal(provaTaladKalla(SANDNING, true), "talad-utan-tid");
});

test("en avskrift som inte bär citatet skiljs från ingen avskrift alls", () => {
  // `undefined` betyder att ingen avskrift är angiven, `false` att den hämtades
  // och inte bar citatet. Båda faller, men skälen är olika och åtgärden också.
  assert.equal(provaTaladKalla(`${SANDNING}?position=377`, undefined), "talad-utan-avskrift");
  assert.equal(provaTaladKalla(`${SANDNING}?position=377`, false), "talad-utan-avskrift");
});

test("avskriftens adress läses bara när den finns och inte är tom", () => {
  assert.equal(avskriftensAdress({ transcript_url: "https://exempel.se/avskrift" }), "https://exempel.se/avskrift");
  assert.equal(avskriftensAdress({ transcript_url: "   " }), null);
  assert.equal(avskriftensAdress({ transcript_url: null }), null);
  assert.equal(avskriftensAdress(undefined), null);
});
