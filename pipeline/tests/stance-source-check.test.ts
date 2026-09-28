import test from "node:test";
import assert from "node:assert/strict";
import { CitatkontrollPerKalla } from "../src/stance-source-check.ts";

test("varje citat på samma sida prövas, medan sidan hämtas en gång", async () => {
  let hamtningar = 0;
  const kontroll = new CitatkontrollPerKalla(async () => {
    hamtningar++;
    return { text: "Vi vill sänka skatten. Vi vill bygga fler bostäder." };
  });
  const url = "https://exempel.se/politik";

  assert.equal(await kontroll.kontrollera(url, "Vi vill sänka skatten."), "ok");
  assert.equal(await kontroll.kontrollera(url, "Vi vill höja skatten."), "andrad");
  assert.equal(await kontroll.kontrollera(url, "Vi vill bygga fler bostäder."), "ok");
  assert.equal(hamtningar, 1);
  assert.equal(kontroll.antalKallor(), 1);
});

test("ett saknat eller oklart HTTP-svar ger inget citatutfall som kan stämplas ok", async () => {
  const borttagen = new CitatkontrollPerKalla(async () => ({ utfall: "borttagen" as const }));
  const oklart = new CitatkontrollPerKalla(async () => ({ utfall: "obestamd" as const }));
  assert.equal(await borttagen.kontrollera("https://exempel.se/borta", "Citat ett"), "borttagen");
  assert.equal(await borttagen.kontrollera("https://exempel.se/borta", "Citat två"), "borttagen");
  assert.equal(await oklart.kontrollera("https://exempel.se/oklar", "Citat"), "obestamd");
  const tomt = new CitatkontrollPerKalla(async () => ({ text: "En giltig sida" }));
  assert.equal(await tomt.kontrollera("https://exempel.se/tomt", " "), "obestamd");
});
