/**
 * Hur mycket av det publicerade som gått genom kvalitetsfiltret.
 *
 * Läser det exporterade indexet `data/provningar.json` — inte granskningsloggen
 * själv, som ligger i ett privat repo. Måttet kan därför köras i bygget, och
 * det är hela poängen: filtret fanns som text i skillarna i ett dygn utan att
 * något mätte det, och täckningen stod på fyra av 1 382.
 *
 *   pnpm provningar:status          # tabellen
 *   pnpm provningar:status --tak    # utfallskod 1 om något oprövat publicerats
 *
 * `--tak` är spärren mot att det glider tillbaka: antalet oprövade får aldrig
 * växa. Går det upp har något publicerats förbi grinden, och då ska bygget
 * säga ifrån i stället för att låta det passera tyst.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { kanon, konyckel, koforslagId, lasProvningar, reviewNyckel, type Slag } from "../src/provningar.ts";

const DATA = join(import.meta.dirname, "../../data");
const HV_DATA = join(import.meta.dirname, "../../handlingsvagen/data");
const TAKFIL = join(DATA, "provningar-tak.json");

function las<T>(sokvag: string): T[] {
  return existsSync(sokvag) ? (JSON.parse(readFileSync(sokvag, "utf-8")) as T[]) : [];
}

type Sak = { nycklar: string[]; slag: Slag; obj: Record<string, unknown> };

const befolkning: Record<string, Sak[]> = {
  lofte: las<Record<string, unknown>>(join(DATA, "promises.json"))
    .filter((p) => p["status"] !== "tillbakadragen")
    .map((p) => {
      const url = (p["source"] as { url?: string } | undefined)?.url;
      return {
        // Samma tre identiteter som grinden godtar: löftets id, den
        // innehållshärledda kö-nyckeln, och kö-postens issue-id.
        nycklar: [
          String(p["id"]),
          konyckel(url, p["quote"] as string),
          reviewNyckel(url, p["title"] as string),
        ],
        slag: "lofte" as const,
        obj: p,
      };
    }),
  koppling: las<Record<string, unknown>>(join(HV_DATA, "kopplingar.json"))
    .filter((k) => k["status"] !== "indragen")
    .map((k) => ({
      nycklar: [
        String(k["id"]),
        `ko:${koforslagId(k as unknown as { promise_id?: string; handling_id: string })}`,
      ],
      slag: "koppling" as const,
      obj: k,
    })),
  standpunkt: las<Record<string, unknown>>(join(DATA, "stances.json"))
    .filter((s) => {
      const pos = (s["current"] as { position?: string } | undefined)?.position;
      return pos !== undefined && pos !== null && pos !== "inget_tydligt_besked";
    })
    .map((s) => ({
      nycklar: [`${s["subquestion_id"]}::${s["party"]}`],
      slag: "standpunkt" as const,
      obj: s,
    })),
};

const provningar = lasProvningar(DATA);
const rader: { slag: string; aktuell: number; gammal: number; oprovad: number; summa: number }[] = [];

for (const [slag, saker] of Object.entries(befolkning)) {
  let aktuell = 0;
  let gammal = 0;
  for (const sak of saker) {
    const p = sak.nycklar.map((n) => provningar.get(n)).find((x) => x !== undefined);
    if (!p) continue;
    if (p.underlag_hash === kanon(sak.slag, sak.obj)) aktuell++;
    else gammal++;
  }
  rader.push({ slag, aktuell, gammal, oprovad: saker.length - aktuell - gammal, summa: saker.length });
}

const total = rader.reduce(
  (a, r) => ({
    aktuell: a.aktuell + r.aktuell,
    gammal: a.gammal + r.gammal,
    oprovad: a.oprovad + r.oprovad,
    summa: a.summa + r.summa,
  }),
  { aktuell: 0, gammal: 0, oprovad: 0, summa: 0 },
);

const p = (n: number, av: number) => (av ? ((n / av) * 100).toFixed(1) : "0.0");
console.log(`\n${"".padEnd(14)}${"aktuella".padStart(10)}${"gamla".padStart(8)}${"oprövade".padStart(10)}${"summa".padStart(8)}   täckning`);
console.log("─".repeat(60));
for (const r of rader) {
  console.log(
    `  ${r.slag.padEnd(12)}${String(r.aktuell).padStart(10)}${String(r.gammal).padStart(8)}` +
      `${String(r.oprovad).padStart(10)}${String(r.summa).padStart(8)}   ${p(r.aktuell, r.summa).padStart(5)} %`,
  );
}
console.log("─".repeat(60));
console.log(
  `  ${"allt".padEnd(12)}${String(total.aktuell).padStart(10)}${String(total.gammal).padStart(8)}` +
    `${String(total.oprovad).padStart(10)}${String(total.summa).padStart(8)}   ${p(total.aktuell, total.summa).padStart(5)} %`,
);
console.log("\n  aktuella = prövade, och saken har inte ändrats sedan dess");
console.log("  gamla    = prövade, men beloppet, citatet eller riktningen har ändrats efteråt");
console.log("  oprövade = har aldrig gått genom filtret\n");

if (!process.argv.includes("--tak")) process.exit(0);

// Spärren: oprövade får bli färre, aldrig fler.
const tak = existsSync(TAKFIL)
  ? (JSON.parse(readFileSync(TAKFIL, "utf-8")) as { oprovade: number }).oprovade
  : total.oprovad;

if (total.oprovad > tak) {
  console.error(
    `Fler oprövade än taket: ${total.oprovad} mot ${tak}.\n` +
      "Något har publicerats utan att gå genom kvalitetsfiltret. Pröva det, eller\n" +
      "dra tillbaka det — taket höjs inte för att göra bygget grönt.",
  );
  process.exit(1);
}

if (total.oprovad < tak) {
  writeFileSync(TAKFIL, JSON.stringify({ oprovade: total.oprovad }, null, 2) + "\n", "utf-8");
  console.log(`Taket sänkt: ${tak} → ${total.oprovad} oprövade. Committa data/provningar-tak.json.`);
}
