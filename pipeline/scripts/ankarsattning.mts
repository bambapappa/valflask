/**
 * Prissätter nollade löften som pekar ut en åtgärd, ur ett namngivet ankare.
 *
 *   pnpm ankarsattning -- <fil>            # torrkörning, alltid först
 *   pnpm ankarsattning -- <fil> --skriv --varfor "…"
 *
 * En rad per löfte, fyra fält åtskilda av tabb:
 *
 *   p-2026-2445<TAB>p-2026-2248<TAB>Beloppet är lånat …<TAB>samma system, olika svar
 *
 * Andra fältet är ankaret: löftet vars belopp lånas. Reglerna och spärrarna
 * står i `src/ankarsattning.ts`.
 *
 * **Skriptet avgör aldrig att ankaret är rätt.** Att två löften gäller samma
 * åtgärd är en läsning, och den ska vara gjord innan raden skrivs. Det
 * skriptet gör är att pröva det som skrivits — att ankaret finns, lever, bär
 * ett belopp, har samma period och kostnadstyp och inte pekar tillbaka — mäta
 * vad summorna gör med sajtens egen uträkning, och skriva historik och
 * rättelsepost så att ingenting ändras tyst.
 *
 * Faller en enda rad skrivs ingenting.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { computeDataHash, type ChangelogEntry } from "../src/publish.ts";
import { lasOrsak, ORSAKKODER } from "../src/orsakkoder.ts";
import { paverkan, provaAnkarrad, rattelsePost, satt, type Ankarrad, type Lofte } from "../src/ankarsattning.ts";
import { taLaset } from "../src/datalas.ts";
import { svenskDag } from "../src/dagen.ts";

const aggregates = (await import(
  pathToFileURL(join(import.meta.dirname, "../../site/src/lib/aggregates.ts")).href
)) as {
  totalFlasket: (p: unknown[]) => number;
  partyTotalMsek: (p: unknown[], parti: string) => number;
};
const { totalFlasket, partyTotalMsek } = aggregates;

const DATA_DIR = join(import.meta.dirname, "../../data");
const datum = svenskDag();
const argv = process.argv.slice(2);
const orsakArg = lasOrsak(process.argv);
if (orsakArg === null) {
  console.error("En rättelsepost kräver --orsak med en av koderna (grind: rattelseschema.test.ts):");
  for (const k of ORSAKKODER) console.error(`  ${k}`);
  process.exit(1);
}
const skriv = argv.includes("--skriv");
const varde = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const varfor = varde("--varfor");
const listfil = argv.find((a) => !a.startsWith("--") && a !== varfor);

if (!listfil) {
  console.error("Ange en fil med rader: <id><TAB><ankare><TAB><ny uträkning><TAB><skäl>.");
  process.exit(1);
}

const rader: Ankarrad[] = readFileSync(listfil, "utf8")
  .split("\n")
  .map((r) => r.replace(/\r$/u, ""))
  .filter((r) => r.trim() !== "" && !r.startsWith("#"))
  .map((r) => {
    const [id, ankare, utrakning, skal] = r.split("\t");
    return {
      id: (id ?? "").trim(),
      ankare: (ankare ?? "").trim(),
      utrakning: (utrakning ?? "").trim(),
      skal: (skal ?? "").trim(),
    };
  });

if (rader.length === 0) {
  console.error("Listan är tom.");
  process.exit(1);
}

const loften = JSON.parse(readFileSync(join(DATA_DIR, "promises.json"), "utf8")) as Lofte[];
const byId = new Map(loften.map((l) => [l.id, l]));

const fel: string[] = [];
const sedda = new Set<string>();
for (const rad of rader) {
  if (sedda.has(rad.id)) fel.push(`${rad.id} står två gånger i filen`);
  sedda.add(rad.id);
  const lofte = byId.get(rad.id);
  const ankare = byId.get(rad.ankare);
  const r = provaAnkarrad(lofte, ankare, rad);
  console.log(`\n${rad.id} [${lofte?.parties?.join(",") ?? "?"}] ${(lofte?.title ?? "").slice(0, 52)}`);
  console.log(`  ankare: ${rad.ankare} [${ankare?.parties?.join(",") ?? "?"}] ${ankare?.cost.msek_base ?? "?"} ${ankare?.cost.period ?? ""}`);
  if (r.ok) console.log(`  ✓ går att prissätta · +${paverkan(ankare!).toLocaleString("sv-SE")} mkr för mandatperioden`);
  else for (const f of r.fel) console.log(`  ✗ ${f}`);
  fel.push(...r.fel);
}

if (fel.length > 0) {
  console.error(`\n${fel.length} fel — ingenting skrivs.`);
  process.exit(1);
}

const satts = new Map(rader.map((r) => [r.id, r]));
const efter = loften.map((l) => {
  const rad = satts.get(l.id);
  return rad ? satt(l, byId.get(rad.ankare)!, rad, datum) : l;
});

const partier = new Map<string, number>();
for (const parti of new Set(rader.flatMap((r) => byId.get(r.id)?.parties ?? []))) {
  const diff = partyTotalMsek(efter, parti) - partyTotalMsek(loften, parti);
  if (diff !== 0) partier.set(parti, diff);
}
const riket = totalFlasket(efter) - totalFlasket(loften);

console.log("\nMätt med sajtens egen uträkning, för mandatperioden:");
for (const [p, mkr] of [...partier].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${p.toUpperCase()}: +${mkr.toLocaleString("sv-SE")} mkr`);
}
console.log(`  riket: +${riket.toLocaleString("sv-SE")} mkr`);

const post = rattelsePost(
  rader.map((r) => ({ lofte: byId.get(r.id)!, ankare: byId.get(r.ankare)! })),
  datum,
  { partier, riket },
  orsakArg,
);
if (varfor) post.why = varfor;
console.log(`\nRättelsepost som skrivs:\n  ${post.affects}\n  ${post.what}`);

if (!skriv) {
  console.log("\ntorrkörning — lägg till --skriv för att verkställa.");
  process.exit(0);
}

const slappLaset = taLaset(DATA_DIR, "ankarsattning");
try {
  writeFileSync(join(DATA_DIR, "promises.json"), JSON.stringify(efter, null, 2) + "\n", "utf8");
  const rattelser = JSON.parse(readFileSync(join(DATA_DIR, "rattelser.json"), "utf8")) as unknown[];
  rattelser.push(post);
  writeFileSync(join(DATA_DIR, "rattelser.json"), JSON.stringify(rattelser, null, 2) + "\n", "utf8");
  const changelog = JSON.parse(readFileSync(join(DATA_DIR, "changelog.json"), "utf8")) as ChangelogEntry[];
  changelog.push({
    run_id: `ankarsattning-${datum}`,
    added: [],
    updated: rader.map((r) => r.id),
    retracted: [],
    data_hash: computeDataHash(efter as never),
    // Verklig tid, inte midnatt — se tests/changelogstamplarna.test.ts.
    timestamp: new Date().toISOString(),
  });
  writeFileSync(join(DATA_DIR, "changelog.json"), JSON.stringify(changelog, null, 2) + "\n", "utf8");
} finally {
  slappLaset();
}

console.log(`\nSkrivet: promises.json, rattelser.json, changelog.json — ${rader.length} löften prissatta`);
console.log("Kvar att göra för hand: backfilla commit-hashen (andra commiten).");
