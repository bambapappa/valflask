/**
 * Sätter `group_id` på löften som lovar samma sak.
 *
 *   pnpm gruppsattning -- <fil>                       # torrkörning, alltid först
 *   pnpm gruppsattning -- <fil> --skriv --varfor "…"
 *
 * En rad per grupp, fälten åtskilda av tabb:
 *
 *   g-sankt-matmoms<TAB>p-2026-2448,p-2026-0658<TAB>fyra partier lovar samma sänkning
 *
 * VAD EN GRUPP GÖR. Fläskvågen räknar gruppen EN gång — `dedupeByGroup` låter
 * gruppens största post bära summan, och de övriga räknas inte. Rikssumman
 * SJUNKER därför när en grupp bildas. Handlingsvågen fäller däremot en dom per
 * löfte, så varje parti svarar fortfarande för sitt eget.
 *
 * Det är alltså inte en sammanslagning: alla löften står kvar och syns för
 * läsaren med sina egna belopp. Det som ändras är bara att samma politik inte
 * räknas flera gånger i en total.
 *
 * **Skriptet avgör aldrig att två löften lovar samma sak.** Det är en läsning,
 * och den ska vara gjord innan raden skrivs. Vad skriptet prövar är att
 * medlemmarna finns, är aktiva, inte redan sitter i en ANNAN grupp, och att
 * gruppen har minst två medlemmar — en grupp med en enda post är ingen grupp.
 *
 * Faller en enda rad skrivs ingenting.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeDataHash, type ChangelogEntry } from "../src/publish.ts";
import { svenskDag } from "../src/dagen.ts";

const DATA = join(import.meta.dirname, "../../data");
const argv = process.argv.slice(2);
const skriv = argv.includes("--skriv");
const varde = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const varfor = varde("--varfor");
const fil = argv.find((a) => !a.startsWith("--") && a !== varfor);
const datum = svenskDag();

if (!fil) {
  console.error("Ange en fil: <group_id>\\t<id,id,…>\\t<skäl>. Se skriptets huvud.");
  process.exit(1);
}

interface Rad { grupp: string; ids: string[]; skal: string }

const rader: Rad[] = readFileSync(fil, "utf8")
  .split("\n")
  .map((r) => r.replace(/\r$/u, ""))
  .filter((r) => r.trim() !== "" && !r.startsWith("#"))
  .map((r) => {
    const [grupp, ids, skal] = r.split("\t");
    return {
      grupp: (grupp ?? "").trim(),
      ids: (ids ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      skal: (skal ?? "").trim(),
    };
  });

interface Lofte {
  id: string;
  title?: string;
  status?: string;
  group_id?: string | null;
  parties?: readonly string[];
  cost?: { msek_base?: number | null; period?: string | null };
  history?: { date: string; change: string; commit: string }[];
  [k: string]: unknown;
}

const loften = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Lofte[];
const karta = new Map(loften.map((p) => [p.id, p]));
const period = (p: Lofte) => (p.cost?.msek_base ?? 0) * (p.cost?.period === "per_ar" ? 4 : 1);

const fel: string[] = [];
for (const rad of rader) {
  if (!/^g-[a-z0-9-]+$/u.test(rad.grupp)) fel.push(`${rad.grupp}: grupp-id ska vara g- följt av gemener och bindestreck`);
  if (rad.ids.length < 2) fel.push(`${rad.grupp}: en grupp med färre än två medlemmar är ingen grupp`);
  if (rad.skal.trim() === "") fel.push(`${rad.grupp} saknar skäl — rättelseloggen ska säga vad läsningen fann`);
  for (const id of rad.ids) {
    const p = karta.get(id);
    if (!p) { fel.push(`${rad.grupp}: ${id} finns inte`); continue; }
    if ((p.status ?? "aktiv") !== "aktiv") fel.push(`${rad.grupp}: ${id} har status ${p.status}`);
    if (p.group_id && p.group_id !== rad.grupp) {
      fel.push(`${rad.grupp}: ${id} sitter redan i gruppen ${p.group_id} — flytta den medvetet eller lämna den`);
    }
  }
}
const sedda = new Set<string>();
for (const rad of rader) for (const id of rad.ids) {
  if (sedda.has(id)) fel.push(`${id} står i två grupper i samma fil`);
  sedda.add(id);
}

let sankning = 0;
for (const rad of rader) {
  const med = rad.ids.map((i) => karta.get(i)).filter(Boolean) as Lofte[];
  if (med.length < 2) continue;
  const storst = Math.max(...med.map(period));
  const bortraknat = med.reduce((n, p) => n + period(p), 0) - storst;
  sankning += bortraknat;
  console.log(`${rad.grupp}  (${med.length} löften, ${bortraknat.toLocaleString("sv-SE")} msek räknas inte längre dubbelt)`);
  for (const p of med) {
    const bar = period(p) === storst ? " ← bär summan" : "";
    console.log(`     ${p.id} [${(p.parties ?? []).join(",")}] ${period(p).toLocaleString("sv-SE").padStart(9)}  ${(p.title ?? "").slice(0, 54)}${bar}`);
  }
  console.log(`     skäl: ${rad.skal}`);
  console.log();
}

if (fel.length > 0) {
  console.error(`FÄLLDA RADER (${fel.length}) — ingenting skrivet:`);
  for (const f of fel) console.error(`  · ${f}`);
  process.exit(1);
}

console.log(`${rader.length} grupper · rikssumman sjunker med ${sankning.toLocaleString("sv-SE")} msek för mandatperioden`);

if (!skriv) { console.log("\nIngenting skrivet. Kör med --skriv för att verkställa."); process.exit(0); }
if (!varfor) { console.error("\n--skriv kräver --varfor."); process.exit(1); }

const nya = loften.map((p) => {
  const rad = rader.find((r) => r.ids.includes(p.id));
  if (!rad) return p;
  const med = rad.ids.map((i) => karta.get(i)!).filter(Boolean);
  const storst = Math.max(...med.map(period));
  return {
    ...p,
    group_id: rad.grupp,
    history: [
      ...(p.history ?? []),
      {
        date: datum,
        change:
          `Löftet ingår nu i en grupp med ${med.length - 1} annat eller andra löften som lovar samma sak. ` +
          "Fläskvågen räknar gruppen en gång, och gruppens största post bär summan — " +
          (period(p) === storst
            ? "den här posten är den största och bär den."
            : `den här posten räknas därför inte in i totalen, men står kvar med sitt eget belopp på sin sida.`) +
          " Handlingsvågen fäller fortfarande en dom per löfte, så partiet svarar för sitt eget.",
        commit: "0000000",
      },
    ],
  };
});

const rattelser = JSON.parse(readFileSync(join(DATA, "rattelser.json"), "utf8")) as unknown[];
rattelser.push({
  date: datum,
  affects: `Löftessidorna för ${rader.flatMap((r) => r.ids).join(", ")}`,
  what:
    `${rader.length} grupper bildade över ${rader.flatMap((r) => r.ids).length} löften. Samma politik hos ` +
    "flera partier räknas nu en gång i stället för flera. Alla löften står kvar och syns med sina egna " +
    `belopp; det som ändras är totalen, som sjunker med ${sankning.toLocaleString("sv-SE")} miljoner ` +
    "kronor för mandatperioden. " + rader.map((r) => r.skal).join(" "),
  why: varfor,
  commit: "0000000",
});

const changelog = JSON.parse(readFileSync(join(DATA, "changelog.json"), "utf8")) as ChangelogEntry[];
changelog.push({
  run_id: `gruppsattning-${datum}`,
  added: [], updated: rader.flatMap((r) => r.ids), retracted: [],
  data_hash: computeDataHash(nya),
  timestamp: new Date().toISOString(),
});

writeFileSync(join(DATA, "promises.json"), JSON.stringify(nya, null, 2) + "\n");
writeFileSync(join(DATA, "rattelser.json"), JSON.stringify(rattelser, null, 2) + "\n");
writeFileSync(join(DATA, "changelog.json"), JSON.stringify(changelog, null, 2) + "\n");
console.log("\nSkrivet: promises.json, rattelser.json, changelog.json");
console.log("Kvar: backfilla commit-hashen (pnpm backfilla-commit), bygg om läskopian.");
