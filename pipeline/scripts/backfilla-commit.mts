/**
 * Andra steget i tvåstegscommiten: fyll i den riktiga commit-hashen.
 *
 *   pnpm backfilla-commit <kort-hash>
 *
 * Dataändringar skrivs med `"commit": "0000000"` därför att hashen inte finns
 * förrän commiten är gjord. Det här skriptet byter ut platshållaren i
 * `promises.json`, `rattelser.json` och `changelog.json`.
 *
 * **Och räknar om changelogens sista `data_hash`.** Det ledet är hela skälet
 * att skriptet finns i stället för en `sed`: backfillen SKRIVER i
 * `promises.json`, så hashen som skrevs i steg ett gäller inte längre. Sajten
 * publicerar den hashen som datats fingeravtryck, så en glömd omräkning är ett
 * publicerat felaktigt påstående om vilket data läsaren ser.
 * `tests/fingeravtrycket.test.ts` fäller det numera.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeDataHash } from "../src/publish.ts";

const DATA = join(import.meta.dirname, "../../data");
const kort = process.argv.slice(2).find((a) => !a.startsWith("--"));

if (!kort || !/^[0-9a-f]{7,40}$/u.test(kort)) {
  console.error("Ange commit-hashen: pnpm backfilla-commit <kort-hash>");
  process.exit(1);
}

let bytta = 0;
const ersatt = (o: unknown): void => {
  if (Array.isArray(o)) {
    for (const x of o) ersatt(x);
  } else if (o && typeof o === "object") {
    const r = o as Record<string, unknown>;
    for (const [k, v] of Object.entries(r)) {
      if (k === "commit" && v === "0000000") {
        r[k] = kort;
        bytta += 1;
      } else ersatt(v);
    }
  }
};

const filer = ["promises.json", "rattelser.json", "changelog.json"] as const;
const innehall = new Map(filer.map((f) => [f, JSON.parse(readFileSync(join(DATA, f), "utf8"))]));
for (const f of filer) ersatt(innehall.get(f));

// Ordningen spelar roll: hashen ska räknas på löftena EFTER bytet.
const loften = innehall.get("promises.json") as unknown[];
const changelog = innehall.get("changelog.json") as Array<{ run_id: string; data_hash: string }>;
const sist = changelog[changelog.length - 1];
const ratt = computeDataHash(loften);
const rord = sist !== undefined && sist.data_hash !== ratt;
if (sist !== undefined) sist.data_hash = ratt;

for (const f of filer) writeFileSync(join(DATA, f), JSON.stringify(innehall.get(f), null, 2) + "\n");

console.log(`${bytta} platshållare → ${kort}`);
console.log(rord ? `changelogens sista data_hash omräknad → ${ratt}` : "changelogens data_hash stämde redan");
