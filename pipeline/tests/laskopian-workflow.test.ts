/**
 * Den som publicerar ett löfte äger Handlingsvågens läskopia.
 *
 * Handlingsvågen läser en egen kopia av Fläskvågens löften, och
 * `laskopian.test.ts` fäller den så snart den glidit. Det provet mäter
 * TILLSTÅNDET, och det gör sitt jobb — men det upptäcker glidningen först när
 * den redan står på main. Vägen dit är alltid densamma: en workflow som
 * publicerar löften glömmer bygga om kopian.
 *
 * Det har hänt två gånger. `review-apply.yml` rättades 2026-08-30 efter fyra
 * bunter godkännanden på en dag som alla lämnade main röd. Rättelsen gjordes
 * bara där — och `review.yml` publicerar löften på precis samma sätt. Fyra
 * godkännanden via issue-kommentar den 2026-09-01 lämnade main röd igen, och
 * det syntes först när någon körde provsviten för hand.
 *
 * En rättelse som görs i en fil åt gången kommer tillbaka. Det här provet
 * mäter ORSAKEN i stället för följden: publicerar en workflow löften och
 * committar data, ska den också bygga om kopian.
 *
 * FÄLLS AV: att lägga till en workflow som kör ett publicerande skript och
 * committar `data/` utan att bygga om kopian, eller att ta bort bygget ur en
 * av dem som har det.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const KATALOG = join(import.meta.dirname, "..", "..", ".github", "workflows");

/**
 * Skripten som skriver ett nytt löfte i `promises.json`.
 *
 * Listan är med flit skriven i namn och inte härledd: ett nytt publicerande
 * skript ska tvinga fram ett medvetet tillägg här, inte glida in oförmärkt.
 */
const PUBLICERANDE = ["handle-review-comment", "apply-labeled-decisions", "review-verkstall"];

function workflows(): Array<{ fil: string; text: string }> {
  return readdirSync(KATALOG)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((fil) => ({ fil, text: readFileSync(join(KATALOG, fil), "utf8") }));
}

/** De som både publicerar ett löfte och committar resultatet. */
function publicerar(): Array<{ fil: string; text: string }> {
  return workflows().filter(
    ({ text }) => PUBLICERANDE.some((s) => text.includes(s)) && /\bgit add\b[^\n]*\bdata\//u.test(text),
  );
}

describe("en workflow som publicerar löften bygger om Handlingsvågens läskopia", () => {
  it("det finns sådana workflows — annars mäter provet ingenting", () => {
    assert.ok(
      publicerar().length >= 2,
      "hittade inga publicerande workflows; har skripten bytt namn? Uppdatera PUBLICERANDE.",
    );
  });

  it("var och en av dem bygger om kopian", () => {
    const utan = publicerar()
      .filter(({ text }) => !text.includes("bygg-vendor"))
      .map((w) => w.fil);
    assert.deepEqual(
      utan,
      [],
      "dessa publicerar löften utan att bygga om läskopian — main blir röd av nästa beslut",
    );
  });

  it("bygget står före det som committar, annars committas den gamla kopian", () => {
    const felordning = publicerar()
      .filter(({ text }) => text.indexOf("bygg-vendor") > text.search(/\bgit add\b[^\n]*\bdata\//u))
      .map((w) => w.fil);
    assert.deepEqual(felordning, [], "bygget körs efter att filerna redan lagts till");
  });

  it("den som bygger om kopian committar den också", () => {
    // Bygget utan `git add handlingsvagen/data/` lämnar ändringen okommittad:
    // körningen ser grön ut, kopian ligger kvar gammal på main, och nästa
    // körning bygger om den igen till ingen nytta.
    const glomd = publicerar()
      .filter(({ text }) => !/\bgit add\b[^\n]*handlingsvagen\/data\//u.test(text))
      .map((w) => w.fil);
    assert.deepEqual(glomd, [], "dessa bygger om kopian men committar den aldrig");
  });
});
