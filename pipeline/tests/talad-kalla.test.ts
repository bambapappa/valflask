import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arTaladKalla,
  tidpunktISekunder,
  tidpunktSomText,
  provaTaladKalla,
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

/**
 * Beslutet, prövat på de två verkliga fallen: `p-2026-0118` bär `?position=377`
 * och uppfyller kravet; `p-2026-0100` saknar tidpunkt och gör det inte.
 */
test("beslutet avgör på tidpunkten, inte på ögonblicksbilden", () => {
  assert.equal(
    provaTaladKalla(
      "https://www.svtplay.se/video/KnDABAQ/almedalen-partiledartal/ebba-busch-kd?position=377",
    ),
    "talad-med-tid",
  );
  assert.equal(
    provaTaladKalla("https://www.svtplay.se/video/KnDABAQ/almedalen-partiledartal/ebba-busch-kd"),
    "talad-utan-tid",
  );
});
