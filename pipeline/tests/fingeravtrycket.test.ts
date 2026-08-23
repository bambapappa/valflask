/**
 * Fingeravtrycket sajten publicerar ska stämma med datat.
 *
 * `site/src/lib/aggregates.ts` tar changelogens SISTA `data_hash` och
 * `Layout.astro` skriver ut det på varje sida; API-kuvertet bär samma tal.
 * Det är sajtens påstående om vilket data läsaren ser.
 *
 * **Tvåstegscommiten river det, och det är därför provet finns.** Mönstret är:
 * skriv dataändringen med `"commit": "0000000"`, committa, backfilla den
 * riktiga hashen. Men backfillen skriver i `promises.json` — den fyller i
 * `commit` i historikposterna — och därmed ändras `computeDataHash`. Skrevs
 * changelogens post i STEG ETT bär den en hash för data som inte längre finns.
 *
 * Upptäckt 2026-08-23 vid en sammanslagning: changelogen sa
 * `5bf55c5b…`, datat hashade till `f44d103b…`, och ingenting hade fällt det.
 * Felet drabbar varje tvåstegscommit och inte bara den som hittade det.
 *
 * **Rättningen** är att backfillsteget också räknar om posten. Det gör
 * `scripts/backfilla-commit.mts`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeDataHash } from "../src/publish.ts";

const ROT = resolve(import.meta.dirname, "../..");

describe("fingeravtrycket", () => {
  it("changelogens sista data_hash stämmer med löftena", () => {
    const loften = JSON.parse(readFileSync(resolve(ROT, "data/promises.json"), "utf8"));
    const changelog = JSON.parse(readFileSync(resolve(ROT, "data/changelog.json"), "utf8")) as Array<{
      run_id: string;
      data_hash: string;
    }>;
    const sist = changelog[changelog.length - 1]!;
    assert.equal(
      sist.data_hash,
      computeDataHash(loften),
      `Sajten publicerar changelogens sista data_hash som datats fingeravtryck, och den\n` +
        `stämmer inte med löftena. Posten är «${sist.run_id}».\n\n` +
        "Har du nyss backfillat en commit-hash? Backfillen skriver i promises.json och\n" +
        "ändrar därmed hashen. Kör `pnpm backfilla-commit <kort-hash>`, som gör båda.",
    );
  });

  it("changelogen står i tidsordning", () => {
    // En sammanslagning som lägger två grenars poster efter varandra kan annars
    // lämna en äldre post sist, och då publiceras fel fingeravtryck.
    const changelog = JSON.parse(readFileSync(resolve(ROT, "data/changelog.json"), "utf8")) as Array<{
      run_id: string;
      timestamp: string;
    }>;
    const ur = changelog
      .map((e, i) => ({ e, i }))
      .filter(({ e, i }) => i > 0 && changelog[i - 1]!.timestamp > e.timestamp)
      .map(({ e, i }) => `${i}: ${e.run_id} (${e.timestamp}) efter ${changelog[i - 1]!.timestamp}`);
    assert.deepEqual(ur, [], `Poster i fel ordning:\n  ${ur.join("\n  ")}`);
  });
});
