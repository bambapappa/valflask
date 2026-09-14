import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { byggSakunderlag, skapaSakprovning, type Sakreferens } from "../src/sakprovning.ts";
import type { FrystLoftesforslag, PromiseEntry } from "../src/loftesforslag.ts";
import type { ReviewCandidate } from "../src/review.ts";
import { createHash } from "node:crypto";
import { kanoniskJson } from "../src/underlagsversion.ts";

const [forslagsfil, referensfil, utfil, ...extra] = process.argv.slice(2);
if (!forslagsfil || !referensfil || !utfil || extra.length) {
  throw new Error("Användning: sakprovning-forbered <förslag.json> <referenser.json> <utkast.json>");
}
const data = join(import.meta.dirname, "../../data");
const las = (fil: string): unknown => JSON.parse(readFileSync(fil, "utf8"));
const forslag = las(forslagsfil) as FrystLoftesforslag;
const material = las(referensfil) as Sakreferens[];
const loften = las(join(data, "promises.json")) as PromiseEntry[];
const ko = las(join(data, "needs_review.json")) as ReviewCandidate[];
const matches = ko.filter((p) => createHash("sha256").update(kanoniskJson(p)).digest("hex") === forslag.fore.kopost);
if (matches.length !== 1) throw new Error("Förslagets exakta köpost saknas eller är dubblerad");
const underlag = byggSakunderlag(forslag, loften, matches[0]!, material);
const utkast = skapaSakprovning(underlag);
writeFileSync(utfil, JSON.stringify(utkast, null, 2) + "\n", { flag: "wx" });
console.log(`Sakprövningsutkast sparat: ${utfil}. Alla moment är oavgjorda; inget godkännande har skapats.`);
