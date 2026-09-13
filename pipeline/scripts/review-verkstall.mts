/** Förprövar hela beslutsordningen och skriver dess färdiga filpaket. */
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { forberedReviewverkstall } from "../src/reviewverkstallpaket.ts";
import { skrivFilpaket } from "../src/datatransaktion.ts";
import type { Beslut } from "../src/reviewbeslut.ts";
const args = process.argv.slice(2);
const fil = args.find((a) => !a.startsWith("--"));
if (!fil) throw new Error("Ange beslutsfilen: pnpm review-verkstall <beslutsfil> [--skriv]");
const rader = readFileSync(resolve(fil), "utf8").split("\n").filter((r) => r.trim()).map((r) => {
  const b = JSON.parse(r) as Beslut;
  if (b.underlagsfil) b.beslutsunderlag = JSON.parse(readFileSync(resolve(dirname(fil), b.underlagsfil), "utf8"));
  return b;
}).filter((b) => (b.spar ?? "review") === "review");
const dir = join(import.meta.dirname, "../../data");
const paket = forberedReviewverkstall(rader, dir);
if (!args.includes("--skriv")) {
  console.log("Hela beslutsordningen förprövad i isolerad kopia. Inga originaldata skrivna.");
} else {
  skrivFilpaket(dir, paket);
  console.log("Hela det förprövade filpaketet är verkställt. Publicering kräver fortfarande sitt godkännande.");
}
