/**
 * Återställer tillbakadragna löften — en läst hög i en körning.
 *
 *   pnpm lofte-aterstall -- <fil> --revision <commit>
 *   pnpm lofte-aterstall -- <fil> --revision <commit> --skriv --varfor "…"
 *
 * En rad per löfte, två fält åtskilda av tabb:
 *
 *   p-2026-1629<TAB>att stoppa kringgåendet och att utvidga är två skilda åtgärder
 *
 * `--revision` är den commit beloppet hämtas ur — normalt den som gällde innan
 * indragningen. **Verktyget hittar aldrig på en siffra**; det lämnar tillbaka
 * den posten bar. Ska beloppet ändras är det `regelnollning` eller
 * `ankarsattning` som gäller, efteråt och synligt.
 *
 * Faller en enda rad skrivs ingenting.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeDataHash, type ChangelogEntry } from "../src/publish.ts";
import { svenskDag } from "../src/dagen.ts";
import {
  aterstall, mandatperioden, provaAterstallning,
  type Aterstallningslofte as Lofte, type Aterstallningsrad as Rad,
} from "../src/aterstallning.ts";

const ROT = join(import.meta.dirname, "../..");
const DATA = join(ROT, "data");
const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
const varde = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const varfor = varde("--varfor");
const revision = varde("--revision");
const fil = argv.find((a) => !a.startsWith("--") && a !== varfor && a !== revision);
const datum = svenskDag();

if (!fil || !revision) {
  console.error("Ange fil och revision: pnpm lofte-aterstall -- <fil> --revision <commit>");
  process.exit(1);
}

const rader: Rad[] = readFileSync(fil, "utf8")
  .split("\n").map((r) => r.replace(/\r$/u, ""))
  .filter((r) => r.trim() !== "" && !r.startsWith("#"))
  .map((r) => { const [id, skal] = r.split("\t"); return { id: (id ?? "").trim(), skal: (skal ?? "").trim() }; });

const loften = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Lofte[];
const nu = new Map(loften.map((p) => [p.id, p]));
const fore = new Map(
  (JSON.parse(execFileSync("git", ["show", `${revision}:data/promises.json`], { cwd: ROT, maxBuffer: 1 << 28 }).toString()) as Lofte[])
    .map((p) => [p.id, p]),
);

const fel: string[] = [];
for (const rad of rader) fel.push(...provaAterstallning(nu.get(rad.id), fore.get(rad.id), rad).fel);

let tillbaka = 0;
for (const rad of rader) {
  const g = fore.get(rad.id);
  const v = g ? mandatperioden(g) : 0;
  tillbaka += v;
  console.log(`${rad.id} [${((nu.get(rad.id) as { parties?: string[] })?.parties ?? []).join(",")}] återförs med ${v.toLocaleString("sv-SE")} msek för mandatperioden`);
  console.log(`     ${(nu.get(rad.id)?.title ?? "").slice(0, 76)}`);
  console.log(`     skäl: ${rad.skal}\n`);
}

if (fel.length > 0) {
  console.error(`FÄLLDA RADER (${fel.length}) — ingenting skrivet:`);
  for (const f of fel) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`${rader.length} löften · rikssumman ökar med ${tillbaka.toLocaleString("sv-SE")} msek`);
if (!skriv) { console.log("\nIngenting skrivet. Kör med --skriv för att verkställa."); process.exit(0); }
if (!varfor) { console.error("\n--skriv kräver --varfor."); process.exit(1); }

const nya = loften.map((p) => {
  const rad = rader.find((r) => r.id === p.id);
  return rad ? aterstall(p, fore.get(p.id)!, rad, datum) : p;
});

const rattelser = JSON.parse(readFileSync(join(DATA, "rattelser.json"), "utf8")) as unknown[];
rattelser.push({
  date: datum,
  affects: `Löftessidorna för ${rader.map((r) => r.id).join(", ")}`,
  what:
    `${rader.length} tillbakadragna löften är återställda. Indragningen var fel i varje fall, och ` +
    `beloppen är de posterna bar innan de drogs in — inga nya siffror. Rikssumman ökar med ` +
    `${tillbaka.toLocaleString("sv-SE")} miljoner kronor för mandatperioden. ` +
    rader.map((r) => `${(nu.get(r.id)?.title ?? "").slice(0, 60)}: ${r.skal}.`).join(" "),
  why: varfor,
  commit: "0000000",
});
const changelog = JSON.parse(readFileSync(join(DATA, "changelog.json"), "utf8")) as ChangelogEntry[];
changelog.push({
  run_id: `lofte-aterstall-${datum}`, added: [], updated: rader.map((r) => r.id), retracted: [],
  data_hash: computeDataHash(nya), timestamp: new Date().toISOString(),
});

writeFileSync(join(DATA, "promises.json"), JSON.stringify(nya, null, 2) + "\n");
writeFileSync(join(DATA, "rattelser.json"), JSON.stringify(rattelser, null, 2) + "\n");
writeFileSync(join(DATA, "changelog.json"), JSON.stringify(changelog, null, 2) + "\n");
console.log("\nSkrivet: promises.json, rattelser.json, changelog.json");
console.log("Kvar: pnpm backfilla-commit, bygg om läskopian, och skriv nya prövningar.");
