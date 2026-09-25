/**
 * Frågevågen — review-CLI för ståndpunktskön (data/stances_review.json).
 *
 *   pnpm stances:review                    lista kön med id, grindar och citat
 *   pnpm stances:review approve <id>       stoppas tills verifierat beslutspaket finns
 *   pnpm stances:review reject <id> <skäl> avvisa → kö och minne skrivs tillsammans
 *
 * Godkännande är avstängt här tills ett versionsbundet beslutspaket finns.
 * Avvisning kräver ett individuellt skäl och skriver kö och avvisningsminne
 * tillsammans genom ett journalfört filpaket.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type StanceCandidate, type StanceReviewEntry } from "../src/stance-pipeline.ts";
import { lasFillage, skrivFilpaket } from "../src/datatransaktion.ts";
import { forberedStandpunktsavvisning, stanceReviewId, STANDPUNKTSAVVISNINGSFILER } from "../src/standpunktsavvisning.ts";

const ROOT = resolve(import.meta.dirname, "../../");
const DATA = join(ROOT, "data");

const HARD_GATES = new Set(["G1", "G2", "G3", "G6", "G7", "G8"]);

const queue = JSON.parse(readFileSync(join(DATA, "stances_review.json"), "utf8")) as StanceReviewEntry[];

const [, , action, id, ...rest] = process.argv;

if (!action) {
  if (queue.length === 0) {
    console.log("Kön är tom.");
  }
  for (const e of queue) {
    const c = e.candidate as Partial<StanceCandidate>;
    const gates = e.failures.map((f) => f.gate).join(",") || "—";
    const hard = e.failures.some((f) => HARD_GATES.has(f.gate));
    console.log(
      `${stanceReviewId(e)}  [${gates}]${hard ? " (endast avvisning)" : ""}  ${c.party ?? "?"} · ${c.subquestion_id ?? "?"} · ${c.position ?? "?"}\n` +
        `              ”${(c.quote ?? "").slice(0, 90)}${(c.quote ?? "").length > 90 ? "…" : ""}”\n` +
        `              ${e.articleUrl}${e.verifyReason ? `\n              LLM B: ${e.verifyReason}` : ""}`,
    );
  }
  process.exit(0);
}

if (action !== "approve" && action !== "reject") {
  console.error(`Okänt kommando: ${action} (tillåtet: approve | reject)`);
  process.exit(1);
}
if (!id) {
  console.error("Ange post-id (kör utan argument för att lista kön).");
  process.exit(1);
}
if (action === "approve") {
  console.error("Ståndpunktspublicering är spärrad tills fryst sakprövning och verifierat mänskligt beslut kan bindas till exakt köpost och celler.");
  process.exit(1);
}

const idx = queue.findIndex((e) => stanceReviewId(e) === id);
if (idx === -1) {
  console.error(`Ingen köpost med id ${id}.`);
  process.exit(1);
}
const reason = rest.join(" ");
const fore = lasFillage(DATA, STANDPUNKTSAVVISNINGSFILER);
const paket = forberedStandpunktsavvisning(id, reason, fore, new Date());
skrivFilpaket(DATA, paket);
console.log(`Avvisad ${id}: ${reason}`);
