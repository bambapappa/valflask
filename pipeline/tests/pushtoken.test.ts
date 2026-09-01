/**
 * En workflow som pushar ska aldrig lita på jobbstart-tokenen.
 *
 * App-tokens lever en timme. `actions/checkout` skriver in den token den fick
 * i git-configen, och den vinner över allt som sätts senare — så en körning
 * som tar längre tid än en timme pushar med en död token och svarar
 * «Invalid username or token». Körningens data är då förlorad: run
 * 28673246764 tappade en hel pipelinekörning så, och källrötebevakningen föll
 * på samma sak 2026-09-01 efter fyra timmar och tjugoen minuter.
 *
 * Rättelsen är tre saker tillsammans, och den håller bara om alla tre finns:
 *
 *   1. `persist-credentials: false` i checkouten — annars vinner den gamla.
 *   2. en FÄRSK token myntad efter det långa steget.
 *   3. `git remote set-url origin` med den färska tokenen, före pushen.
 *
 * Rättelsen gjordes en workflow i taget under sommaren, och stannade halvvägs:
 * sju av sjutton pushade fortfarande med jobbstart-tokenen 2026-09-01. Ingen
 * av dem föll — de är korta — men en fälla som bara är ofarlig så länge stegen
 * är snabba är en fälla som väntar. Det som inte mäts blir inte gjort.
 *
 * FÄLLS AV: att lägga till en workflow som pushar utan de tre delarna, eller
 * att sätta tillbaka `persist-credentials: true` i någon av dem.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const KATALOG = join(import.meta.dirname, "..", "..", ".github", "workflows");

/** Workflows som faktiskt pushar. */
function pushande(): Array<{ fil: string; text: string }> {
  return readdirSync(KATALOG)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((fil) => ({ fil, text: readFileSync(join(KATALOG, fil), "utf8") }))
    .filter(({ text }) => /^\s*.*\bgit push\b/mu.test(text));
}

/**
 * De som pushar med en APP-token — och bara de bär kravet.
 *
 * Kravet handlar om att app-tokens dör efter en timme. Den inbyggda
 * körningstokenen gör inte det: den lever så länge jobbet gör det, och en
 * workflow som pushar med den (release.yml taggar så) har inget att mynta om.
 * Att kräva ett myntningssteg av den vore att kräva en rättelse mot ett fel
 * den inte kan få.
 *
 * Undantaget är smalt med flit: det gäller filer som inte rör app-nycklarna
 * ALLS. Så snart en workflow tar `BOT_APP_ID` i sin hand gäller alla tre
 * kraven, och den kan inte slippa undan genom att bara stryka myntningen.
 */
function medApptoken(): Array<{ fil: string; text: string }> {
  return pushande().filter(({ text }) => /BOT_APP_ID|create-github-app-token/u.test(text));
}

describe("varje workflow som pushar bär en färsk token", () => {
  it("det finns workflows att pröva — annars mäter provet ingenting", () => {
    // Ett svep som inte hittar något svarar grönt på allt. Den formen har
    // fällt oss förut: prosagrinden krävde just därför att provet faller mot
    // ett blänkt repo.
    assert.ok(pushande().length >= 10, "hittade nästan inga pushande workflows — läser svepet rätt katalog?");
    assert.ok(medApptoken().length >= 10, "nästan inga pushar med app-token — undantaget har svällt");
  });

  it("ingen sparar checkoutens uppgifter", () => {
    const kvar = medApptoken().filter(({ text }) => /persist-credentials:\s*true/u.test(text));
    assert.deepEqual(
      kvar.map((k) => k.fil),
      [],
      "dessa pushar med jobbstart-tokenen sparad i git-configen — den vinner över den färska",
    );
  });

  it("var och en myntar en token och pekar om origin till den före pushen", () => {
    const brister: string[] = [];
    for (const { fil, text } of medApptoken()) {
      if (!/create-github-app-token/u.test(text)) {
        brister.push(`${fil}: bär app-nycklarna men myntar ingen token`);
        continue;
      }
      if (!/git remote set-url origin/u.test(text)) {
        brister.push(`${fil}: pekar aldrig om origin till den färska tokenen`);
        continue;
      }
      // Omkopplingen måste stå FÖRE pushen. Står den efter är den verkningslös,
      // och filen ser ändå rätt ut för de två proven ovan.
      const iOmkoppling = text.indexOf("git remote set-url origin");
      const iPush = text.search(/\bgit push\b/u);
      if (iOmkoppling > iPush) brister.push(`${fil}: pekar om origin EFTER pushen`);
    }
    assert.deepEqual(brister, [], "workflows som kan pusha med en död token");
  });
});
