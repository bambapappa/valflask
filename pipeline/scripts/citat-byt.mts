/**
 * Byter citat på REDAN PUBLICERADE löften — en läst hög i en körning.
 *
 * `pnpm review approve` når bara kön, och kan inte byta citat alls. Är löftet
 * publicerat står citatet på sajten, och bytet är därför en **rättelse**:
 * posten i `data/rattelser.json` skrivs av körningen, varje löfte får en egen
 * historikpost, och `data_hash` räknas om. Tyst rättelse är förbjuden.
 *
 *   pnpm citat-byt -- <fil>            # torrkörning, alltid först
 *   pnpm citat-byt -- <fil> --skriv
 *
 * En rad per byte, fälten åtskilda av tabb:
 *
 *   p-2026-0393<TAB>Statens del beräknas uppgå till omkring 7 miljarder kronor.
 *   p-2026-0401<TAB>höja taket till 1 200 kronor<TAB>resten av meningen gäller en annan förmån
 *
 * Tredje fältet är skälet till att ett citat som inte bär hela meningen ändå
 * tas in. Utan skäl faller raden. Rader som börjar med # är kommentarer.
 *
 * **Skriptet väljer aldrig citat.** Det hämtar källan, prövar det som står i
 * listan och skriver. Valet är en människas.
 *
 * Faller en enda rad skrivs ingenting. En halv verkställighet syns inte.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LiveSource } from "../src/fetch.ts";
import { normalizeForVerbatim } from "../src/gates.ts";
import { computeDataHash, type ChangelogEntry } from "../src/publish.ts";
import { kanon, lasProvningar } from "../src/provningar.ts";
import { provaByte, bytCitat, rattelsePost, type Byte, type Bytesrad } from "../src/citatbyte.ts";
import { svenskDag } from "../src/dagen.ts";

const DATA_DIR = join(import.meta.dirname, "../../data");
const datum = svenskDag();

const [listfil] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const skriv = process.argv.includes("--skriv");

if (!listfil) {
  console.error("Ange en fil med en rad per byte: <löftes-id><TAB><nytt citat>[<TAB><skäl>]");
  process.exit(1);
}

interface Lofte {
  id: string;
  parties: string[];
  title: string;
  quote: string;
  status: string;
  source: { url: string };
  history?: unknown[];
}

const byten: Byte[] = readFileSync(resolve(listfil), "utf8")
  .split("\n")
  .map((r) => r.trim())
  .filter((r) => r !== "" && !r.startsWith("#"))
  .map((rad) => {
    const [id, citat, skal] = rad.split("\t");
    return { id: (id ?? "").trim(), citat: (citat ?? "").trim(), ...(skal?.trim() ? { fragmentSkal: skal.trim() } : {}) };
  });

if (byten.length === 0) {
  console.error("Listan är tom.");
  process.exit(1);
}

const loften = JSON.parse(readFileSync(join(DATA_DIR, "promises.json"), "utf8")) as Lofte[];
const byId = new Map(loften.map((l) => [l.id, l]));

const saknade = byten.filter((b) => !byId.has(b.id));
if (saknade.length > 0) {
  console.error(`Finns inte i promises.json: ${saknade.map((b) => b.id).join(", ")}`);
  process.exit(1);
}

const baseOf = (u: string) => u.replace(/#.*$/u, "");
const arVideo = (u: string) => /youtube\.com|youtu\.be|svtplay\.se\/video/.test(u);

// Partiets egen sida styr om det lägre citatgolvet får användas — samma villkor
// som i skörden, så ett inbytt citat aldrig är svagare än ett skördat.
const partiDomaner = /(socialdemokraterna|moderaterna|sverigedemokraterna|centerpartiet|vansterpartiet|kristdemokraterna|liberalerna|mp)\.(se|nu)/;

const urler = [...new Set(byten.map((b) => baseOf(byId.get(b.id)!.source.url)))];
const video = urler.filter(arVideo);
if (video.length > 0) {
  console.error(
    `Talad källa går inte att pröva ord för ord härifrån: ${video.join(", ")}\n` +
      "Ett citat ur en video kontrolleras genom att titta, och kräver avskrift med tidsstämpel.",
  );
  process.exit(1);
}

console.log(`${byten.length} byte(n), ${urler.length} källa/källor att hämta …`);
const source = new LiveSource({
  feeds: urler.map((url, i) => ({ id: `cb${i}`, type: "page" as const, url })),
  limits: { max_articles_per_run: 10000, min_chars: 1 },
});
const textPerUrl = new Map<string, string>();
for (const a of await source.fetch()) {
  const b = baseOf(a.url);
  textPerUrl.set(b, `${textPerUrl.get(b) ?? ""}\n${a.text}`);
}

const onabara = urler.filter((u) => !textPerUrl.has(u));
if (onabara.length > 0) {
  console.error(
    `Källan svarade inte: ${onabara.join(", ")}\n` +
      "Ett citat får aldrig bytas mot en källa vi inte just läst.",
  );
  process.exit(1);
}

const provningar = lasProvningar(DATA_DIR);
const gjorda: Bytesrad[] = [];
const fallna: Array<{ id: string; skal: string[] }> = [];
const inaktuella: string[] = [];

for (const byte of byten) {
  const lofte = byId.get(byte.id)!;
  const kalltext = textPerUrl.get(baseOf(lofte.source.url))!;
  const arPartiegen = partiDomaner.test(baseOf(lofte.source.url));
  const r = provaByte(byte, lofte.quote, kalltext, arPartiegen);

  console.log(`\n${byte.id} [${lofte.parties.join(",")}] ${lofte.title.slice(0, 60)}`);
  console.log(`  nu:  «${lofte.quote.slice(0, 90)}»`);
  console.log(`  nytt:«${byte.citat.slice(0, 90)}»`);
  if (r.paUndantag) console.log(`  ⚠ inte hela meningen — undantag: ${byte.fragmentSkal}`);

  if (!r.ok) {
    for (const s of r.skal) console.log(`  ✗ ${s}`);
    fallna.push({ id: byte.id, skal: r.skal });
    continue;
  }
  console.log("  ✓ står ordagrant i källan");

  // Stod det GAMLA citatet inte i källan är bytet en lagad avskrift, inte ett
  // byte av mening — och rättelseposten får inte påstå något annat.
  const gammaltSaknas = !normalizeForVerbatim(kalltext).includes(normalizeForVerbatim(lofte.quote));
  if (gammaltSaknas) console.log("  · det gamla citatet stod inte längre i källan — avskriften lagas");

  const p = provningar.get(lofte.id);
  if (p !== undefined && p.underlag_hash === kanon("lofte", lofte as unknown as Record<string, unknown>)) {
    inaktuella.push(lofte.id);
  }

  gjorda.push({ lofte, byte, ...(gammaltSaknas ? { gammaltCitatSaknasIKallan: true } : {}) });
}

if (fallna.length > 0) {
  console.error(
    `\n${fallna.length} rad(er) föll — ingenting skrivs. En halv verkställighet syns inte.\n` +
      "Citatgrindarna lossas aldrig: leta ett bättre citat, eller skriv ut skälet.",
  );
  process.exit(1);
}

const post = rattelsePost(gjorda, datum);
console.log(`\nRättelsepost som skrivs:\n  ${post.affects}`);

if (inaktuella.length > 0) {
  console.log(
    `\n⚠ ${inaktuella.length} löfte(n) har en prövning i kvalitetsfiltret som blir inaktuell av\n` +
      "  bytet — citatet är inte det som prövades. Pröva om dem och exportera:\n" +
      `  ${inaktuella.join(", ")}`,
  );
}

const valda = gjorda.filter(({ lofte }) =>
  ((lofte.history ?? []) as Array<{ change?: string }>).some((h) => (h.change ?? "").includes("mänskligt beslut")),
);
if (valda.length > 0) {
  console.log(
    `\n⚠ ${valda.length} löfte(n) bär ett citat som en människa valt med skälet utskrivet i\n` +
      "  historiken. Bytet river det beslutet. Läs skälet först och skriv i PR-texten vad\n" +
      `  som ändrats sedan det fattades: ${valda.map((b) => b.lofte.id).join(", ")}`,
  );
}

if (!skriv) {
  console.log("\ntorrkörning — lägg till --skriv för att verkställa.");
  process.exit(0);
}

const bytenPerId = new Map(gjorda.map((b) => [b.lofte.id, b.byte]));
const nya = loften.map((l) => {
  const b = bytenPerId.get(l.id);
  return b ? bytCitat(l, b, datum) : l;
});

const rattelser = JSON.parse(readFileSync(join(DATA_DIR, "rattelser.json"), "utf8")) as unknown[];
const changelog = JSON.parse(readFileSync(join(DATA_DIR, "changelog.json"), "utf8")) as ChangelogEntry[];
changelog.push({
  run_id: `citat-byt-${datum}`,
  added: [],
  updated: gjorda.map((b) => b.lofte.id),
  retracted: [],
  data_hash: computeDataHash(nya),
  timestamp: new Date().toISOString(),
});

writeFileSync(join(DATA_DIR, "promises.json"), JSON.stringify(nya, null, 2) + "\n");
writeFileSync(join(DATA_DIR, "rattelser.json"), JSON.stringify([...rattelser, post], null, 2) + "\n");
writeFileSync(join(DATA_DIR, "changelog.json"), JSON.stringify(changelog, null, 2) + "\n");

console.log(`\nskrivet: promises.json, rattelser.json, changelog.json`);
console.log(
  "Kvar att göra för hand:\n" +
    "  · backfilla den riktiga commit-hashen i historikposterna och i rättelseposten,\n" +
    "    och räkna om data_hash i samma commit (andra commiten)\n" +
    "  · pröva om löftena vars prövning blev inaktuell, och exportera loggen\n" +
    "  · bygg om läskopian i Handlingsvågen om citatet syns där",
);
