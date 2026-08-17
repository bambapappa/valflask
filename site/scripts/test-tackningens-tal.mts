/**
 * test-tackningens-tal.mts — täckningstalen stämmer, OCH de når läsaren.
 *
 * Två halvor, och den andra finns för att den första inte räckte. Samma dag
 * som väntanraden byggdes höll funktionen sitt tal medan Astro-bygget gav 0,
 * raden renderades aldrig, och sidan påstod tyst att ingen väntade. Alla
 * grindar var gröna. Ett tal som stämmer i en funktion men inte i sidan är
 * ingenting värt — därför läses den BYGGDA sidan här.
 *
 *   pnpm test:tackning
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { tackningensTal, sidorFor } from "../src/lib/tackningens-tal.ts";

const ROT = resolve(import.meta.dirname, "..");
let fel = 0;
function check(etikett: string, villkor: boolean, varfor?: string): void {
  if (villkor) console.log(`  OK: ${etikett}`);
  else {
    console.error(`FAIL: ${etikett}${varfor ? ` — ${varfor}` : ""}`);
    fel++;
  }
}

/* ─────────────────────────── Halva 1 — talet stämmer med datat ───────── */

console.log("--- Täckningen: talet stämmer med seen.json ---");

const tal = tackningensTal();
const seen = JSON.parse(
  readFileSync(resolve(ROT, "../data/seen.json"), "utf8"),
) as Record<string, string>;

// Räknat en andra gång, med en annan metod än funktionens: alla adresser som
// bär partiets domän, unika på adressen. Två vägar till samma tal.
const kdSidor = new Set(
  Object.values(seen)
    .filter((u) => u.includes("kristdemokraterna.se"))
    .map((u) => u.replace(/\/$/u, "")),
).size;

check(
  `kd: funktionen säger ${sidorFor(tal, "kd")}, en oberoende räkning ${kdSidor}`,
  sidorFor(tal, "kd") === kdSidor,
);
check(
  "funktionen hittar datat — inte noll när seen.json har poster",
  tal.per_parti.length > 0 && tal.mest > 0,
  "returnerade tomt fast seen.json har innehåll",
);
check(
  "mest och minst pekar ut olika partier så länge täckningen är ojämn",
  tal.mest === tal.minst || tal.mestKod !== tal.minstKod,
);
check(
  "samma sida hämtad om räknas en gång",
  sidorFor(tal, "kd") <
    Object.values(seen).filter((u) => u.includes("kristdemokraterna.se")).length,
  "seen.json har flera poster per adress när en sida ändrats; de får inte räknas var för sig",
);

/* ─────────────────────────── Halva 2 — talet når den byggda sidan ────── */

console.log("\n--- Och talen når de byggda sidorna ---");

const metod = resolve(ROT, "dist/metod/index.html");
const start = resolve(ROT, "dist/index.html");

if (!existsSync(metod) || !existsSync(start)) {
  console.error("FAIL: bygget saknas — kör pnpm build först");
  process.exit(1);
}

const metodHtml = readFileSync(metod, "utf8");
const startHtml = readFileSync(start, "utf8");

check(
  "metodsidan bär avsnittet om ojämn täckning",
  metodHtml.includes("Vi har läst olika mycket om olika partier"),
);
check(
  `metodsidan bär samma tal som datat: ${tal.mest}`,
  new RegExp(`${tal.mest}\\s*lästa sidor`, "u").test(metodHtml),
  "talet i den byggda sidan matchar inte funktionens — samma fel som väntanraden hade",
);
check(
  "startsidan har kolumnen för lästa sidor",
  startHtml.includes("Sidor lästa"),
);
// Raden för ett parti, ur den byggda tabellen. Astro skriver egna attribut på
// varje tagg, så cellen kan inte matchas på exakt `<td class="num">N</td>`.
function sistaTaletPaRaden(html: string, partikod: string): number | null {
  const rad = new RegExp(`<tr[^>]*>(?:(?!</tr>).)*?/parti/${partikod}"(?:(?!</tr>).)*?</tr>`, "su")
    .exec(html)?.[0];
  if (!rad) return null;
  const tal = [...rad.matchAll(/<td[^>]*class="num"[^>]*>([\d\s]+)<\/td>/gu)].map((m) =>
    Number(m[1]!.replace(/\s/gu, "")),
  );
  return tal.length > 0 ? tal[tal.length - 1]! : null;
}

for (const kod of ["kd", "sd", "s"]) {
  check(
    `startsidans rad för ${kod} bär det riktiga talet ${sidorFor(tal, kod)}`,
    sistaTaletPaRaden(startHtml, kod) === sidorFor(tal, kod),
    `sidan visar ${sistaTaletPaRaden(startHtml, kod)} — räknades talet om i bygget?`,
  );
}
check(
  "noten under tabellen säger vad kolumnen betyder",
  startHtml.includes("sidor vi hunnit läsa på partiets egen webbplats"),
);

console.log(fel === 0 ? "\nTäckningens tal: grönt." : `\nTäckningens tal: ${fel} fel.`);
process.exit(fel > 0 ? 1 : 0);
