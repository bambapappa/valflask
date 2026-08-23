/**
 * Nollar publicerade belopp som en fastställd kostnadsregel säger ska vara noll.
 *
 *   pnpm regelnollning -- <fil>            # torrkörning, alltid först
 *   pnpm regelnollning -- <fil> --skriv --varfor "…"
 *
 * En rad per löfte, fyra fält åtskilda av tabb:
 *
 *   p-2026-1449<TAB>utredning<TAB>Löftet är att utreda …<TAB>citatet lovar bara en utredning
 *
 * Regeln är `utredning` eller `lagandring`. Reglerna och skälen står i
 * `src/regelnollning.ts`; de är fastställda sedan tidigare och skrivs inte här.
 *
 * **Skriptet avgör aldrig om regeln gäller.** Att ett löfte bara lovar en
 * utredning, eller bara hålls av en lagändring, är en läsning — och den ska
 * vara gjord innan raden skrivs. Det skriptet gör är att pröva det som
 * skrivits, mäta vad summorna gör med sajtens egen uträkning, och skriva
 * historik och rättelsepost så att ingenting ändras tyst.
 *
 * Faller en enda rad skrivs ingenting. En halv verkställighet lämnar
 * beståndet i ett läge ingen har beslutat om.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { computeDataHash, type ChangelogEntry } from "../src/publish.ts";
import {
  nolla,
  paverkan,
  provaNollrad,
  rattelsePost,
  type Lofte,
  type Nollrad,
  type Regel,
} from "../src/regelnollning.ts";
import { taLaset } from "../src/datalas.ts";
import { svenskDag } from "../src/dagen.ts";

// Talen räknas på ett ställe, och det stället är sajtens. Beräknad sökväg av
// samma skäl som i lofte-dra-in: en vanlig import drar in site/ i pipelinens
// strängare typkontroll.
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
const skriv = argv.includes("--skriv");
const varde = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const varfor = varde("--varfor");
const listfil = argv.find((a) => !a.startsWith("--") && a !== varfor);

if (!listfil) {
  console.error("Ange en fil med rader: <id><TAB><regel><TAB><ny uträkning><TAB><skäl>. Se skriptets huvud.");
  process.exit(1);
}

const rader: Nollrad[] = readFileSync(listfil, "utf8")
  .split("\n")
  .map((r) => r.replace(/\r$/u, ""))
  .filter((r) => r.trim() !== "" && !r.startsWith("#"))
  .map((r) => {
    const [id, regel, utrakning, skal] = r.split("\t");
    return {
      id: (id ?? "").trim(),
      regel: (regel ?? "").trim() as Regel,
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
  const r = provaNollrad(lofte, rad);
  console.log(
    `\n${rad.id} [${lofte?.parties?.join(",") ?? "?"}] ${lofte?.cost.msek_base ?? "?"} ` +
      `${lofte?.cost.period ?? ""} — ${(lofte?.title ?? "").slice(0, 55)}`,
  );
  console.log(`  regel: ${rad.regel}`);
  console.log(`  ny uträkning: ${rad.utrakning.slice(0, 110)}`);
  if (r.ok) console.log(`  ✓ går att nolla · −${paverkan(lofte!).toLocaleString("sv-SE")} mkr för mandatperioden`);
  else for (const f of r.fel) console.log(`  ✗ ${f}`);
  fel.push(...r.fel);
}

if (fel.length > 0) {
  console.error(`\n${fel.length} fel — ingenting skrivs.`);
  process.exit(1);
}

// Mätningen: före och efter, med sajtens egen uträkning.
const nollas = new Map(rader.map((r) => [r.id, r]));
const efter = loften.map((l) => (nollas.has(l.id) ? nolla(l, nollas.get(l.id)!, datum) : l));

const partier = new Map<string, number>();
for (const parti of new Set(rader.flatMap((r) => byId.get(r.id)?.parties ?? []))) {
  const diff = partyTotalMsek(loften, parti) - partyTotalMsek(efter, parti);
  if (diff !== 0) partier.set(parti, diff);
}
const riket = totalFlasket(loften) - totalFlasket(efter);

console.log("\nMätt med sajtens egen uträkning, för mandatperioden:");
for (const [p, mkr] of [...partier].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${p.toUpperCase()}: −${mkr.toLocaleString("sv-SE")} mkr`);
}
console.log(`  riket: −${riket.toLocaleString("sv-SE")} mkr`);

const post = rattelsePost(
  rader.map((r) => ({ lofte: byId.get(r.id)!, rad: r })),
  datum,
  { partier, riket },
);
if (varfor) post.why = varfor;
console.log(`\nRättelsepost som skrivs:\n  ${post.affects}\n  ${post.what}`);

if (!skriv) {
  console.log("\ntorrkörning — lägg till --skriv för att verkställa.");
  process.exit(0);
}

const slappLaset = taLaset(DATA_DIR, "regelnollning");
try {
  writeFileSync(join(DATA_DIR, "promises.json"), JSON.stringify(efter, null, 2) + "\n", "utf8");

  const rattelser = JSON.parse(readFileSync(join(DATA_DIR, "rattelser.json"), "utf8")) as unknown[];
  rattelser.push(post);
  writeFileSync(join(DATA_DIR, "rattelser.json"), JSON.stringify(rattelser, null, 2) + "\n", "utf8");

  const changelog = JSON.parse(readFileSync(join(DATA_DIR, "changelog.json"), "utf8")) as ChangelogEntry[];
  changelog.push({
    run_id: `regelnollning-${datum}`,
    added: [],
    // Ett nollat löfte är ändrat, inte indraget: det står kvar och räknas, med
    // beloppet noll. Skillnaden syns för läsaren och ska synas i loggen.
    updated: rader.map((r) => r.id),
    retracted: [],
    data_hash: computeDataHash(efter as never),
    timestamp: `${datum}T00:00:00Z`,
  });
  writeFileSync(join(DATA_DIR, "changelog.json"), JSON.stringify(changelog, null, 2) + "\n", "utf8");
} finally {
  slappLaset();
}

console.log(`\nSkrivet: promises.json, rattelser.json, changelog.json — ${rader.length} löften nollade`);
console.log("Kvar att göra för hand:");
console.log("  · backfilla commit-hashen i historikposterna och i rättelseposten (andra commiten)");
console.log("  · bygg om läskopian i Handlingsvågen om något löfte bytte status");
