/**
 * Inkomstberäkningens tabell ur en budgetmotion, lagd bredvid löftet kopplingen
 * påstår.
 *
 * Beslutet om budgetmotioners yrkanden säger att ett ramverksyrkande inte bär
 * något enskilt löfte **utom** när löftet gäller en skatt eller en avgift och
 * inkomstberäkningsyrkandet binder regeringen att lagstifta. Undantaget kräver
 * då samma sak som anslagsregeln: raden ska hämtas och skrivas ut i motiveringen.
 *
 * `anslag-tabell` läser *utgiftsanslagens* tabell och kan aldrig svara på det —
 * ett skattelöfte kan inte bäras av en utgiftsrad. Det här verktyget läser den
 * andra tabellen i samma dokument.
 *
 *   npm run inkomst-tabell -- k-2026-0665
 *   npm run inkomst-tabell -- --klass-b                    # alla med bara ramverksyrkanden
 *   npm run inkomst-tabell -- k-2026-0665 --allt           # hela tabellen, inte bara träffarna
 *   npm run inkomst-tabell -- --klass-b --json inkomst.json
 *
 * **Verktyget avgör inget.** Det hämtar tabellen, rangordnar raderna efter
 * ordöverlapp mot löftet och skriver ut vad som står. Om löftet gäller en skatt
 * och om raden rör sig av just det löftet gäller är läsningar; att dra in en
 * publicerad koppling är en rättelse som kräver ett mänskligt beslut.
 *
 * Enheten är tabellens egen — budgetårets inkomsttabell anger tusental kronor.
 * Den skrivs ut som den står och räknas inte om.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Handling } from "../src/handlingar.ts";
import type { KopplingPost } from "../src/granskning.ts";
import { fetchYrkanden } from "../src/riksdagen.ts";
import { bindandeInkomstberakning } from "../src/yrkandeslag.ts";
import {
  parseInkomsttabell,
  narmastLoftetMedPoang,
  radensBelopp,
  type Inkomstrad,
  type Inkomsttraff,
} from "../src/inkomsttabell.ts";
import { cachat, hamtaJson, politeFetch } from "./kallcache.mts";

const rot = resolve(import.meta.dirname, "../..");
const kopplingar: KopplingPost[] = JSON.parse(readFileSync(resolve(rot, "data/kopplingar.json"), "utf8"));
const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));

interface Lofte {
  id: string;
  quote?: string;
  title?: string;
  parties?: string[];
  cost?: { msek_base?: number | null; type?: string; calculation?: string };
}
const loften: Lofte[] = JSON.parse(readFileSync(resolve(rot, "../data/promises.json"), "utf8"));

const argv = process.argv.slice(2);
const allt = argv.includes("--allt");
const klassB = argv.includes("--klass-b");
const jsonUt = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : undefined;
const idn = argv.filter((a) => !a.startsWith("--") && a !== jsonUt);

/** En mätning per koppling — allt prövningen behöver, ingenting avgjort. */
interface Matning {
  koppling: string;
  promise_id: string | null;
  parties: string[];
  riktning: string | null;
  dok_id: string | null;
  /**
   * Löftets kostnadstyp. **Underlag för läsningen, inte svaret på den:** tre av
   * de sex kopplingar regeln byggdes för står som `utgift` och gäller ändå
   * arbetsgivaravgifter. Typen säger vilken sida av budgeten beloppet bokförs
   * på, inte vad löftet lovar.
   */
  kostnadstyp: string | null;
  /** Binder motionens inkomstberäkningsyrkande regeringen att återkomma med lagförslag? */
  bindande: boolean;
  /** Antal rader i inkomsttabellen för budgetåret. 0 = ingen tabell hittad. */
  tabellrader: number;
  /**
   * Hela tabellen, inte bara träffarna. Ordöverlappet är en svag läshjälp mot
   * inkomsttitlar — den rad som bär ett löfte om jordbrukets dieselskatt heter
   * "Energiskatt" och delar inget ord med löftets citat — så läsningen måste
   * kunna peka ut vilken rad som helst, och då måste alla finnas att peka på.
   */
  rader: Inkomstrad[];
  traffar: Inkomsttraff[];
  andrade: Inkomsttraff[];
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

function skrivRad(r: Inkomstrad): string {
  const tal = r.avvikelse === null ? "okänd" : r.avvikelse === 0 ? "±0" : String(r.avvikelse);
  return `    ${r.titel.padEnd(6)}${tal.padStart(12)}   ${r.namn.slice(0, 58)}`;
}

/**
 * Klass B: kopplingar vars motion **bara** har ramverksyrkanden. Urvalet kommer
 * ur `data/handlingsklass.json`, som `npm run handlingsklass` skriver ur
 * riksdagens yrkandelistor.
 */
function klassBIdn(): string[] {
  const fil = resolve(rot, "data/handlingsklass.json");
  if (!existsSync(fil)) {
    console.error("data/handlingsklass.json saknas. Kör: npm run handlingsklass -- --skriv");
    process.exit(1);
  }
  const karta: Array<{ koppling: string; motionsslag?: string; i_handlingen?: boolean | null }> =
    JSON.parse(readFileSync(fil, "utf8"));
  const aktiva = new Set(kopplingar.filter((k) => k.status === "aktiv").map((k) => k.id));
  return karta
    .filter((p) => p.motionsslag === "bara_ramverk" && p.i_handlingen !== true && aktiva.has(p.koppling))
    .map((p) => p.koppling);
}

const valda = klassB ? klassBIdn() : idn;

if (valda.length === 0) {
  console.error("Ange koppling-id, eller --klass-b.");
  process.exit(1);
}

for (const id of valda) {
  const k = kopplingar.find((x) => x.id === id);
  if (!k) {
    console.log(`\n${id}  ⚠ finns inte i kopplingar.json`);
    continue;
  }
  const h = handlingPerId.get(k.handling_id);
  const p = k.promise_id === undefined ? undefined : loftePerId.get(k.promise_id);
  const matning: Matning = {
    koppling: id,
    promise_id: k.promise_id ?? null,
    parties: p?.parties ?? [],
    riktning: (k as { riktning?: string }).riktning ?? null,
    dok_id: h?.dok_id ?? null,
    kostnadstyp: p?.cost?.type ?? null,
    bindande: false,
    tabellrader: 0,
    rader: [],
    traffar: [],
    andrade: [],
    fel: null,
  };
  matningar.push(matning);
  console.log("\n" + "─".repeat(78));
  console.log(`${id}  ·  ${h?.kind ?? "?"}  ·  ${h?.dok_id ?? "?"}  ·  ${(h?.titel ?? "").slice(0, 52)}`);
  console.log(`  löfte  ${k.promise_id ?? "—"} (${(p?.parties ?? []).join(",")}): ${(p?.title ?? "").slice(0, 64)}`);
  console.log(`  citat  ${(p?.quote ?? "").slice(0, 150)}`);
  console.log(`  kostnadstyp  ${p?.cost?.type ?? "—"} — säger var beloppet bokförs, inte vad löftet lovar`);

  if (!h?.dok_id) {
    console.log("  ⚠ handlingen har inget dok_id — tabellen går inte att hämta");
    matning.fel = "handlingen har inget dokument-id";
    continue;
  }

  const yrkanden = (await cachat(`yrkanden-${h.dok_id}`, () => fetchYrkanden(politeFetch, h.dok_id))) ?? [];
  matning.bindande = bindandeInkomstberakning(yrkanden.map((y) => y.lydelse));
  console.log(
    `  yrkandet  ${matning.bindande ? "BINDER" : "binder inte"} — inkomstberäkningen ${matning.bindande ? "kräver att regeringen återkommer med lagförslag" : "saknar ledet om lagförslag"}`,
  );

  let rader: Inkomstrad[];
  try {
    rader = parseInkomsttabell(await hamtaHtml(h.dok_id));
  } catch (fel) {
    console.log(`  ⚠ hämtningen gick inte fram: ${(fel as Error).message}`);
    matning.fel = `hämtningen gick inte fram: ${(fel as Error).message}`;
    continue;
  }
  matning.tabellrader = rader.length;
  matning.rader = rader;

  if (rader.length === 0) {
    console.log("  ⚠ INGEN INKOMSTTABELL för budgetåret i dokumentet");
    continue;
  }

  const traff = narmastLoftetMedPoang(rader, `${p?.quote ?? ""} ${p?.title ?? ""}`);
  matning.traffar = traff;
  matning.andrade = traff.filter((t) => t.rad.avvikelse !== null && t.rad.avvikelse !== 0);
  console.log(
    `\n  INKOMSTBERÄKNINGEN — ${rader.length} rader för budgetåret, tusental kronor.` +
      "\n  Tecknet är inkomstens: minus = staten tar in mindre, alltså sänkt skatt.",
  );
  if (traff.length === 0) {
    console.log("    Ingen inkomsttitel delar ett sakord med löftet.");
    console.log("    → Läs hela tabellen med --allt. Inkomsttitlarna är breda, så ordöverlapp");
    console.log("      är en svag läshjälp här och inget bevis på att raden saknas.");
  } else {
    console.log("    Titlar som delar ett sakord med löftet, snävast och närmast först:");
    for (const t of traff.slice(0, allt ? traff.length : 8)) {
      console.log(`${skrivRad(t.rad)}  (${t.poang})`);
    }
    if (matning.andrade.length === 0) {
      console.log("\n    Samtliga står ±0 eller okänd: motionen begärde ingen ändring av");
      console.log("    den skatten. Bär inget annat löftet är utfallet indragning.");
    }
  }
  if (allt) {
    console.log("\n    Hela tabellen:");
    for (const r of rader) console.log(skrivRad(r));
  }
}

if (jsonUt !== undefined) {
  writeFileSync(resolve(jsonUt), JSON.stringify(matningar, null, 1) + "\n");
  console.log(`\nSkrivet: ${jsonUt} (${matningar.length} mätningar)`);
}

console.log(
  `\n${valda.length} prövade. Talen är ingen genomgång: om löftet gäller en skatt och om raden` +
    "\nrör sig av just det löftet gäller är läsningar mot motionens egen reformtabell.",
);
