/**
 * Anslagstabellen ur en budgetmotion, lagd bredvid löftet kopplingen påstår.
 *
 * Beslutet b-0039 säger att ett anslagsyrkande kan bära ett löfte som består i
 * pengar **när motionens tabell har en rad för saken** — och att kopplingen ska
 * dras in när raden saknas. Det går inte att avgöra utan att läsa tabellen, och
 * det finns 103 sådana kopplingar. Det här verktygets enda uppgift är att göra
 * den frågan besvarbar en post i taget.
 *
 *   npm run anslag-tabell -- k-2026-0674
 *   npm run anslag-tabell -- --klass-a            # alla med bara anslagsyrkande
 *   npm run anslag-tabell -- k-2026-0674 --allt   # hela tabellen, inte bara träffarna
 *   npm run anslag-tabell -- --klass-a --json rader.json   # mätvärdena, maskinläsbart
 *
 * `--json` finns för att prövningen ska kunna vila på mätvärden i stället för
 * på en utskrift någon läst. Utan den måste varje invändning om en anslagsrad
 * skrivas för hand ur en textutskrift, och just den räkningen har gått fel förr.
 *
 * **Verktyget avgör inget.** Det hämtar tabellen, rangordnar raderna efter
 * ordöverlapp mot löftet och skriver ut vad som står. Om raden bär löftet är en
 * läsning, och att byta eller dra in en publicerad koppling är en rättelse som
 * kräver ett mänskligt beslut.
 *
 * Enheten är tabellens egen — riksdagens utgiftsområdestabeller anger normalt
 * tusental kronor. Den skrivs ut som den står och räknas inte om.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Handling } from "../src/handlingar.ts";
import type { KopplingPost } from "../src/granskning.ts";
import {
  parseAnslagstabell,
  narmastLoftetMedPoang,
  type Anslagsrad,
  type Radtraff,
} from "../src/anslagstabell.ts";
import { cachat, hamtaJson } from "./kallcache.mts";

const rot = resolve(import.meta.dirname, "../..");
const kopplingar: KopplingPost[] = JSON.parse(readFileSync(resolve(rot, "data/kopplingar.json"), "utf8"));
const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));

/**
 * Löftena, med kostnadsfältet. Beloppet hör med i mätningen, men det **avgör
 * inte** om löftet består i pengar: ett brett uppräkningslöfte prissätts till
 * noll för att delarna inte ska dubbelräknas och handlar ändå om pengar, medan
 * en reglering kan bära ett belopp som bara är handläggning. Läsningen står i
 * `data/loftets-slag.json`; det här fältet är underlag för den, inte svaret.
 */
interface Lofte {
  id: string;
  quote?: string;
  title?: string;
  parties?: string[];
  cost?: { msek_base?: number | null; type?: string };
}
const loften: Lofte[] = JSON.parse(readFileSync(resolve(rot, "../data/promises.json"), "utf8"));

const argv = process.argv.slice(2);
const allt = argv.includes("--allt");
const klassA = argv.includes("--klass-a");
const jsonUt = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : undefined;
const idn = argv.filter((a) => !a.startsWith("--") && a !== jsonUt);

/** En mätning per koppling — allt prövningen behöver, ingenting avgjort. */
interface Matning {
  koppling: string;
  promise_id: string | null;
  parties: string[];
  riktning: string | null;
  dok_id: string | null;
  /** Löftets basbelopp i miljoner kronor. Underlag för läsningen, inte svaret på den. */
  lofte_msek: number | null;
  /** Antal rader i motionens anslagstabell. 0 = ingen tabell hittad. */
  tabellrader: number;
  /**
   * Raderna som delar ett sakord med löftet, närmast först, med överlappet som
   * ett tal. Talet skiljer en verklig träff från ett sammanträffande i en
   * ordstam, och utan det kan en fel rad skrivas in som löftets bärare.
   */
  traffar: Radtraff[];
  /** Träffar som bär en ändring skild från noll. */
  andrade: Radtraff[];
  /** Gick tabellen inte att hämta eller läsa? Då är frågan obesvarad, inte besvarad med nej. */
  fel: string | null;
}
const matningar: Matning[] = [];

const handlingPerId = new Map(handlingar.map((h) => [h.id, h]));
const loftePerId = new Map(loften.map((p) => [p.id, p]));

/** Dokumentets rå-HTML — tabellen finns bara där, den utplattade texten tappar den. */
async function hamtaHtml(dokId: string): Promise<string> {
  const payload = (await cachat(`dokstatus-${dokId}`, () =>
    hamtaJson(`https://data.riksdagen.se/dokumentstatus/${dokId}.json`),
  )) as { dokumentstatus?: { dokument?: { html?: unknown } } } | null;
  if (payload === null) throw new Error(`${dokId}: hämtningen gick inte fram`);
  const html = payload.dokumentstatus?.dokument?.html;
  if (typeof html !== "string" || html === "") throw new Error(`${dokId}: ingen dokumenttext`);
  return html;
}

function skrivRad(r: Anslagsrad): string {
  const tal = r.avvikelse === null ? "okänd" : r.avvikelse === 0 ? "±0" : String(r.avvikelse);
  return `    ${r.anslag.padEnd(7)}${tal.padStart(9)}   ${r.namn.slice(0, 62)}`;
}

/**
 * Klass A: kopplingar vars citat står i motionens brödtext och vars motion
 * **bara** har anslagsyrkanden. Urvalet kommer ur `data/handlingsklass.json`,
 * som `npm run handlingsklass` skriver ur riksdagens yrkandelistor.
 *
 * Fältet `motionstyp` går inte att använda här. Det säger vem som väckte
 * motionen — parti, kommitté eller enskild ledamot — inte vad den yrkar, och
 * ett urval på det plockar 670 kopplingar i stället för 99.
 */
function klassAIdn(): string[] {
  const fil = resolve(rot, "data/handlingsklass.json");
  if (!existsSync(fil)) {
    console.error("data/handlingsklass.json saknas. Kör: npm run handlingsklass -- --skriv");
    process.exit(1);
  }
  const karta: Array<{ koppling: string; motionsslag?: string; i_handlingen?: boolean | null }> =
    JSON.parse(readFileSync(fil, "utf8"));
  return karta
    .filter((p) => p.motionsslag === "bara_anslag" && p.i_handlingen !== true)
    .map((p) => p.koppling);
}

const valda = klassA ? klassAIdn() : idn;

if (valda.length === 0) {
  console.error("Ange koppling-id, eller --klass-a. Se b-0039 för vad tabellen avgör.");
  process.exit(1);
}

let bar = 0;
let orort = 0;
let saknas = 0;

for (const id of valda) {
  const k = kopplingar.find((x) => x.id === id);
  if (!k) {
    console.log(`\n${id}  ⚠ finns inte i kopplingar.json`);
    continue;
  }
  const h = handlingPerId.get(k.handling_id);
  // En koppling utan löfte kan inte prövas mot ett löftes sakord; säg det i
  // stället för att låta tabellen se ut som ett svar på ingen fråga.
  const p = k.promise_id === undefined ? undefined : loftePerId.get(k.promise_id);
  const matning: Matning = {
    koppling: id,
    promise_id: k.promise_id ?? null,
    parties: p?.parties ?? [],
    riktning: (k as { riktning?: string }).riktning ?? null,
    dok_id: h?.dok_id ?? null,
    lofte_msek: p?.cost?.msek_base ?? null,
    tabellrader: 0,
    traffar: [],
    andrade: [],
    fel: null,
  };
  matningar.push(matning);
  console.log("\n" + "─".repeat(78));
  console.log(`${id}  ·  ${h?.kind ?? "?"}  ·  ${h?.dok_id ?? "?"}  ·  ${(h?.titel ?? "").slice(0, 52)}`);
  console.log(`  löfte  ${k.promise_id ?? "—"} (${(p?.parties ?? []).join(",")}): ${(p?.title ?? "").slice(0, 64)}`);
  console.log(`  citat  ${(p?.quote ?? "").slice(0, 150)}`);

  if (!h?.dok_id) {
    console.log("  ⚠ handlingen har inget dok_id — tabellen går inte att hämta");
    matning.fel = "handlingen har inget dokument-id";
    saknas++;
    continue;
  }

  let rader: Anslagsrad[];
  try {
    rader = parseAnslagstabell(await hamtaHtml(h.dok_id));
  } catch (fel) {
    console.log(`  ⚠ hämtningen gick inte fram: ${(fel as Error).message}`);
    matning.fel = `hämtningen gick inte fram: ${(fel as Error).message}`;
    saknas++;
    continue;
  }
  matning.tabellrader = rader.length;

  if (rader.length === 0) {
    console.log("  ⚠ INGEN ANSLAGSTABELL i dokumentet — då kan yrkandet inte bära ett belopp");
    saknas++;
    continue;
  }

  const traff = narmastLoftetMedPoang(rader, `${p?.quote ?? ""} ${p?.title ?? ""}`);
  matning.traffar = traff;
  matning.andrade = traff.filter((t) => t.rad.avvikelse !== null && t.rad.avvikelse !== 0);
  console.log(`\n  ANSLAGSTABELLEN — ${rader.length} rader, enheten är tabellens egen (normalt tusental kronor)`);
  if (traff.length === 0) {
    console.log("    Ingen rad delar ett sakord med löftet.");
    console.log("    → Läs hela tabellen med --allt innan du drar slutsatsen. Ordöverlapp");
    console.log("      är en läshjälp, inte ett bevis på att raden saknas.");
  } else {
    console.log("    Rader som delar ett sakord med löftet, närmast först (delade ord i parentes):");
    for (const t of traff.slice(0, allt ? traff.length : 6)) {
      console.log(`${skrivRad(t.rad)}  (${t.poang})`);
    }
    const rort = traff.filter((t) => t.rad.avvikelse !== null && t.rad.avvikelse !== 0);
    if (rort.length > 0) {
      console.log(`\n    ${rort.length} av dem bär en ändring — kopplingen kan hålla efter ett bevisbyte.`);
      bar++;
    } else {
      console.log("\n    Samtliga står ±0 eller okänd: motionen begärde ingen ändring av");
      console.log("    det löftet gäller. Bär inget annat löftet är utfallet indragning.");
      orort++;
    }
  }
  if (allt) {
    console.log("\n    Hela tabellen:");
    for (const r of rader) console.log(skrivRad(r));
  }
}

if (valda.length > 1) {
  console.log("\n" + "═".repeat(78));
  console.log(`${valda.length} prövade · ${bar} har en rad med ändring · ${orort} bara ±0 · ${saknas} kunde inte läsas`);
  console.log("Talen är ingen genomgång. Varje post ska läsas innan den föreslås.");
}

if (jsonUt !== undefined) {
  writeFileSync(resolve(jsonUt), JSON.stringify(matningar, null, 1) + "\n");
  console.log(`\nSkrivet: ${jsonUt} (${matningar.length} mätningar)`);
}
