import { join, resolve } from "node:path";
import { forberedKalkylTillFil } from "../src/kalkylforslag.ts";
const [id, mal, skal, fil, ...extra] = process.argv.slice(2);
if (!id || !mal || !skal || !fil || extra.length) {
  throw new Error("Användning: pnpm kalkyl-forbered <review-id> <mål-id> <skäl> <privat förslagsfil>");
}
const forslag = forberedKalkylTillFil(join(import.meta.dirname, "../../data"), id, mal, skal, resolve(fil));
console.log(`Kalkylförslag sparat: ${forslag.hash}. Kö och publicerade data är oförändrade; sakprövning och mänskligt godkännande återstår.`);
