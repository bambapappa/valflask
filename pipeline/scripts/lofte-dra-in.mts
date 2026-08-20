/**
 * Drar tillbaka publicerade löften — en läst hög i en körning.
 *
 * Statusen `tillbakadragen` fanns i datat på 35 löften utan att något i repot
 * kunde skriva den. Den här körningen gör det, med reglerna: skälet måste gå
 * att läsa för en utomstående, det får inte bära interna koder, och talen mäts
 * innan något skrivs.
 *
 *   pnpm lofte-dra-in -- <fil>            # torrkörning, alltid först
 *   pnpm lofte-dra-in -- <fil> --skriv
 *
 * En rad per löfte, fälten åtskilda av tabb:
 *
 *   p-2026-0812<TAB>Samma parti lovar samma sak på sin sakpolitiska sida, och den posten bär …
 *
 * Rader som börjar med # är kommentarer. Faller en enda rad skrivs ingenting.
 *
 * Summorna räknas med **sajtens egen** `aggregates.ts` — samma funktion som
 * skriver talet på sidan. Ett andra sätt att räkna samma sak är ett sätt för
 * mycket.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeDataHash, type ChangelogEntry } from "../src/publish.ts";
import {
  draIn,
  grupperSomByterBarare,
  provaIndragning,
  rattelsePost,
  type Indragningsrad,
} from "../src/indragning.ts";
import { beroendeAv, type Ankarlofte } from "../src/ankaren.ts";
import { pathToFileURL } from "node:url";

/**
 * Sajtens egen uträkning, hämtad med en **beräknad** sökväg.
 *
 * Skälet är inte kosmetiskt: en vanlig import drar in `site/`s källor i
 * pipelinens typkontroll, som är strängare, och `pnpm typecheck` faller på kod
 * som inte hör hit. Samma väg som mätskriptet i granskningsskillarna använder.
 * Talen ska räknas på ett ställe, och det stället är sajtens.
 */
const aggregates = (await import(
  pathToFileURL(join(import.meta.dirname, "../../site/src/lib/aggregates.ts")).href
)) as {
  totalFlasket: (p: unknown[]) => number;
  partyTotalMsek: (p: unknown[], parti: string) => number;
  dedupeByGroup: (p: unknown[]) => unknown[];
};
const { totalFlasket, partyTotalMsek, dedupeByGroup } = aggregates;

const DATA_DIR = join(import.meta.dirname, "../../data");
const datum = new Date().toISOString().slice(0, 10);

const [listfil] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const skriv = process.argv.includes("--skriv");

if (!listfil) {
  console.error("Ange en fil med en rad per löfte: <löftes-id><TAB><skäl>");
  process.exit(1);
}

interface Lofte {
  id: string;
  parties: string[];
  title: string;
  status: string;
  group_id?: string | null;
  history?: unknown[];
}

const rader: Indragningsrad[] = readFileSync(listfil, "utf8")
  .split("\n")
  .map((r) => r.trim())
  .filter((r) => r !== "" && !r.startsWith("#"))
  .map((rad) => {
    const [id, skal] = rad.split("\t");
    return { id: (id ?? "").trim(), skal: (skal ?? "").trim() };
  });

if (rader.length === 0) {
  console.error("Listan är tom.");
  process.exit(1);
}

const loften = JSON.parse(readFileSync(join(DATA_DIR, "promises.json"), "utf8")) as Lofte[];
const byId = new Map(loften.map((l) => [l.id, l]));

const fel: string[] = [];
for (const rad of rader) {
  const r = provaIndragning(byId.get(rad.id), rad);
  const lofte = byId.get(rad.id);
  console.log(`\n${rad.id} [${lofte?.parties.join(",") ?? "?"}] ${lofte?.title.slice(0, 60) ?? ""}`);
  console.log(`  skäl: ${rad.skal.slice(0, 100)}`);
  if (r.ok) console.log("  ✓ går att dra tillbaka");
  else for (const f of r.fel) console.log(`  ✗ ${f}`);
  fel.push(...r.fel);
}

if (fel.length > 0) {
  console.error(`\n${fel.length} fel — ingenting skrivs. En halv verkställighet syns inte.`);
  process.exit(1);
}

// Mätningen, med sajtens egen uträkning: före och efter, per parti och för riket.
const drasIn = new Set(rader.map((r) => r.id));
const efter = loften.map((l) => (drasIn.has(l.id) ? { ...l, status: "tillbakadragen" } : l));

const foreAktiva = loften as unknown[];
const efterAktiva = efter as unknown[];

const partier = new Map<string, number>();
for (const parti of new Set(rader.flatMap((r) => byId.get(r.id)!.parties))) {
  const diff = partyTotalMsek(foreAktiva, parti) - partyTotalMsek(efterAktiva, parti);
  if (diff !== 0) partier.set(parti, diff);
}
const riket = totalFlasket(foreAktiva) - totalFlasket(efterAktiva);

// Bärarregeln läses ur sajtens egen gruppering, aldrig ur en egen kopia.
const bararePerGrupp = new Map<string, string>();
for (const b of dedupeByGroup(loften.filter((l) => l.status === "aktiv")) as Lofte[]) {
  if (b.group_id) bararePerGrupp.set(b.group_id, b.id);
}
const grupperSomBytteBarare = grupperSomByterBarare(loften, drasIn, bararePerGrupp);

console.log("\nMätt med sajtens egen uträkning, för mandatperioden:");
for (const [parti, mkr] of partier) console.log(`  ${parti.toUpperCase()}: −${mkr.toLocaleString("sv-SE")} mkr`);
console.log(`  riket: −${riket.toLocaleString("sv-SE")} mkr`);
if (grupperSomBytteBarare.length > 0) {
  console.log(
    `\n⚠ ${grupperSomBytteBarare.length} delat löfte byter den medlem vars belopp räknas:\n` +
      `  ${grupperSomBytteBarare.join(", ")}`,
  );
}

// VAD LUTAR SIG MOT DET SOM FÖRSVINNER?
//
// Ett löfte utan egen siffra prissätts ofta genom att låna ett annat partis
// angivna belopp, och lånet står utskrivet i uträkningen. Dras långivaren
// tillbaka blir låntagaren föräldralös i samma stund — uträkningen hänvisar
// till ett löfte som inte finns, och beloppet står kvar som om ingenting hänt.
// Det upptäcktes först vid ett svep långt efteråt; nu frågas det före.
const ankrare = beroendeAv(loften as unknown as Ankarlofte[], [...drasIn]);
if (ankrare.length > 0) {
  console.log(
    `\n⚠ ${ankrare.length} löfte(n) ankrar i det som dras tillbaka. De bär ett lånat` +
      ` belopp som blir utan källa, och ska rättas i samma pass:`,
  );
  for (const a of ankrare) {
    console.log(`  ${a.id} [${a.parties.join(",").toUpperCase()}] lånar ${a.belopp} mkr av ${a.langivare.toUpperCase()}`);
    console.log(`     «${a.mening.slice(0, 140)}»`);
  }
}

const post = rattelsePost(
  rader.map((r) => ({ lofte: byId.get(r.id)!, skal: r.skal })),
  datum,
  { partier, riket, grupperSomBytteBarare },
);
console.log(`\nRättelsepost som skrivs:\n  ${post.affects}\n  ${post.what}`);

if (!skriv) {
  console.log("\ntorrkörning — lägg till --skriv för att verkställa.");
  process.exit(0);
}

const skalPerId = new Map(rader.map((r) => [r.id, r.skal]));
const nya = loften.map((l) => {
  const skal = skalPerId.get(l.id);
  return skal ? draIn(l, skal, datum) : l;
});

const rattelser = JSON.parse(readFileSync(join(DATA_DIR, "rattelser.json"), "utf8")) as unknown[];
const changelog = JSON.parse(readFileSync(join(DATA_DIR, "changelog.json"), "utf8")) as ChangelogEntry[];
changelog.push({
  run_id: `lofte-dra-in-${datum}`,
  added: [],
  updated: [],
  retracted: rader.map((r) => r.id),
  data_hash: computeDataHash(nya),
  timestamp: new Date().toISOString(),
});

writeFileSync(join(DATA_DIR, "promises.json"), JSON.stringify(nya, null, 2) + "\n");
writeFileSync(join(DATA_DIR, "rattelser.json"), JSON.stringify([...rattelser, post], null, 2) + "\n");
writeFileSync(join(DATA_DIR, "changelog.json"), JSON.stringify(changelog, null, 2) + "\n");

console.log("\nskrivet: promises.json, rattelser.json, changelog.json");
console.log(
  "Kvar att göra för hand:\n" +
    "  · backfilla den riktiga commit-hashen i historikposterna och i rättelseposten,\n" +
    "    och räkna om data_hash i samma commit (andra commiten)\n" +
    "  · bygg om läskopian i Handlingsvågen — den följer Fläskvågens löften" +
    (ankrare.length > 0
      ? `\n  · RÄTTA DE ${ankrare.length} LÖFTEN SOM ANKRADE I DET INDRAGNA (listade ovan) —\n` +
        "    deras belopp vilar nu på ett löfte som inte finns"
      : ""),
);
