import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { sammanfogaKostnadOmkorning } from "../src/kostnad-omkorning-sammanfogning.ts";
import { lasFillage, skapaFilpaket, skrivFilpaket } from "../src/datatransaktion.ts";

const [basfil, resultatfil, aktuellFil] = process.argv.slice(2);
if (!basfil || !resultatfil || !aktuellFil) throw new Error("Ange basfil, resultatfil och aktuell köfil");
const las = (fil: string): unknown => JSON.parse(readFileSync(fil, "utf8"));
const mal = resolve(aktuellFil);
const dir = dirname(mal);
const namn = basename(mal);
const fore = lasFillage(dir, [namn]);
if (fore[namn] === null) throw new Error("Aktuell köfil saknas");
const sammanfogad = sammanfogaKostnadOmkorning(las(basfil), las(resultatfil), JSON.parse(fore[namn]!));
const efter = { [namn]: JSON.stringify(sammanfogad, null, 2) + "\n" };
skrivFilpaket(dir, skapaFilpaket(fore, efter));
