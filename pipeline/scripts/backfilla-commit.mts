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
 *
 * **BARA DINA EGNA PLATSHÅLLARE.** Skriptet stämplade tidigare varenda
 * `0000000` i filen med samma hash, oavsett vem som skrivit den. Ett par
 * sessioner hann inte sitt andra steg, och 376 främmande platshållare låg
 * kvar i trädet — ett anrop hade då tillskrivit dem alla en commit de inte
 * kom ur, och gjort 376 falska påståenden om var en ändring kommer ifrån.
 * Det upptäcktes 2026-09-01, när skriptet stämplade 389 i stället för 2 och
 * fick backas.
 *
 * Nu jämförs mot HEAD: bara platshållare som INTE fanns i den senast
 * committade versionen räknas som dina. Fanns de redan är de någon annans
 * halvfärdiga par, och de rörs inte — de rättas med en härledning ur
 * historien, som `--alla-fran <fil>` tar emot.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeDataHash } from "../src/publish.ts";

const DATA = join(import.meta.dirname, "../../data");
const argv = process.argv.slice(2);
const kort = argv.find((a) => !a.startsWith("--"));
// Nödutgång för den som medvetet vill stämpla allt, t.ex. i en engångsrättelse.
// Måste skrivas ut — tystnaden var felet.
const alla = argv.includes("--aven-andras");

if (!kort || !/^[0-9a-f]{7,40}$/u.test(kort)) {
  console.error("Ange commit-hashen: pnpm backfilla-commit <kort-hash>");
  process.exit(1);
}

const filer = ["promises.json", "rattelser.json", "changelog.json"] as const;

/**
 * Platshållarna som redan låg i den senast committade versionen.
 *
 * De är någon annans halvfärdiga par. Räknas de som dina tillskrivs de en
 * commit de inte kom ur — ett falskt påstående om var en ändring kommer
 * ifrån, och just det som gjorde att 389 stämplades i stället för 2.
 *
 * Jämförelsen görs på INNEHÅLL, inte på ordning. En tidig variant räknade hur
 * många platshållare HEAD hade och hoppade över så många i trädet — men det
 * antar att dina egna ligger sist. Lägger du en historikpost på ett tidigt
 * löfte hoppas din egen över och någon annans stämplas i stället: precis det
 * felet, med omvänt tecken. Nyckeln är i stället posten själv, serialiserad,
 * räknad som en multimängd så att två likalydande poster inte slår ihop.
 */
function redanICommittat(): Map<string, Map<string, number>> {
  const ut = new Map<string, Map<string, number>>();
  for (const f of filer) {
    const räknare = new Map<string, number>();
    ut.set(f, räknare);
    let text: string;
    try {
      text = execFileSync("git", ["show", `HEAD:data/${f}`], { encoding: "utf8", maxBuffer: 1 << 30 });
    } catch {
      // Filen är ny i det här trädet — då är allt i den ditt.
      continue;
    }
    samla(JSON.parse(text), räknare);
  }
  return ut;
}

/** Varje objekt som bär en platshållare, serialiserat, med antal. */
function samla(o: unknown, ut: Map<string, number>): void {
  if (Array.isArray(o)) {
    for (const x of o) samla(x, ut);
  } else if (o && typeof o === "object") {
    const r = o as Record<string, unknown>;
    if (r["commit"] === "0000000") {
      const n = JSON.stringify(r);
      ut.set(n, (ut.get(n) ?? 0) + 1);
    }
    for (const v of Object.values(r)) samla(v, ut);
  }
}

const fore = alla ? null : redanICommittat();

let bytta = 0;
let hoppade = 0;
const ersatt = (o: unknown, andras: Map<string, number> | undefined): void => {
  if (Array.isArray(o)) {
    for (const x of o) ersatt(x, andras);
  } else if (o && typeof o === "object") {
    const r = o as Record<string, unknown>;
    if (r["commit"] === "0000000") {
      const n = JSON.stringify(r);
      const kvar = andras?.get(n) ?? 0;
      if (kvar > 0) {
        andras!.set(n, kvar - 1);
        hoppade += 1;
      } else {
        r["commit"] = kort;
        bytta += 1;
      }
    }
    for (const v of Object.values(r)) ersatt(v, andras);
  }
};

const innehall = new Map(filer.map((f) => [f, JSON.parse(readFileSync(join(DATA, f), "utf8"))]));
for (const f of filer) {
  ersatt(innehall.get(f), fore?.get(f));
}

if (hoppade > 0) {
  console.log(
    `${hoppade} platshållare lämnade orörda — de låg redan i HEAD och är alltså inte dina.\n` +
      "  De är någon annans halvfärdiga par och rättas med en härledning ur historien.\n" +
      "  Vill du ändå stämpla dem: --aven-andras (och skriv ut varför).",
  );
}

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
