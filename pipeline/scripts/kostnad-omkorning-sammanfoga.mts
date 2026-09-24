import { readFileSync, writeFileSync } from "node:fs";
import { sammanfogaKostnadOmkorning } from "../src/kostnad-omkorning-sammanfogning.ts";

const [basfil, resultatfil, aktuellFil] = process.argv.slice(2);
if (!basfil || !resultatfil || !aktuellFil) throw new Error("Ange basfil, resultatfil och aktuell köfil");
const las = (fil: string): unknown => JSON.parse(readFileSync(fil, "utf8"));
const sammanfogad = sammanfogaKostnadOmkorning(las(basfil), las(resultatfil), las(aktuellFil));
writeFileSync(aktuellFil, JSON.stringify(sammanfogad, null, 2) + "\n");
