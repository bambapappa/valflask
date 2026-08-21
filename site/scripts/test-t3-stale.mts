import { readFileSync, writeFileSync, existsSync, copyFileSync, renameSync, rmSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { taLaset } from "../../pipeline/src/datalas.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const DATA_DIR = resolve(ROOT, "data");
const SITE_DIR = resolve(ROOT, "site");
const DIST_DIR = resolve(SITE_DIR, "dist");

const PROMISES_PATH = resolve(DATA_DIR, "promises.json");
const BACKUP_PATH = resolve(DATA_DIR, "promises.json.bak");
const CHANGELOG_PATH = resolve(DATA_DIR, "changelog.json");
const CHANGELOG_BACKUP = resolve(DATA_DIR, "changelog.json.bak");

let errors = 0;

function fail(msg: string) {
  console.error(`FAIL: ${msg}`);
  errors++;
}

function check(label: string, condition: boolean, msg?: string) {
  if (condition) {
    console.log(`  OK: ${label}`);
  } else {
    fail(`${label}${msg ? ` — ${msg}` : ""}`);
  }
}

console.log("=== T3-stale: Stale banner verification ===");

// SÄKERHETSKOPIORNA ÄR INTE EN FÖRSIKTIGHETSÅTGÄRD — DE ÄR FÖRUTSÄTTNINGEN.
//
// Skriptet muterar de RIKTIGA datafilerna. Går de inte att lägga tillbaka
// står åldrat data kvar i arbetsträdet, och i CI kör pipeline.yml `git add
// data/` senare i samma jobb. Därför bokförs varje fil som muteras: var den
// ligger, var kopian ligger, och vilken hash originalet hade. Hashen är det
// som gör att återställningen kan KONTROLLERAS och inte bara försökas.
interface Skyddad {
  namn: string;
  path: string;
  backup: string;
  hash: string;
}
const skyddade: Skyddad[] = [];

function hashAv(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function skydda(path: string, backup: string): void {
  const hash = hashAv(path);
  copyFileSync(path, backup);
  skyddade.push({ namn: basename(path), path, backup, hash });
}

// Backup
if (!existsSync(PROMISES_PATH)) {
  fail("promises.json not found");
  process.exit(1);
}

// LÅSET TAS FÖRE SÄKERHETSKOPIAN, INTE EFTER.
//
// Från och med kopian äger det här skriptet data/: allt som skrivs av något
// annat härifrån och fram till återställningen försvinner spårlöst, för
// återställningen lägger tillbaka filerna som de såg ut FÖRE skrivningen.
//
// Det hände 2026-08-21. En indragning kördes medan sviten låg i bakgrunden;
// statusändringen och changelog-posten skrevs över, men rättelsen skrevs efteråt
// och blev kvar. Kvar stod en publicerad rättelse om en indragning som inte
// fanns. Se pipeline/src/datalas.ts.
//
// Låset släpps i `restoreData`, alltså i samma väg som återställningen — inte i
// en egen gren som kan missas när skriptet avslutas på något annat sätt.
const slappLas = taLaset(DATA_DIR, "sviten i site/ (test-t3-stale)");

skydda(PROMISES_PATH, BACKUP_PATH);

// Isolering: bevara befintlig dist/ så att efterföljande sviter (T9: data_hash-
// integritet) inte ser den stale-byggda varianten. Återställs i finally nedan.
const DIST_BACKUP = `${DIST_DIR}.pre-stale`;
rmSync(DIST_BACKUP, { recursive: true, force: true });
if (existsSync(DIST_DIR)) renameSync(DIST_DIR, DIST_BACKUP);

function restoreDist() {
  rmSync(DIST_DIR, { recursive: true, force: true });
  if (existsSync(DIST_BACKUP)) renameSync(DIST_BACKUP, DIST_DIR);
}

// Krashsäker återställning: skriptet muterar RIKTIGA datafiler, och en läcka
// blir committad produktionsdata i CI (pipeline.yml kör git add data/ senare
// i jobbet). Skyddet ligger i fyra lager:
//
//   1. allt efter backup i try/finally,
//   2. process.on("exit") som fångar process.exit och ohanterade undantag,
//   3. signalhanterare för SIGINT/SIGTERM/SIGHUP — ett avbrutet jobb, en
//      timeout i CI eller ett Ctrl-C lämnade förut åldrat data kvar,
//   4. data-clean-vakten sist i testkedjan, som backstop mot SIGKILL.
//
// Och framför allt: en återställning som INTE går igenom är numera ett hårt
// fel. Förut var den existsSync-vaktad och tyst — saknades kopian hoppades
// den över utan ett ord, skriptet avslutade med 0, och muterad data låg kvar
// i ett grönt test. 2026-08-20 var det nära på riktigt: 7 132 rader i
// promises.json och 3 498 rader i changelog.json följde med i en commit och
// backades i sista stund.
/** Byggets barnprocess medan den lever — signalhanterarna behöver kunna nå den. */
let bygget: ChildProcess | null = null;

let restored = false;
const restoreFel: string[] = [];

function restoreData() {
  if (restored) return;
  restored = true;
  for (const f of skyddade) {
    if (!existsSync(f.backup)) {
      // Fanns en kopia när vi började ska den finnas nu. Gör den inte det
      // är originalet borta, och det får aldrig passera tyst.
      restoreFel.push(`${f.namn}: säkerhetskopian ${basename(f.backup)} saknas — originalet kan inte läggas tillbaka`);
      continue;
    }
    try {
      renameSync(f.backup, f.path);
    } catch (e) {
      restoreFel.push(`${f.namn}: kunde inte läggas tillbaka — ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    // Att flytten inte kastade betyder inte att rätt innehåll står där.
    const nu = hashAv(f.path);
    if (nu !== f.hash) {
      restoreFel.push(`${f.namn}: innehållet stämmer inte efter återställning (${f.hash.slice(0, 12)} → ${nu.slice(0, 12)})`);
    }
  }
  // Först när filerna ligger tillbaka är katalogen någon annans att skriva i.
  slappLas();
}

/**
 * Skriver ut vad som gick fel och säger om körningen ska falla.
 *
 * Anropas från tre håll — slutet, exit-handlaren och signalhanterarna — och
 * alla tre kan löpa i samma avslut. Utskriften sker därför en gång; svaret
 * ges varje gång.
 */
let rapporterat = false;
function restoreMisslyckades(): boolean {
  if (restoreFel.length === 0) return false;
  if (rapporterat) return true;
  rapporterat = true;
  console.error("");
  console.error("!! ÅTERSTÄLLNINGEN GICK INTE IGENOM — data/ kan innehålla åldrat testdata:");
  for (const rad of restoreFel) console.error(`   ${rad}`);
  console.error("   Kontrollera arbetsträdet innan du committar: git status data/");
  return true;
}

process.on("exit", () => {
  restoreData();
  // Sista utvägen. Avslutar skriptet på något annat sätt än via den vanliga
  // vägen sist i filen är det HÄR felet måste bli synligt — en tyst
  // återställning som inte tog skulle annars ge ett grönt test med åldrat
  // data kvar. Node låter exitCode sättas i den här handlaren.
  if (restoreMisslyckades()) process.exitCode = 1;
});

// process.on("exit") fångar INTE signaler. Ett jobb som slår i CI:s
// timeout-tak, eller en människa som trycker Ctrl-C, lämnade förut muterad
// data kvar i arbetsträdet — precis så sabbades data/ 2026-08-20. Vi städar
// först och avslutar sedan med den kod ett avbrott ska ge (128 + signalnr).
const SIGNALER = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 } as const;
for (const [namn, kod] of Object.entries(SIGNALER)) {
  process.on(namn as NodeJS.Signals, () => {
    console.error(`\n${namn} — städar undan testdata innan avslut.`);
    // Bygget är ett eget barn och dör inte av att VI får signalen. Lämnas
    // det kvar skriver det vidare i dist/ medan vi städar.
    bygget?.kill("SIGTERM");
    restoreData();
    restoreDist();
    process.exit(restoreMisslyckades() ? 1 : kod);
  });
}

try {
  // Modify fetched_at to >36h ago AND set at least one run_id to non-fixture
  // so that isFixture=false and stale banner can appear
  const OLD_DATE = new Date(Date.now() - (37 * 60 * 60 * 1000)).toISOString();
  const promises = JSON.parse(readFileSync(PROMISES_PATH, "utf8"));
  for (const p of promises) {
    if (p.source && p.source.fetched_at) {
      p.source.fetched_at = OLD_DATE;
    }
  }
  // Make all promises non-fixture so isFixture returns false
  for (const p of promises) {
    p.extraction.run_id = "pipeline-2026-06-01T00:00:00";
  }
  writeFileSync(PROMISES_PATH, JSON.stringify(promises, null, 2) + "\n");

  // "Senast uppdaterad" läses ur changeloggens senaste post — åldra den också,
  // annars ser sajten färsk ut fast promises är gamla.
  skydda(CHANGELOG_PATH, CHANGELOG_BACKUP);
  const changelog = JSON.parse(readFileSync(CHANGELOG_PATH, "utf8"));
  for (const entry of changelog) {
    entry.timestamp = OLD_DATE;
  }
  writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2) + "\n");

  // Build
  console.log("\n--- Building with stale data ---");
  // BYGGET FÅR INTE BLOCKERA EVENT-LOOPEN.
  //
  // Det här stod förut som `execSync`, och det gjorde signalhanterarna ovan
  // verkningslösa under just den fas där de behövs mest: en synkron
  // barnprocess blockerar loopen, så SIGTERM köas och hanteraren kör först
  // när bygget ändå är klart. Mätt 2026-08-20 — processen låg kvar i
  // execSync i över en halv minut efter signalen, och en runner som skickar
  // SIGKILL efter sin frist hade hunnit döda den med åldrat data kvar på
  // disk. Bygget är den längsta fasen och därmed den troligaste tidpunkten
  // för ett avbrott; det var också där data/ sabbades på riktigt.
  //
  // Som eget barn med await andas loopen, hanteraren kör direkt, och bygget
  // går att avbryta i stället för att inväntas.
  await new Promise<void>((klar) => {
    bygget = spawn("pnpm", ["build"], { cwd: SITE_DIR, stdio: "inherit" });
    bygget.on("error", () => {
      fail("Build failed with stale data");
      bygget = null;
      klar();
    });
    bygget.on("close", (kod) => {
      if (kod !== 0) fail("Build failed with stale data");
      bygget = null;
      klar();
    });
  });

  if (errors === 0) {
    // Check stale banner
    console.log("\n--- Checking stale banner ---");
    const indexPath = resolve(DIST_DIR, "index.html");
    if (existsSync(indexPath)) {
      const content = readFileSync(indexPath, "utf8");
      const hasStaleBanner = content.includes("Senast uppdaterad") && content.includes("data kan vara inaktuell");
      check("stale banner present in index.html", hasStaleBanner);
      // Ensure it does NOT show fixture text
      const hasFixture = content.includes("EXEMPELDATA");
      if (hasFixture) {
        check("fixture banner NOT shown when stale (fixture=false)", !hasFixture);
      }
    } else {
      fail("index.html not found in dist");
    }
  }
} finally {
  restoreData();
  restoreDist();
}

// En misslyckad återställning är minst lika allvarlig som en fallen kontroll:
// den lämnar åldrat data i arbetsträdet, och nästa steg i kedjan committar
// det. Den räknas därför som ett fel och inte som en varning.
if (restoreMisslyckades()) errors++;

console.log("");
console.log(errors === 0 ? "T3-stale: ALL CHECKS PASSED" : `T3-stale: ${errors} FAILURES`);
process.exit(errors);
