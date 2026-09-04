/**
 * Verkställer en beslutad avvisningshög i löfteskön — en rad per post.
 *
 * VARFÖR DEN FINNS. Handlingsvågen har `avvisa-lista` för kopplingskön;
 * Fläskvågen hade ingen motsvarighet, och en genomgången kö fick avvisas med
 * ett kommando per post eller för hand i filen. Det första är långsamt, det
 * andra kringgår avvisningsminnet — och en avvisning utan minne hämtar
 * skörden tillbaka nästa körning.
 *
 * Skriptet kallar `reject()` en gång per post, alltså exakt samma kodväg som
 * `pnpm review reject`: låset tas, posten lyfts ur kön och skälet skrivs till
 * `data/avvisade.json`.
 *
 * FILFORMAT: JSON-lista med `{ "id": "<review-id>", "skal": "…" }`. Id:t är de
 * tolv tecken som `pnpm review list` skriver ut. Skälet är obligatoriskt och
 * ska gå att läsa för en utomstående — inga interna koder.
 *
 * TORRKÖRNING ÄR STANDARD. Utan `--skriv` prövas bara att varje id finns i
 * kön; ingenting ändras.
 *
 *   pnpm avvisa-lista -- <fil.json> [--skriv]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reject, reviewId } from "../src/review.ts";
import type { ReviewCandidate } from "../src/review.ts";

const fil = process.argv[2];
const skriv = process.argv.includes("--skriv");
if (!fil) {
  console.error("Användning: pnpm avvisa-lista -- <fil.json> [--skriv]");
  process.exit(1);
}

type Rad = { id: string; skal: string; titel?: string };
const poster = JSON.parse(readFileSync(fil, "utf8")) as Rad[];
const utanSkal = poster.filter((p) => !p.skal || p.skal.trim() === "");
if (utanSkal.length > 0) {
  console.error(`${utanSkal.length} rad(er) saknar skäl. Ett skäl är obligatoriskt — ingen post avvisas.`);
  process.exit(1);
}

const konFil = join(import.meta.dirname, "../../data/needs_review.json");
const kon = JSON.parse(readFileSync(konFil, "utf8")) as ReviewCandidate[];
const finns = new Set(kon.map((e) => reviewId(e)));
const saknade = poster.filter((p) => !finns.has(p.id));
if (saknade.length > 0) {
  console.error(`${saknade.length} id finns inte i kön — ingen post avvisas:`);
  for (const p of saknade.slice(0, 10)) console.error(`  ${p.id} ${p.titel ?? ""}`);
  process.exit(1);
}

console.log(`${poster.length} poster. ${skriv ? "SKRIVER." : "Torrkörning — kör om med --skriv."}`);
if (!skriv) process.exit(0);
for (const p of poster) reject(p.id, p.skal);
console.log(`${poster.length} avvisade.`);
