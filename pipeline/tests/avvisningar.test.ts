import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avvisningsnyckel,
  arAvvisad,
  avvisa,
  hav,
  slaUpp,
  type Avvisning,
} from "../src/avvisningar.ts";

const URL_ = "https://www.liberalerna.se/nyheter/rut-for-alla-over-70";
const CITAT = "Vi vill införa ett RUT-avdrag för alla över 70 år.";

test("nyckeln överlever ett ändrat kommatecken — det var hela skälet att normalisera", () => {
  assert.equal(
    avvisningsnyckel(URL_, "Vi vill införa ett RUT-avdrag för alla över 70 år."),
    avvisningsnyckel(URL_, "Vi vill införa ett RUT-avdrag, för alla över 70 år"),
  );
});

test("nyckeln överlever typografi, versaler och extra blanksteg", () => {
  assert.equal(
    avvisningsnyckel(URL_, CITAT),
    avvisningsnyckel(`${URL_}/`, "  VI VILL INFÖRA ETT RUT‑AVDRAG FÖR ALLA ÖVER 70 ÅR  "),
  );
});

test("nyckeln skiljer två olika citat på samma sida", () => {
  assert.notEqual(
    avvisningsnyckel(URL_, CITAT),
    avvisningsnyckel(URL_, "Vi vill sänka skatten på arbete för alla som jobbar."),
  );
});

test("nyckeln skiljer samma citat på två olika sidor", () => {
  assert.notEqual(avvisningsnyckel(URL_, CITAT), avvisningsnyckel("https://exempel.se/annat", CITAT));
});

test("en avvisad kandidat hålls ute ur kön", () => {
  const minne = avvisa([], URL_, CITAT, "Källan beskriver en redan framlagd budget.", "2026-08-09");
  assert.equal(arAvvisad(minne, URL_, CITAT), true);
  // Samma mening med ett ändrat tecken ska kännas igen — annars minns minnet inget.
  assert.equal(arAvvisad(minne, URL_, "Vi vill införa ett RUT-avdrag för alla över 70 år"), true);
});

test("en hävd avvisning håller ingen ute, och det ursprungliga skälet står kvar", () => {
  const minne = avvisa([], URL_, CITAT, "Bara ett uttalande i ett tal.", "2026-08-09");
  const havt = hav(minne, minne[0]!.nyckel, "Samma löfte står nu i valmanifestet och väger tyngre.", "2026-08-20");
  assert.ok(havt);
  assert.equal(arAvvisad(havt, URL_, CITAT), false);
  assert.equal(havt[0]!.skal, "Bara ett uttalande i ett tal.", "det gamla skälet får inte skrivas om");
  assert.equal(havt[0]!.havd?.skal, "Samma löfte står nu i valmanifestet och väger tyngre.");
  assert.equal(havt[0]!.havd?.datum, "2026-08-20");
});

test("posten går att slå upp även när den är hävd — historiken raderas aldrig", () => {
  const minne = avvisa([], URL_, CITAT, "Ett skäl.", "2026-08-09");
  const havt = hav(minne, minne[0]!.nyckel, "Ett annat skäl.", "2026-08-20")!;
  assert.equal(slaUpp(havt, URL_, CITAT)?.havd?.skal, "Ett annat skäl.");
  assert.equal(havt.length, 1, "hävningen får inte skapa en andra post");
});

test("att häva något som aldrig avvisats säger ifrån i stället för att hitta på", () => {
  assert.equal(hav([], "av:finns-inte", "skäl", "2026-08-09"), undefined);
});

test("en ny avvisning av något hävt gäller — och tar bort hävningen", () => {
  const minne = avvisa([], URL_, CITAT, "Första skälet.", "2026-08-09");
  const havt = hav(minne, minne[0]!.nyckel, "Släpps in igen.", "2026-08-20")!;
  const igen = avvisa(havt, URL_, CITAT, "Prövad på nytt och avvisad igen.", "2026-08-25");
  assert.equal(igen.length, 1);
  assert.equal(igen[0]!.havd, undefined);
  assert.equal(arAvvisad(igen, URL_, CITAT), true);
});

test("en kandidat som aldrig avvisats släpps igenom", () => {
  const minne: Avvisning[] = [];
  assert.equal(arAvvisad(minne, URL_, CITAT), false);
  assert.equal(slaUpp(minne, URL_, CITAT), undefined);
});
