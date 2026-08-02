/**
 * test-drylinje.mts — enhetstest för den torra raden (neutral vikt-liknelse).
 * Neutralitetsgaranti: samma belopp ger IDENTISK rad oavsett parti; djuret
 * beror bara på ämnesområdet (för omväxling), aldrig på partiet; och en fysisk
 * vikt-liknelse kan aldrig själv vara ett vallöfte (till skillnad från
 * sjuksköterskelöner/vårdplatser/skolluncher).
 */
import { readFileSync } from "node:fs";
import { computeComparisons, dryLine } from "../src/lib/aggregates.ts";
import type { PromisePost } from "../src/lib/data";

let errors = 0;
function check(label: string, cond: boolean, msg?: string): void {
  if (cond) console.log(`  OK: ${label}`);
  else { console.error(`FAIL: ${label}${msg ? ` — ${msg}` : ""}`); errors++; }
}

function p(msekBase: number, category: string, financed: boolean, parties: string[] = ["s"]): PromisePost {
  return {
    id: "p-2026-0001", parties, status: "aktiv", category,
    financing_claimed: { described: financed, summary: null, msek: null },
    cost: { type: "utgift", period: "per_ar", msek_low: 0, msek_base: msekBase, msek_high: 0,
      basis: "llm_estimat", basis_url: null, method_note: "x", confidence: 0.4 },
  } as unknown as PromisePost;
}

console.log("=== Vikt-liknelse: apolitiska djur, inga policy-måttstockar ===");
const välfärd = dryLine(p(50_000, "välfärd", false)); // 50 mdkr/år → 200 mdkr
check("väger i djur, konceit 'om varje krona vägde ett gram'", /Om varje krona vägde ett gram skulle löftet väga ungefär .+\. Finansiering:/.test(välfärd), välfärd);
check("välfärd → blåval (ämnesspecifikt djur)", välfärd.includes("blåval"), välfärd);
check("försvar → afrikansk elefant", dryLine(p(10_000, "försvar", false)).includes("elefant"));
check("migration → giraff", dryLine(p(2_000, "migration", false)).includes("giraff"));
check("inga policy-måttstockar (sjuksköterskor/vårdplatser/skolluncher)",
  !/sjukskötersk|vårdplats|skolmål|lärarlön/.test(dryLine(p(50_000, "välfärd", false)) + dryLine(p(50_000, "utbildning", false))));

console.log("\n=== Finansieringsstatus + 0-kostnad ===");
check("finansiering angiven speglas", /Finansiering: angiven\.$/.test(dryLine(p(5_000, "skatter", true))));
check("finansiering ej angiven speglas", /Finansiering: ej angiven\.$/.test(dryLine(p(5_000, "skatter", false))));
const noll = dryLine(p(0, "migration", false));
check("0-kostnad → 'ingen mätbar kostnad', inget djur", noll.startsWith("Ingen mätbar kostnad i kassan.") && !/val|elefant|giraff/.test(noll), noll);

console.log("\n=== Policy-måttstockar kan inte nå läsaren ===");
// Två oberoende spärrar, för att neutraliteten inte ska vila på att datat
// råkar se rätt ut. Före 2026-08-01 fanns bara den första sortens skydd, och
// då hade en enda rad i ett löftes comparisons-lista räckt för att sätta
// "1,5 miljoner sjuksköterskelöner" på den publika sajten.
const konstanter = JSON.parse(
  readFileSync(new URL("../../data/constants.json", import.meta.url), "utf-8"),
) as { items: Array<{ id: string; label: string; kind: string }> };

const FÖRBJUDET = /sjukskötersk|vårdplats|vårdcentral|skolmål|skollunch|lärarlön|lön|förbifart|gripen|jas\b/i;
const smugglade = konstanter.items.filter(
  (it) => FÖRBJUDET.test(it.id) || FÖRBJUDET.test(it.label),
);
check(
  "datat: ingen konstant är en policy-måttstock",
  smugglade.length === 0,
  smugglade.map((it) => it.id).join(", "),
);
check(
  "datat: alla konstanter är fysiska storheter (kind = kosmisk)",
  konstanter.items.every((it) => it.kind === "kosmisk"),
  konstanter.items.filter((it) => it.kind !== "kosmisk").map((it) => `${it.id}:${it.kind}`).join(", "),
);

// Koden håller även om någon lägger tillbaka en post i datat.
const smugglad = {
  generated_note: "",
  reformutrymme_msek_per_ar: { value: 80_000, source_url: "x", source_date: "" },
  items: [
    { id: "enkrona_tjocklek_m", label: "tjocklek 1-krona", value: 0.00179, unit: "m", kind: "kosmisk", source_url: "x", source_date: "" },
    { id: "ssk_arskostnad", label: "sjuksköterskelöner (en månad)", value: 43_900, unit: "kr", kind: "vardaglig", source_url: "x", source_date: "" },
    { id: "jas39e_styck", label: "hela JAS 39E-notan", value: 47e9, unit: "kr", kind: "infrastruktur", source_url: "x", source_date: "" },
  ],
} as unknown as Parameters<typeof computeComparisons>[1];
const medSmuggladeIder = {
  ...p(50_000, "välfärd", false),
  comparisons: ["ssk_arskostnad", "jas39e_styck"],
} as unknown as PromisePost;
check(
  "koden: kurerade policy-måttstockar renderas ändå inte",
  computeComparisons(medSmuggladeIder, smugglad).length === 0,
  JSON.stringify(computeComparisons(medSmuggladeIder, smugglad)),
);

console.log("\n=== Neutralitet: partiet påverkar inte raden ===");
const somS = dryLine(p(5_000, "försvar", false, ["s"]));
const somSD = dryLine(p(5_000, "försvar", false, ["sd"]));
const somV = dryLine(p(5_000, "försvar", false, ["v"]));
check("identiskt belopp + kategori → IDENTISK rad oavsett parti (S=SD=V)", somS === somSD && somSD === somV, `${somS} | ${somSD} | ${somV}`);
check("okänd kategori faller tillbaka på övrigt-djur (valross)", dryLine(p(5_000, "påhittad", false)).includes("valross"));

console.log("");
console.log(errors === 0 ? "test-drylinje: ALLA GRÖNA" : `test-drylinje: ${errors} FEL`);
process.exit(errors === 0 ? 0 : 1);
