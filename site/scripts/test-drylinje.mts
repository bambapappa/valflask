/**
 * test-drylinje.mts — enhetstest för den torra raden (Option A) och den
 * deterministiska jämförelseuppsättningen. Neutralitetsgaranti: samma regel,
 * samma yttre form oavsett parti; humorn ligger i registret, aldrig i en vits
 * om sakfrågan/personen/partiet.
 */
import { dryLine, defaultComparisonIds } from "../src/lib/aggregates.ts";
import type { PromisePost, Constants } from "../src/lib/data";

let errors = 0;
function check(label: string, cond: boolean, msg?: string): void {
  if (cond) console.log(`  OK: ${label}`);
  else { console.error(`FAIL: ${label}${msg ? ` — ${msg}` : ""}`); errors++; }
}

const constants: Constants = {
  generated_note: "test",
  reformutrymme_msek_per_ar: { value: 80000, source_url: "x" },
  items: [
    { id: "ssk_arskostnad", label: "sjuksköterskelöner (en månad)", value: 43900, unit: "kr", kind: "vardaglig" },
    { id: "forbifart_sthlm", label: "Förbifart Stockholm, totalkostnad", value: 51_500_000_000, unit: "kr", kind: "infrastruktur" },
    { id: "enkrona_tjocklek_m", label: "tjocklek 1-krona", value: 0.00179, unit: "m", kind: "kosmisk" },
    { id: "avstand_manen_m", label: "månen", value: 384_400_000, unit: "m", kind: "kosmisk" },
  ],
} as unknown as Constants;

function p(msekBase: number, financed: boolean, parties: string[] = ["s"]): PromisePost {
  return {
    id: "p-2026-0001", parties, status: "aktiv",
    comparisons: [],
    financing_claimed: { described: financed, summary: null, msek: null },
    cost: { type: "utgift", period: "per_ar", msek_low: 0, msek_base: msekBase, msek_high: 0,
      basis: "llm_estimat", basis_url: null, method_note: "x", confidence: 0.4 },
  } as unknown as PromisePost;
}

console.log("=== Deterministisk jämförelseuppsättning (magnitud-medveten) ===");
// litet löfte (100 msek/år → 400 msek mandatperiod): bara vardaglig
check("litet löfte → bara sjuksköterskor", JSON.stringify(defaultComparisonIds(400_000_000, constants)) === JSON.stringify(["ssk_arskostnad"]));
// medel (200 msek/år → 800 msek): + Förbifart (≥1 % av 51,5 mdkr = 515 msek)
check("medelstort löfte → + Förbifart", defaultComparisonIds(800_000_000, constants).includes("forbifart_sthlm"));
// stort (800 mdkr): + månen (myntstapel ≥1 % av vägen)
check("mega-löfte → + månen", defaultComparisonIds(800_000_000_000, constants).includes("avstand_manen_m"));
check("litet löfte → INTE månen (annars brus)", !defaultComparisonIds(400_000_000, constants).includes("avstand_manen_m"));

console.log("\n=== Torra raden ===");
const stort = dryLine(p(200_000, false), constants); // 200 mdkr/år
check("stort löfte får jämförelse + finansieringsstatus", /Motsvarar .+\. Finansiering: ej angiven\./.test(stort), stort);
const litet = dryLine(p(100, true), constants); // 100 msek/år = 400 msek → nurses
check("finansiering angiven speglas", /Finansiering: angiven\.$/.test(dryLine(p(100, true), constants)));
const noll = dryLine(p(0, false), constants);
check("0-kostnadslöfte → 'ingen mätbar kostnad', inte 0,0 sjuksköterskor", noll.startsWith("Ingen mätbar kostnad i kassan."), noll);

console.log("\n=== Neutralitet: partiet påverkar inte raden ===");
const somS = dryLine(p(5000, false, ["s"]), constants);
const somSD = dryLine(p(5000, false, ["sd"]), constants);
const somV = dryLine(p(5000, false, ["v"]), constants);
check("identiskt belopp → IDENTISK rad oavsett parti (S=SD=V)", somS === somSD && somSD === somV, `${somS} | ${somSD} | ${somV}`);

console.log("");
console.log(errors === 0 ? "test-drylinje: ALLA GRÖNA" : `test-drylinje: ${errors} FEL`);
process.exit(errors === 0 ? 0 : 1);
