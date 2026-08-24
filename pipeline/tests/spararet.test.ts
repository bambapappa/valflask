/**
 * Vad som får ligga i repot.
 *
 * **En symlänk kan inte committas hit.** En symlänk pekar på en sökväg som
 * finns på EN maskin. Hamnar den i repot får alla andra maskiner en trasig
 * länk — och värre: en symlänk vars namn krockar med en katalog som byggs
 * lokalt låter `git reset --hard` lägga länken TILLBAKA ovanpå det som just
 * installerats.
 *
 * Det hände. `handlingsvagen/pipeline/node_modules` committades 2026-08-22 som
 * en symlänk till `/Users/…/Dev/projects/valflask/handlingsvagen/pipeline/
 * node_modules`. På runnern körde `foreslag`-arbetsflödet `npm ci`, arbetade i
 * femton minuter, gjorde `git reset --hard origin/main` inför pushen — och då
 * ersattes de installerade beroendena av symlänken. Nästa rad föll på «Cannot
 * find package 'tsx'», och eftersom även RÄDDNINGSSTEGET behöver tsx gick
 * ingenting alls i mål.
 *
 * **Kostnaden var två dygns kopplingssökning.** Prövade par stod på 7 978 från
 * 21 till 23 augusti, och G7 — det enskilt största kvarvarande arbetet i
 * Handlingsvågen — såg ut som en kö som inte betades av, när den i själva
 * verket var en trasig cron.
 *
 * `.gitignore` hade `node_modules/` med snedstreck, och det mönstret matchar
 * bara KATALOGER. Snedstrecket är borttaget nu, men ett ignoreringsmönster är
 * en rekommendation som `git add -f` och `git add -A` på en oväntad filtyp kan
 * gå förbi. Det här provet är spärren.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROT = resolve(import.meta.dirname, "../..");

/**
 * Tolkar utdata från `git ls-files -s`: `<läge> <hash> <steg>\t<sökväg>`.
 *
 * Utbruten ur mätningen så att provet kan mata in ett känt fel. En grind som
 * bara ser ett rent bestånd kan inte skiljas från en som inte mäter.
 */
export const tolka = (utdata: string): Array<{ lage: string; sokvag: string }> =>
  utdata
    .split("\n")
    .filter(Boolean)
    .map((r) => {
      const [meta, sokvag] = r.split("\t");
      return { lage: meta!.split(" ")[0]!, sokvag: sokvag! };
    });

/** Lägeskoden för en symlänk i gitens index. */
const SYMLANK = "120000";

export const symlankar = (rader: ReturnType<typeof tolka>): string[] =>
  rader.filter((f) => f.lage === SYMLANK).map((f) => f.sokvag);

export const underNodeModules = (rader: ReturnType<typeof tolka>): string[] =>
  rader.filter((f) => /(^|\/)node_modules(\/|$)/u.test(f.sokvag)).map((f) => f.sokvag);

const sparade = () => tolka(execFileSync("git", ["ls-files", "-s"], { cwd: ROT, maxBuffer: 1 << 28 }).toString());

describe("vad som ligger i repot", () => {
  it("hittar spårade filer att mäta", () => {
    assert.ok(sparade().length > 100, "en tom lista intygar ingenting");
  });

  it("provet biter mot ett infört fel", () => {
    // Exakt den rad git skrev för symlänken som dödade kopplingssökningen.
    const infort = tolka(
      "100644 abc 0\tpipeline/package.json\n120000 95eb129 0\thandlingsvagen/pipeline/node_modules\n",
    );
    assert.deepEqual(symlankar(infort), ["handlingsvagen/pipeline/node_modules"]);
    assert.deepEqual(underNodeModules(infort), ["handlingsvagen/pipeline/node_modules"]);
    assert.deepEqual(symlankar(tolka("100644 abc 0\tpipeline/package.json\n")), []);
  });

  it("ingen symlänk är spårad", () => {
    const lankar = symlankar(sparade()).map((sokvag) => ({ sokvag }));
    assert.deepEqual(
      lankar.map((f) => f.sokvag),
      [],
      "En symlänk pekar på en sökväg som bara finns på en maskin, och kan skriva över\n" +
        "det som byggts lokalt när git återställer trädet. Committa målet eller inget alls.",
    );
  });

  it("ingenting under node_modules är spårat", () => {
    const traff = underNodeModules(sparade()).map((sokvag) => ({ sokvag }));
    assert.deepEqual(
      traff.map((f) => f.sokvag),
      [],
      "Beroenden installeras, de committas inte.",
    );
  });
});
