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
 * Nu jämförs mot commitens FÖRÄLDER: bara platshållare som INTE fanns i
 * versionen före din ändring räknas som dina. Fanns de redan är de någon
 * annans halvfärdiga par, och de rörs inte — de rättas med en härledning ur
 * historien, som `--alla-fran <fil>` tar emot.
 *
 * Jämförelsen gick först mot HEAD, och det var fel: backfillen körs EFTER
 * dataändringens commit, så HEAD är just den commiten och bär dina egna
 * platshållare. Fem av fem räknades som andras vid första verkliga körningen.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeDataHash } from "../src/publish.ts";
import { stampla } from "../src/backfillen.ts";

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
 * Filen som den såg ut FÖRE din dataändring — eller `null` när det inte finns
 * någon sådan version. `null` betyder «allt i trädet är ditt».
 *
 * **Jämförelsen går mot commitens FÖRÄLDER, inte mot HEAD.** Tvåcommit-mönstret
 * är: först committas dataändringen med platshållaren, sedan körs backfillen
 * med den commitens hash. Vid det laget ÄR dina platshållare i HEAD — HEAD är
 * ju just den commiten. Jämfördes det mot HEAD räknades varenda egen
 * platshållare som någon annans, och skriptet stämplade noll utan att något
 * annat än en rad i utskriften sa ifrån.
 *
 * Mätt 2026-09-02, på det första par som kördes efter att jämförelsen infördes:
 * fem egna platshållare, noll stämplade. Föräldern är rätt jämförelse och den
 * enda som svarar på frågan skriptet ställer — vad fanns här innan du skrev?
 *
 * Regeln för vad som är ditt bor i `src/backfillen.ts` och prövas där, utan
 * git och utan delprocess. Det här är bara hämtningen.
 */
function committat(fil: string): unknown | null {
  if (alla) return null;
  try {
    return JSON.parse(
      execFileSync("git", ["show", `${kort}^:data/${fil}`], { encoding: "utf8", maxBuffer: 1 << 30 }),
    );
  } catch {
    // Filen är ny, eller commiten saknar förälder — då är allt i den ditt.
    return null;
  }
}

const innehall = new Map(filer.map((f) => [f, JSON.parse(readFileSync(join(DATA, f), "utf8"))]));
let bytta = 0;
let hoppade = 0;
for (const f of filer) {
  const r = stampla(innehall.get(f), committat(f), kort);
  bytta += r.bytta;
  hoppade += r.hoppade;
}

if (hoppade > 0) {
  console.log(
    `${hoppade} platshållare lämnade orörda — de fanns före din ändring och är alltså inte dina.\n` +
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
