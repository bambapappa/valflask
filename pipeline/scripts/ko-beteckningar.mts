/**
 * Skriver om interna beteckningar i granskningskön till ord.
 *
 *   pnpm ko-beteckningar              # torrkörning, alltid först
 *   pnpm ko-beteckningar -- --skriv
 *
 * `cost.calculation` och `cost.method_note` visas på löftessidan, och spärren i
 * `publicerad-text.ts` vägrar publicera ett löftes-id eller en regelkod där.
 * Prissättningen skrev dem ändå: 103 kö-poster satt fast bakom spärren
 * 2026-08-25 — modellen skrev numret, grinden vägrade publicera det, och ingen
 * väg fanns däremellan.
 *
 * Reglerna står i `src/beteckningar.ts`. Ett löftes-id lyfts till
 * `cost.anchor_ids` och beskrivs i ord i texten; en regelkod skrivs ut som vad
 * regeln säger.
 *
 * RÖR BARA KÖN. Publicerade löften har sina egna verktyg — ankarpasset och
 * regelnollningen — och deras texter är rättelsepliktiga på ett annat sätt.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { internaBeteckningar } from "../src/publicerad-text.ts";
import { skrivOmBeteckningar, type Loftesuppgift } from "../src/beteckningar.ts";

const DATA = join(import.meta.dirname, "../../data");
const skriv = process.argv.includes("--skriv");

const ko = JSON.parse(readFileSync(join(DATA, "needs_review.json"), "utf8")) as Array<{
  candidate?: { title?: string };
  cost?: Record<string, unknown> | null;
}>;
const loften = new Map<string, Loftesuppgift>(
  (JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Loftesuppgift[]).map((p) => [p.id, p]),
);

let rorda = 0, kvar = 0, ankarsatta = 0;
const regelbruk = new Map<string, number>();

for (const post of ko) {
  const c = post.cost;
  if (!c) continue;
  if (internaBeteckningar(c as never, "").length === 0) continue;

  const ankare = new Set<string>((c["anchor_ids"] as string[] | undefined) ?? []);
  let andrad = false;
  for (const falt of ["calculation", "method_note"] as const) {
    const fore = c[falt] as string | null | undefined;
    if (typeof fore !== "string" || fore === "") continue;
    const r = skrivOmBeteckningar(fore, loften);
    if (r.text === fore) continue;
    c[falt] = r.text;
    for (const a of r.ankare) ankare.add(a);
    for (const nr of r.regler) regelbruk.set(nr, (regelbruk.get(nr) ?? 0) + 1);
    andrad = true;
  }
  if (!andrad) continue;

  if (ankare.size > 0 && (c["msek_base"] ?? 0) !== 0) {
    c["anchor_ids"] = [...ankare].sort();
    ankarsatta += 1;
  }
  rorda += 1;

  // Blev något kvar är omskrivningen inte klar, och posten ska INTE räknas som
  // lagad. Bättre att den syns här än att den faller vid godkännandet.
  const rest = internaBeteckningar(c as never, "");
  if (rest.length > 0) {
    kvar += 1;
    console.log(`KVAR  ${(post.candidate?.title ?? "").slice(0, 48)} — ${rest.join(", ")}`);
  }
}

console.log(`\n${rorda} kö-poster omskrivna · ${ankarsatta} fick ett ankare · ${kvar} bär fortfarande en beteckning`);
if (regelbruk.size > 0) {
  console.log(`regelkoder utskrivna: ${[...regelbruk].sort().map(([n, k]) => `regel ${n} (${k})`).join(", ")}`);
}

if (!skriv) {
  console.log("\nTorrkörning. Lägg till --skriv för att verkställa.");
  process.exit(0);
}
writeFileSync(join(DATA, "needs_review.json"), JSON.stringify(ko, null, 2) + "\n");
console.log("Skrivet: data/needs_review.json");
