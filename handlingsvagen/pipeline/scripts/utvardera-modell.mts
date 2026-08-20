/**
 * Duger en billigare modell för matchningen?
 *
 * VARFÖR DET GÅR ATT MÄTA. Matchningen är det enda av våra modelljobb som har
 * ett facit: `provade-par.json` minns varje par som prövats, och
 * `kopplingar.json` vilka en människa godkände. Det är hundratals etiketterade
 * exempel som redan ligger i repot. Skriptet kör en kandidatmodell över ett
 * urval av dem och jämför med människans dom.
 *
 * DE TVÅ FELEN ÄR INTE LIKA ILLA.
 *
 *   · **Missad koppling** (människan sa ja, modellen nej) kostar täckning.
 *     Den syns som en långsammare kö och inget annat — sajten blir inte fel.
 *   · **Påhittad koppling** (människan sa nej, modellen ja) kostar
 *     granskningstid, och skulle den slinka igenom en människa kostar den
 *     trovärdighet. Den är den dyra.
 *
 * Grindarna fångar en del av det andra felet på egen hand — citatet måste stå
 * ordagrant i dokumentet — så skriptet skiljer «modellen föreslog något som
 * föll i grinden» från «modellen föreslog något som gick igenom». Bara det
 * senare är en påhittad koppling som når en människa.
 *
 * KOSTNADEN MÄTS OCKSÅ. Varje anrop bär hela dokumentets text, och dokumenten
 * är olika stora — en interpellation är tusen tecken, en proposition tvåhundra
 * tusen. Skriptet redovisar tecken in per anrop, så två modeller går att
 * jämföra på vad de faktiskt kostar och inte bara på listpris.
 *
 *   node --import tsx/esm scripts/utvardera-modell.mts --modell <id> --antal 40
 *   node --import tsx/esm scripts/utvardera-modell.mts --modell <id> --antal 40 --json ut.json
 *
 * Kräver LLM_API_KEY och LLM_BASE_URL som förslagskörningen. Läser bara —
 * skriver ingen data, rör aldrig kön och committar ingenting.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchDokumentText, fetchUtskottspunkter, fetchYrkanden, type HttpFetch, type Utskottspunkt, type Yrkande } from "../src/riksdagen.ts";
import type { Betankande } from "../src/betankanden.ts";
import type { Handling } from "../src/handlingar.ts";
import { OpenRouterClient } from "../src/llm.ts";
import { skapaForslag, byggPrompt, type Lofte } from "../src/foreslag.ts";
import { LAGE_A_FONSTER } from "../src/grindar.ts";
import { parNyckel } from "../src/provade.ts";

const rot = resolve(import.meta.dirname, "../..");
const las = <T,>(p: string): T => JSON.parse(readFileSync(resolve(rot, p), "utf8")) as T;

function flagga(namn: string, standard?: string): string | undefined {
  const i = process.argv.indexOf(`--${namn}`);
  return i >= 0 ? process.argv[i + 1] : standard;
}
const MODELL = flagga("modell");
const ANTAL = Number(flagga("antal", "40"));
const JSONUT = flagga("json");
if (!MODELL) {
  console.error('Användning: --modell <id> [--antal 40] [--json ut.json]');
  process.exit(1);
}

interface Koppling { promise_id?: string; stance_id?: string; handling_id: string; status?: string }

const handlingar = new Map(las<Handling[]>("data/handlingar.json").map((h) => [h.id, h]));
const loften = new Map(
  las<Array<Lofte & { status?: string }>>("../data/promises.json")
    .filter((l) => (l.status ?? "aktiv") === "aktiv")
    .map((l) => [l.id, l]),
);
const betPath = resolve(rot, "data/betankanden.json");
const betankanden = new Map(
  (existsSync(betPath) ? las<Betankande[]>("data/betankanden.json") : []).map((b) => [b.dok_id, b]),
);
const kopplingar = las<Koppling[]>("data/kopplingar.json");
const provade = las<string[]>("data/provade-par.json");

// Facit. Ett par är POSITIVT om en människa godkänt det. Det är NEGATIVT om
// paret prövats men aldrig blivit en godkänd koppling — och inte heller
// ligger i kön och väntar på ett beslut, för då är domen inte fälld ännu.
const godkanda = new Set(
  kopplingar.filter((k) => k.status === "aktiv").map((k) => parNyckel(k.promise_id ?? k.stance_id ?? "", k.handling_id)),
);
const avgjorda = new Set(kopplingar.map((k) => parNyckel(k.promise_id ?? k.stance_id ?? "", k.handling_id)));
const koPath = resolve(rot, "data/kopplingsforslag.json");
const iKo = new Set(
  (existsSync(koPath) ? las<Koppling[]>("data/kopplingsforslag.json") : []).map((k) =>
    parNyckel(k.promise_id ?? k.stance_id ?? "", k.handling_id),
  ),
);

interface Prov { nyckel: string; lofteId: string; handlingId: string; facit: boolean }
const positiva: Prov[] = [];
const negativa: Prov[] = [];
for (const nyckel of provade) {
  const [lofteId, handlingId] = nyckel.split("::");
  if (!lofteId || !handlingId) continue;
  if (!loften.has(lofteId) || !handlingar.has(handlingId)) continue;
  if (godkanda.has(nyckel)) positiva.push({ nyckel, lofteId, handlingId, facit: true });
  else if (!avgjorda.has(nyckel) && !iKo.has(nyckel)) negativa.push({ nyckel, lofteId, handlingId, facit: false });
}

/**
 * Lika många av varje. Facit är kraftigt obalanserat — omkring elva procent av
 * de prövade paren blev en koppling — och ett urval som speglar den obalansen
 * mäter mest hur bra modellen är på att säga nej. Båda felen ska synas.
 */
function taUt<T>(lista: T[], n: number): T[] {
  const steg = Math.max(1, Math.floor(lista.length / n));
  const ut: T[] = [];
  for (let i = 0; i < lista.length && ut.length < n; i += steg) ut.push(lista[i]!);
  return ut;
}
const halva = Math.max(1, Math.floor(ANTAL / 2));
const urval = [...taUt(positiva, halva), ...taUt(negativa, ANTAL - halva)];

console.log(`facit: ${positiva.length} godkända par, ${negativa.length} avvisade par`);
console.log(`urval: ${urval.length} par (${Math.min(halva, positiva.length)} ja / ${urval.length - Math.min(halva, positiva.length)} nej)`);
console.log(`modell: ${MODELL}\n`);

const apiKey = process.env["LLM_API_KEY"] ?? process.env["OPENROUTER_API_KEY"];
const baseUrl = process.env["LLM_BASE_URL"];
if (!apiKey) throw new Error("LLM_API_KEY (eller OPENROUTER_API_KEY) krävs");
const llm = new OpenRouterClient({
  apiKey,
  ...(baseUrl ? { baseUrl } : {}),
  ...(process.env["LLM_FALLBACK_BASE_URL"] ? { fallbackBaseUrl: process.env["LLM_FALLBACK_BASE_URL"] } : {}),
  ...(process.env["LLM_FALLBACK_API_KEY"] ? { fallbackApiKey: process.env["LLM_FALLBACK_API_KEY"] } : {}),
});
const systemPrompt = readFileSync(resolve(import.meta.dirname, "../prompts/koppling.md"), "utf8");
const politeFetch: HttpFetch = ((u: string, o?: RequestInit) => fetch(u, o)) as never;

let ja_ja = 0, ja_nej = 0, nej_ja = 0, nej_nej = 0, grindfall = 0, fel = 0;
let teckenIn = 0, anrop = 0;
const start = Date.now();
const rader: Array<Record<string, unknown>> = [];

for (const p of urval) {
  const lofte = loften.get(p.lofteId)!;
  const handling = handlingar.get(p.handlingId)!;
  const bet = handling.kind === "votering" ? betankanden.get(handling.dok_id) : undefined;
  try {
    const kalltext = await fetchDokumentText(politeFetch, bet?.dok_id ?? handling.dok_id);
    let punkt: Utskottspunkt | undefined;
    if (bet) {
      const punkter = await fetchUtskottspunkter(politeFetch, bet.dok_id);
      punkt = punkter.find((x) => x.punkt === handling.punkt);
    }
    let yrkanden: Yrkande[] | undefined;
    if (!bet && handling.kind === "motion") {
      try { yrkanden = await fetchYrkanden(politeFetch, handling.dok_id); } catch { yrkanden = undefined; }
    }
    teckenIn += byggPrompt(lofte, handling, kalltext, bet, punkt, yrkanden).length + systemPrompt.length;
    anrop += 1;
    const { forslag, grindfel } = await skapaForslag(
      llm, systemPrompt, MODELL, lofte, handling, kalltext, LAGE_A_FONSTER, bet, punkt, yrkanden,
    );
    const sa_ja = forslag !== null && grindfel.length === 0;
    if (forslag !== null && grindfel.length > 0) grindfall += 1;
    if (p.facit && sa_ja) ja_ja += 1;
    else if (p.facit && !sa_ja) ja_nej += 1;
    else if (!p.facit && sa_ja) nej_ja += 1;
    else nej_nej += 1;
    rader.push({ ...p, modell_ja: sa_ja, grindfel: grindfel.map((g) => g.grind) });
    process.stdout.write(p.facit === sa_ja ? "." : p.facit ? "M" : "F");
  } catch (e) {
    fel += 1;
    process.stdout.write("!");
    rader.push({ ...p, fel: e instanceof Error ? e.message : String(e) });
  }
}

const sek = Math.round((Date.now() - start) / 1000);
const provade_n = ja_ja + ja_nej + nej_ja + nej_nej;
const pct = (n: number, av: number) => (av === 0 ? "—" : `${((n / av) * 100).toFixed(0)} %`);
console.log(`\n\n${provade_n} par prövade på ${sek} s (${fel} föll på fel)\n`);
console.log("                     modellen ja   modellen nej");
console.log(`  människan ja   ${String(ja_ja).padStart(12)}${String(ja_nej).padStart(15)}   ← ${pct(ja_ja, ja_ja + ja_nej)} av de riktiga hittade`);
console.log(`  människan nej  ${String(nej_ja).padStart(12)}${String(nej_nej).padStart(15)}   ← ${pct(nej_ja, nej_ja + nej_nej)} påhittade`);
console.log(`\n  därtill ${grindfall} förslag som grindarna fällde innan de nådde en människa`);
console.log(`\nKOSTNAD  ${anrop} anrop · ${(teckenIn / 1000).toFixed(0)} k tecken in`);
console.log(`         ${Math.round(teckenIn / Math.max(1, anrop))} tecken per anrop i snitt (≈${Math.round(teckenIn / Math.max(1, anrop) / 3.6)} tokens)`);
console.log(`         hela facit på ${provade.length} par hade kostat ≈${((teckenIn / Math.max(1, anrop)) * provade.length / 1e6).toFixed(1)} M tecken`);

if (JSONUT) {
  writeFileSync(JSONUT, JSON.stringify({ modell: MODELL, ja_ja, ja_nej, nej_ja, nej_nej, grindfall, fel, anrop, teckenIn, sek, rader }, null, 2) + "\n");
  console.log(`\nSkrivet: ${JSONUT}`);
}
