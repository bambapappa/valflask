import { resolve } from "node:path";
import { aterstallFilpaket } from "../src/datatransaktion.ts";

const [dir, val, ...extra] = process.argv.slice(2);
if (!dir || val !== "--skriv" || extra.length > 0) {
  console.error("Användning: pnpm data-aterstall <datakatalog> --skriv. Återställer journalens ursprungliga filer.");
  process.exit(1);
}
aterstallFilpaket(resolve(dir));
console.log("Filpaketets ursprungliga filer är återställda och transaktionsspärren är borttagen.");
