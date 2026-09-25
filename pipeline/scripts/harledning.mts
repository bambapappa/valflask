/**
 * Läsande härledningsvy för ett löfte.
 *
 *   pnpm harledning --id p-2026-2450
 *   pnpm harledning --id p-2026-2450 --json
 *
 * Skriver ingenting. Saknar löftet en strukturerad härledning visas den fria
 * uträkningstexten, och vyn säger uttryckligen att strukturen saknas — en
 * ostrukturerad kalkyl ska inte se strukturerad ut.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { harledningsvy, type Kalkyl } from "../src/harledningen.ts";

const ROOT = resolve(import.meta.dirname, "../../");
const args = process.argv.slice(2);
const varde = (flagga: string): string | undefined => {
  const i = args.indexOf(flagga);
  return i === -1 ? undefined : args[i + 1];
};

const id = varde("--id");
if (!id) {
  console.error("Ange --id p-2026-XXXX");
  process.exit(2);
}

const loften = JSON.parse(
  readFileSync(join(ROOT, "data/promises.json"), "utf8"),
) as Array<{ id: string; title: string; status: string; cost: Kalkyl }>;
const lofte = loften.find((p) => p.id === id);
if (!lofte) {
  console.error(`Löftet ${id} finns inte i data/promises.json`);
  process.exit(1);
}

const vy = harledningsvy(lofte.cost);
if (args.includes("--json")) {
  console.log(JSON.stringify({ id: lofte.id, titel: lofte.title, status: lofte.status, vy }, null, 2));
} else {
  console.log(`${lofte.id} — ${lofte.title} (${lofte.status})`);
  console.log(`Belopp: ${vy.belopp}`);
  console.log(`Årsprofil: ${vy.arsprofil}`);
  console.log(vy.strukturerad ? "Härledning:" : "Härledning saknas — fri uträkningstext:");
  for (const rad of vy.rader) {
    console.log(`  · ${rad.text}`);
    console.log(`      tal ${rad.tal} | år ${rad.ar}${rad.kalla ? ` | ${rad.kalla}` : ""}`);
  }
  if (vy.fynd.length > 0) {
    console.log("Fynd:");
    for (const f of vy.fynd) console.log(`  ! ${f.sort}: ${f.text}`);
  }
}
