/**
 * Räkna om changelogens sista `data_hash` mot löftena.
 *
 *   pnpm fingeravtryck
 *
 * Sajten publicerar den hashen som datats fingeravtryck. Den drivs isär varje
 * gång `promises.json` ändras efter att changelogposten skrevs.
 * `backfilla-commit` täcker det ena fallet — tvåstegscommiten. Det andra är
 * SAMMANSLAGNINGEN: main ändrar löften, grenen ändrar changelogen, och
 * sammanslagningen tar båda utan att någon räknat om talet. Så upptäcktes
 * felet första gången, och så återkom det 2026-08-24 när 2 687 löften fick ny
 * källstatus på main.
 *
 * Skriptet gör bara omräkningen. Har du platshållare att fylla i är
 * `pnpm backfilla-commit <hash>` rätt verktyg — det gör båda leden i rätt
 * ordning.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeDataHash } from "../src/publish.ts";

const DATA = join(import.meta.dirname, "../../data");

const loften = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as unknown[];
const changelog = JSON.parse(readFileSync(join(DATA, "changelog.json"), "utf8")) as Array<{
  run_id: string;
  data_hash: string;
}>;

const sist = changelog[changelog.length - 1];
if (sist === undefined) {
  console.error("Changelogen är tom — det finns ingen post att räkna om.");
  process.exit(1);
}

const ratt = computeDataHash(loften);
if (sist.data_hash === ratt) {
  console.log(`Fingeravtrycket stämde redan: ${ratt}`);
  process.exit(0);
}

const forut = sist.data_hash;
sist.data_hash = ratt;
writeFileSync(join(DATA, "changelog.json"), JSON.stringify(changelog, null, 2) + "\n");
console.log(`«${sist.run_id}»: ${forut} → ${ratt}`);
