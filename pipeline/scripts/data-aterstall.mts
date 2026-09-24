import { resolve } from "node:path";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { aterstallFilpaket } from "../src/datatransaktion.ts";
import { aterstallAnkarskuldpaket } from "../src/ankarskuldtransaktion.ts";
import { TRANSAKTION } from "../src/datalas.ts";

const [dir, val, ...extra] = process.argv.slice(2);
if (!dir || val !== "--skriv" || extra.length > 0) {
  console.error("Användning: pnpm data-aterstall <datakatalog> --skriv. Återställer journalens ursprungliga filer.");
  process.exit(1);
}
const dataDir = resolve(dir);
const journal = JSON.parse(readFileSync(join(dataDir, TRANSAKTION, "paket.json"), "utf8")) as { version?: string };
if (journal.version === "ankarskuldpaket/1") aterstallAnkarskuldpaket(dataDir);
else if (journal.version === "filpaket/1") aterstallFilpaket(dataDir);
else throw new Error("Okänd transaktionsjournal; inga filer ändrade");
console.log("Filpaketets ursprungliga filer är återställda och transaktionsspärren är borttagen.");
