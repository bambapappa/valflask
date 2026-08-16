/**
 * Arkiv-backfill / retry-steg (SPEC §6.2: "Vid fel: archive_url = null +
 * automatiskt nytt försök nästa run tills satt"). Seed-import och review-
 * godkännanden sätter archive_url=null och pipelinens live-arkivering är skör,
 * så publicerade löften saknar arkivbevis. Detta steg fyller nullen i fyra faser:
 *   A) Wayback availability-API — befintlig snapshot (nära fetched_at, annars valfri)
 *   A2) SAVE-läge: pröva de lösta kopiorna mot sina citat — en kopia som är
 *       äldre än sidinnehållet bär dem inte, och ska sparas om
 *   B) SAVE-läge: begär Wayback-save för URL:er utan snapshot OCH för de
 *      föråldrade (bunden budget)
 *   C) vänta på indexering, kolla availability igen för de sparade
 * Robust mot rate-limits (retry+backoff, generös throttle). Idempotent: bara
 * archive_url===null behandlas; dedup på käll-URL utan #fragment. Uppdaterar
 * data/promises.json + changelog (updated + ny data_hash).
 *
 * Körning:  node --import tsx/esm scripts/archive-backfill.mts <mode> <maxSaves> <limit>
 *   mode=avail  (default) — bara fas A (befintliga snapshots)
 *   mode=save   — fas A + B + C (begär saves för det som saknas)
 * I pipelinen körs 'save' med lågt maxSaves varje run (gradvis, snällt mot Wayback).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { quoteInSnapshotText, snapshotText } from "../src/archive-verify.ts";
import { snapshotUrUrSparsvar } from "../src/archive.ts";
import { GRUNDPAUS_MS, hamtaFranArkivet } from "../src/wayback-takt.ts";

/** Hur många begäranden arkivet strypte under körningen. Skrivs ut till sist. */
let strypta = 0;

const DATA = join(import.meta.dirname, "../../data");
const MODE = process.argv[2] ?? "avail";
const MAX_SAVES = parseInt(process.argv[3] ?? "0", 10) || (MODE === "save" ? 25 : 0);
const LIMIT = parseInt(process.argv[4] ?? "0", 10) || Infinity;
const UA = "UtlovatBot/1.0 (+https://utlovat.se/om)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function canonical(d: unknown): string {
  if (d === null || d === undefined) return "null";
  if (typeof d === "boolean") return d ? "true" : "false";
  if (typeof d === "number" || typeof d === "string") return JSON.stringify(d);
  if (Array.isArray(d)) return "[" + d.map(canonical).join(",") + "]";
  const o = d as Record<string, unknown>;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canonical(o[k])).join(",") + "}";
}
const save = (path: string, data: unknown) => writeFileSync(path, JSON.stringify(data, null, 2) + "\n");

interface Promise_ { id: string; quote: string; source: { url: string; archive_url: string | null; fetched_at?: string }; }
const promises = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Promise_[];

const stripFrag = (u: string) => u.split("#")[0]!;
const tsDigits = (iso?: string) => (iso ? iso.replace(/[^0-9]/g, "").slice(0, 14) : "");

// Citaten bärs med, inte bara id:na: föråldringskontrollen nedan behöver veta
// vilka citat en ögonblicksbild ska kunna backa för att avgöra om den duger.
const groups = new Map<string, { ids: string[]; citat: string[]; ts: string }>();
for (const p of promises) {
  if (p.source.archive_url) continue;
  const key = stripFrag(p.source.url);
  const g = groups.get(key) ?? { ids: [], citat: [], ts: tsDigits(p.source.fetched_at) };
  g.ids.push(p.id);
  g.citat.push(p.quote);
  groups.set(key, g);
}
const urls = [...groups.keys()].slice(0, LIMIT);
console.log(`Null-arkiv: ${promises.filter((p) => !p.source.archive_url).length} löften över ${groups.size} käll-URL:er. Läge=${MODE} maxSaves=${MAX_SAVES} behandlar=${urls.length}.`);

// Availability med retry+backoff. Arkivet stryper under snabb eld, och en
// strypt begäran är inte samma sak som «ingen kopia finns» — se wayback-takt.ts.
async function availabilityOnce(url: string, ts: string): Promise<string | null> {
  const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}${ts ? `&timestamp=${ts}` : ""}`;
  const svar = await hamtaFranArkivet(api, undefined, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(20000),
  });
  if (svar.slag === "strypt") { strypta++; return null; }
  if (svar.slag === "nat" || !svar.res.ok) return null;
  try {
    const j = await svar.res.json() as { archived_snapshots?: { closest?: { url?: string; available?: boolean } } };
    const c = j.archived_snapshots?.closest;
    if (c?.available && c.url) return c.url.replace(/^http:/, "https:");
  } catch { /* trasigt svar → som ingen snapshot */ }
  return null; // giltigt svar, ingen snapshot
}
// Prova nära fetched_at (datumtrohet), fall tillbaka på valfri snapshot (träffsäkerhet).
async function availability(url: string, ts: string): Promise<string | null> {
  const dated = ts ? await availabilityOnce(url, ts) : null;
  if (dated) return dated;
  await sleep(1000);
  return availabilityOnce(url, "");
}
/**
 * Begär en ny kopia. Returnerar `null` när arkivet strypte begäran — då är
 * ingenting sparat, och budgeten ska inte räkna av för ett nej. Mätt
 * 2026-08-09: fem kopior i rad räcker för att nästa ska svara 429.
 *
 * Lyckas begäran returneras ögonblicksbildens adress ur svaret, när den finns
 * där. Wayback omdirigerar `/save/<url>` till kopian den just skapade, så
 * adressen är känd direkt — och det är den enda pålitliga vägen till den, för
 * availability-API:t indexerar långsammare än en körning kan vänta.
 */
async function requestSave(url: string): Promise<{ snapshot: string | null } | null> {
  const svar = await hamtaFranArkivet(`https://web.archive.org/save/${url}`, undefined, {
    headers: { "User-Agent": UA },
    redirect: "follow",
    signal: AbortSignal.timeout(60000),
  });
  if (svar.slag === "strypt") { strypta++; return null; }
  if (svar.slag !== "svar") return null;
  return { snapshot: snapshotUrUrSparsvar(svar.res) };
}

const resolved = new Map<string, string>(); // key(url utan frag) -> snapshot-URL
const needSave: string[] = [];

// --- Fas A: befintliga snapshots ---
console.log("Fas A: availability för befintliga snapshots...");
for (const key of urls) {
  const snap = await availability(key, groups.get(key)!.ts);
  if (snap) { resolved.set(key, snap); console.log(`  ✓ ${key} -> ${snap.slice(0, 60)}`); }
  else { needSave.push(key); console.log(`  – saknas: ${key}`); }
  await sleep(GRUNDPAUS_MS);
}

/**
 * Ögonblicksbildens text, hämtad en gång per snapshot-URL.
 *
 * Prövningen sker per citat, men hämtningen per sida — flera löften delar ofta
 * artikel. Kartan delas av föråldringskontrollen nedan och av appliceringen.
 */
const sidtext = new Map<string, string | null>();
async function text(snap: string): Promise<string | null> {
  if (!sidtext.has(snap)) sidtext.set(snap, await snapshotText(snap));
  return sidtext.get(snap) ?? null;
}

// --- Fas A2: vilka lösta kopior är för gamla för sitt citat? ---
//
// Wayback ger NÄRMASTE ögonblicksbild, som mycket väl kan vara äldre än
// sidinnehållet. Fas B letade förut bara adresser som HELT saknade kopia, så
// en adress med en för gammal kopia fastnade: appliceringen vägrade den, och
// nästa körning gjorde om exakt samma sak. Mätt 2026-08-12 på de 86 nya
// KD-löftena — 29 vägrades, ingen av dem stod i kön för en ny kopia, och de
// hade stått kvar körning efter körning tills någon begärde kopiorna för hand.
//
// Nu prövas varje löst kopia mot citaten den ska bära. Bär den inte alla
// hamnar adressen i sparkön — men **den gamla kopian kastas aldrig**: den kan
// bära citat som den färska missar, och en fungerande arkivlänk får aldrig
// falla bort för att vi bad om en nyare.
const foraldrade: string[] = [];
if (MODE === "save") {
  for (const key of [...resolved.keys()]) {
    const snap = resolved.get(key)!;
    const t = await text(snap);
    if (t === null) continue; // nätfel säger inget om kopian — anklaga den inte
    const citat = groups.get(key)!.citat;
    const missar = citat.filter((q) => !quoteInSnapshotText(t, q)).length;
    if (missar > 0) {
      foraldrade.push(key);
      console.log(`  ⧗ kopian bär ${citat.length - missar}/${citat.length} citat — begär en färsk: ${key}`);
    }
  }
  if (foraldrade.length > 0) {
    console.log(`Fas A2: ${foraldrade.length} lösta kopior är för gamla för minst ett citat.`);
  }
}

// --- Fas B: begär saves (bunden) ---
const saved: string[] = [];
/** Ögonblicksbildens adress direkt ur sparsvaret, per källadress. */
const sparade = new Map<string, string>();
/** Adresser vars färska kopia bara får användas där den gamla inte räcker. */
const farska = new Map<string, string>();
if (MODE === "save") {
  let saves = 0;
  console.log(
    `Fas B: begär saves (budget ${MAX_SAVES}) för ${needSave.length} saknade` +
      `${foraldrade.length > 0 ? ` och ${foraldrade.length} föråldrade` : ""}...`,
  );
  let iRad = 0;
  for (const key of [...needSave, ...foraldrade]) {
    if (saves >= MAX_SAVES) break;
    if (/youtube\.com|youtu\.be/.test(key)) { console.log(`  (hoppar youtube) ${key}`); continue; }
    console.log(`  save (${saves + 1}/${MAX_SAVES}): ${key}`);
    const utfall = await requestSave(key);
    if (utfall) {
      saves++;
      iRad = 0;
      saved.push(key);
      // Adressen ur sparsvaret, när arkivet gav en. Den gör fas C:s väntan
      // överflödig för just den här kopian — men avgör ingenting: kopian måste
      // fortfarande bära citatet, och det prövas i appliceringen nedan.
      if (utfall.snapshot) {
        sparade.set(key, utfall.snapshot);
        console.log(`    ✓ adress ur sparsvaret: ${utfall.snapshot.slice(0, 70)}`);
      }
    } else {
      // Strypt: ingenting sparades, så budgeten räknas inte av. Två nej i rad
      // betyder att arkivet vill ha en paus, inte att vi ska tjata.
      iRad++;
      console.log(`  – arkivet strypte begäran, inget sparat: ${key}`);
      if (iRad >= 2) { console.log("  Två strypta i rad — avbryter sparandet och lämnar resten till nästa körning."); break; }
    }
    await sleep(GRUNDPAUS_MS);
  }
}

// --- Fas C: ta emot de sparade kopiorna ---
//
// Steget frågade förut availability-API:t efter 90 sekunders väntan om vad
// som just sparats. Det API:t indexerar långsammare än så, och resultatet blev
// att arbetet gjordes varje körning och kastades varje gång: i pipelinekörning
// 31955869060 sparades tolv kopior, tolv svarade «ännu ej indexerad», och
// körningen slutade med «Inga archive_url uppdaterade. Kvar utan arkiv: 32».
// Ett grönt steg som inte flyttar någonting ser ut som att arkivet saknar
// kopior; det gjorde det inte, det var vi som slängde adresserna.
//
// Adressen står i sparsvaret. Väntan behövs bara för de kopior arkivet inte
// gav någon adress till.
const varForaldrad = new Set(foraldrade);
const utanAdress = saved.filter((key) => !sparade.has(key));
for (const key of saved) {
  const snap = sparade.get(key);
  if (!snap) continue;
  if (varForaldrad.has(key)) farska.set(key, snap);
  else resolved.set(key, snap);
}
if (utanAdress.length > 0) {
  console.log(
    `Fas C: ${saved.length - utanAdress.length} kopior kom med adress ur sparsvaret. ` +
      `Väntar 90s på indexering för de ${utanAdress.length} som inte gjorde det...`,
  );
  await sleep(90000);
  for (const key of utanAdress) {
    const snap = await availability(key, "");
    if (!snap) { console.log(`  – ännu ej indexerad: ${key}`); await sleep(GRUNDPAUS_MS); continue; }
    // En adress som redan hade en kopia behåller den. Den färska läggs vid
    // sidan om och används bara för de citat den gamla inte bär — annars
    // kunde en nyare ögonblicksbild ta bort en fungerande arkivlänk.
    if (varForaldrad.has(key)) { farska.set(key, snap); console.log(`  ✓ (färsk, som komplement) ${key}`); }
    else { resolved.set(key, snap); console.log(`  ✓ (efter save) ${key}`); }
    await sleep(GRUNDPAUS_MS);
  }
}

// --- applicera (behåll ev. #fragment för PDF-sidhänvisning) ---
// Kärnprincipen: en arkivkopia duger bara om citatet står ordagrant i den.
// Wayback ger NÄRMASTE snapshot, som kan vara äldre än sidinnehållet — en
// extern granskning hittade att 4 av 25 arkiv saknade sitt citat.
//
// **Prövas per LÖFTE, inte per källsida** (mätt 2026-08-09). Steget prövade
// förut ett citat per sida och skrev sedan länken till alla löften som delade
// sidan. `p-2026-0704` fick på det viset en kopia som inte bär dess citat: fem
// centerpartistiska löften delar samma artikel, kopian bar det första citatet
// och inte det fjärde. Ögonblicksbilden hämtas fortfarande en gång per sida —
// det är prövningen som ska ske en gång per citat, för det är citatet som är
// löftets belägg.
const changed: string[] = [];
const vagrade: string[] = [];
let ejAvgjort = 0;
for (const p of promises) {
  if (p.source.archive_url) continue;
  const key = stripFrag(p.source.url);
  // Den gamla kopian först, den färska bara som komplement — se fas C.
  const kandidater = [resolved.get(key), farska.get(key)].filter((s): s is string => Boolean(s));
  if (kandidater.length === 0) continue;
  let traff: string | undefined;
  let avgjord = false;
  for (const snap of kandidater) {
    const t = await text(snap);
    if (t === null) continue; // nätfel: säger inget om kopian
    avgjord = true;
    if (quoteInSnapshotText(t, p.quote)) { traff = snap; break; }
  }
  if (traff === undefined) {
    if (!avgjord) { ejAvgjort++; console.log(`  ✗ gick ej att avgöra (nätet): ${p.id}`); }
    else { vagrade.push(p.id); console.log(`  ✗ kopian bär inte citatet: ${p.id}  ${key}`); }
    continue;
  }
  const frag = p.source.url.includes("#") ? "#" + p.source.url.split("#")[1] : "";
  p.source.archive_url = traff + frag;
  changed.push(p.id);
}

if (changed.length > 0) {
  promises.sort((a, b) => a.id.localeCompare(b.id));
  save(join(DATA, "promises.json"), promises);
  const dataHash = createHash("sha256").update(canonical(promises)).digest("hex");
  const changelog = JSON.parse(readFileSync(join(DATA, "changelog.json"), "utf8")) as unknown[];
  changelog.push({
    run_id: `archive-backfill-${new Date().toISOString().slice(0, 10)}`,
    added: [], updated: changed, retracted: [],
    data_hash: dataHash, timestamp: new Date().toISOString(),
  });
  save(join(DATA, "changelog.json"), changelog);
  console.log(`\nKLART: ${changed.length} löften fick archive_url (${resolved.size}/${urls.length} URL:er lösta). Ny data_hash: ${dataHash.slice(0, 16)}…`);
} else {
  console.log("\nInga archive_url uppdaterade.");
}
console.log(`Kvar utan arkiv: ${promises.filter((p) => !p.source.archive_url).length} löften.`);
if (vagrade.length > 0) {
  console.log(`Vägrade kopia (bär inte citatet): ${vagrade.join(", ")}`);
}
if (ejAvgjort > 0) {
  // Skiljs från «bär inte citatet» med flit. Att kopian inte gick att hämta
  // säger ingenting om kopian — och när något står mellan oss och arkivet
  // gäller det ALLA poster, vilket får en körning att se ut som ett
  // arkivproblem fast inget nådde fram. Mätt 2026-08-12: 110 av 110 föll så,
  // och orsaken var att Nodes fetch inte gick genom miljöns proxy.
  console.log(
    `${ejAvgjort} löften gick inte att avgöra — kopian kunde inte hämtas. Det är inte ` +
      "ett besked om kopian. Faller alla på det står något mellan dig och arkivet.",
  );
}
if (strypta > 0) {
  // Skrivs ut för att en strypt körning annars ser fullständig ut: «kvar utan
  // arkiv» blir samma tal oavsett om arkivet svarade nej eller inte hade något.
  console.log(`Arkivet strypte ${strypta} begäranden — kör igen senare innan du drar slutsatser om det som står kvar.`);
}
