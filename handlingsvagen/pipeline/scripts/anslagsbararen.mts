/**
 * Svepet över de kopplingar vars enda yrkande är ett anslagsyrkande.
 *
 * Beslutet 2026-08-07 avgör dem, men bara om någon lägger tabellraden bredvid
 * löftet. 99 publicerade kopplingar väntade på det, och att läsa dem ur en
 * textutskrift är just det arbete som gått fel förr. Det här skriptet lägger
 * mätvärdena från `anslag-tabell --json` mot läsningen i
 * `data/loftets-slag.json` och skriver vad var och en av dem blir.
 *
 *   npm run anslagsbararen -- --matning rader.json
 *   npm run anslagsbararen -- --matning rader.json --json utfall.json
 *   npm run anslagsbararen -- --matning rader.json --skriv
 *
 * `--skriv` gör två saker och bara två: skriver tabellraden i motiveringen för
 * de kopplingar som bär, och drar in de som faller med skälet skrivet på var och
 * en. Båda är rättelser av publicerat material, så körningen skriver också
 * **en** post i `data/rattelser.json` — rättelser samlas.
 *
 * **Skriptet läser inte löftet.** Om ett löfte består i pengar eller i en regel
 * står i `data/loftets-slag.json`, skrivet av en människa med skälet utskrivet.
 * Saknas löftet där behandlas det som pengar när det är prissatt som en utgift
 * eller en besparing, och skriptet säger hur många som gick in på den vägen.
 *
 * **Skriptet väljer inte heller rad.** Om tabellraden pekar på löftets egen sak
 * eller bara delar en ordstam med den står i `data/anslagsraden-last.json`, också
 * det en läsning per par med skälet utskrivet. Saknas paret där gäller svepets
 * tröskel för hur många ordled som måste delas, och då kan utfallet bli att
 * posten lämnas till en läsning i stället för att avgöras.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { KopplingPost } from "../src/granskning.ts";
import type { Anslagsrad } from "../src/anslagstabell.ts";
import {
  provaAnslagsbararen,
  motiveringsnot,
  utanTidigareAnslagsnot,
  radensBelopp,
  type Anslagsmatning,
  type Anslagsutfall,
  type Loftetsslag,
} from "../src/anslagsbararen.ts";
import { svenskDag } from "../../../pipeline/src/dagen.ts";

const rot = resolve(import.meta.dirname, "../..");
const argv = process.argv.slice(2);
const varde = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const skriv = argv.includes("--skriv");
const jsonUt = varde("--json");
const matningsfil = varde("--matning");
const datum = svenskDag();

if (matningsfil === undefined) {
  console.error("Ange --matning <fil> — utdata från: npm run anslag-tabell -- --klass-a --json <fil>");
  process.exit(1);
}

const matningar: Anslagsmatning[] = JSON.parse(readFileSync(resolve(matningsfil), "utf8"));
const kopplingarPath = resolve(rot, "data/kopplingar.json");
const kopplingar: KopplingPost[] = JSON.parse(readFileSync(kopplingarPath, "utf8"));
const rattelserPath = resolve(rot, "data/rattelser.json");

interface Lasning {
  las: Array<{ id: string; slag: Loftetsslag; skal: string }>;
}
const lasning: Lasning = JSON.parse(readFileSync(resolve(rot, "data/loftets-slag.json"), "utf8"));
const slagPerLofte = new Map(lasning.las.map((l) => [l.id, l]));

/** Läsningen av om raden pekar på löftets sak, en koppling i taget. */
interface Radlasning {
  par: Array<{ koppling: string; rad: string; bar: boolean; skal: string }>;
}
const radlasning: Radlasning = JSON.parse(
  readFileSync(resolve(rot, "data/anslagsraden-last.json"), "utf8"),
);
const radPerKoppling = new Map(radlasning.par.map((r) => [r.koppling, r]));

interface Lofte {
  id: string;
  cost?: { type?: string; msek_base?: number | null };
}
const loften: Lofte[] = JSON.parse(readFileSync(resolve(rot, "../data/promises.json"), "utf8"));
const loftePerId = new Map(loften.map((p) => [p.id, p]));

/**
 * Löftets slag: läsningen först, kostnadstypen sedan.
 *
 * Kostnadstypen räcker bara för att skilja ut skattelöften, och den skillnaden
 * är verklig — en intäktsminskning eller intäktsökning är per definition inte
 * ett utgiftsanslag. Att av ett belopp sluta sig till att löftet består i pengar
 * går däremot inte, och därför är `pengar` här ett antagande som körningen
 * räknar och redovisar i stället för att gömma.
 */
function loftetsSlag(promiseId: string | null): { slag: Loftetsslag; last: boolean } {
  if (promiseId === null) return { slag: "pengar", last: false };
  const l = slagPerLofte.get(promiseId);
  if (l) return { slag: l.slag, last: true };
  const typ = loftePerId.get(promiseId)?.cost?.type ?? "";
  if (typ === "intäktsminskning" || typ === "intäktsökning") return { slag: "skatt", last: false };
  return { slag: "pengar", last: false };
}

interface Utfallsrad {
  koppling: string;
  promise_id: string | null;
  utfall: Anslagsutfall;
  slag: Loftetsslag;
  slaget_last: boolean;
  rad: string | null;
  innebord: string;
  atgard: "skriv-raden-i-motiveringen" | "dra-in" | "las-tabellen" | "ingen";
}

const utfall: Utfallsrad[] = [];
/** Raden läsningen pekade ut, per koppling — den ska i motiveringen. */
const radPerId = new Map<string, Anslagsrad>();
/** Läsningens skäl, per koppling — det ska stå efter raden i motiveringen. */
const skalPerId = new Map<string, string>();
let antagna = 0;
let lasta = 0;

/**
 * Utfall där läsningen får avgöra.
 *
 * Alla tre är fall där svepet **inte** kunde avgöra saken och sa så: ett enda
 * gemensamt ordled, en rad som rör sig åt andra hållet, eller ingen rad alls med
 * ett gemensamt ordled. Att en regel eller en skatt inte kan bäras av ett
 * anslagsyrkande, eller att raderna för saken står stilla, är däremot avgjort av
 * beslutet — där gäller läsningen inte.
 */
const AVGORS_AV_LASNING: Anslagsutfall[] = [
  "svag_traff",
  "raden_gar_andra_vagen",
  "ingen_rad_delar_sakord",
];

for (const m of matningar) {
  const { slag, last } = loftetsSlag(m.promise_id);
  if (!last && slag === "pengar") antagna++;
  let p = provaAnslagsbararen(m, slag);

  // Läsningen slår svepet, men bara där svepet självt sa att det inte kunde
  // avgöra. En regel, en skatt eller en stillastående rad står kvar: läsningen
  // gäller frågan om raden handlar om löftets sak, inte om beslutet tillåter
  // att den bär.
  const l = radPerKoppling.get(m.koppling);
  if (l && AVGORS_AV_LASNING.includes(p.utfall)) {
    lasta++;
    // Läsningen får peka ut vilken rad som helst i tabellen. Ordöverlappet
    // hittar inte alltid den rad som bär — «Ekokrim – inrättande av ny
    // myndighet» delar inget ordled med löftet om att ersätta
    // Ekobrottsmyndigheten — så en läsning som bara kunde bekräfta svepets egen
    // rad hade inte räckt för att avgöra de posterna.
    const utpekad = (m.rader ?? []).find((r) => r.anslag === l.rad || `${r.anslag} ${r.namn}` === l.rad);
    if (l.bar && utpekad === undefined && p.rad === null) {
      p = {
        utfall: "oavgjort",
        rad: null,
        innebord: `Läsningen pekar ut raden ${l.rad}, men den finns inte i den hämtade tabellen.`,
        drasIn: false,
        kraverLasning: true,
      };
    } else if (l.bar) {
      p = { utfall: "bar", rad: utpekad ?? p.rad, innebord: l.skal, drasIn: false, kraverLasning: false };
    } else {
      p = {
        utfall: "raden_handlar_om_annat",
        rad: utpekad ?? p.rad,
        innebord: l.skal,
        drasIn: true,
        kraverLasning: false,
      };
    }
    if (p.utfall === "bar") skalPerId.set(m.koppling, l.skal);
  }

  if (p.utfall === "bar" && p.rad) radPerId.set(m.koppling, p.rad);

  utfall.push({
    koppling: m.koppling,
    promise_id: m.promise_id,
    utfall: p.utfall,
    slag,
    slaget_last: last,
    rad: p.rad === null ? null : `${p.rad.anslag} ${p.rad.namn} ${radensBelopp(p.rad)}`,
    innebord: p.innebord,
    atgard: p.utfall === "bar" ? "skriv-raden-i-motiveringen" : p.drasIn ? "dra-in" : "las-tabellen",
  });
}

// ──────────────────────────────────────────────────────────────── utskrift ──

const rakna = (u: Anslagsutfall) => utfall.filter((r) => r.utfall === u).length;
console.log(`\n${utfall.length} kopplingar prövade mot beslutet om anslagsyrkanden.\n`);
console.log(`  bär löftet, raden ska i motiveringen   ${String(rakna("bar")).padStart(4)}`);
console.log(`  raden står ±0 — motionen begärde inget ${String(rakna("raden_star_stilla")).padStart(4)}`);
console.log(`  löftet är en regel, inte pengar        ${String(rakna("loftet_ar_en_regel")).padStart(4)}`);
console.log(`  löftet är en skatt                    ${String(rakna("loftet_ar_en_skatt")).padStart(4)}`);
console.log(`  motionen har ingen anslagstabell       ${String(rakna("ingen_tabell")).padStart(4)}`);
console.log(`  ingen rad delar sakord — läs tabellen  ${String(rakna("ingen_rad_delar_sakord")).padStart(4)}`);
console.log(`  raden handlar om något annat           ${String(rakna("raden_handlar_om_annat")).padStart(4)}`);
console.log(`  raden går andra vägen — läs motionen   ${String(rakna("raden_gar_andra_vagen")).padStart(4)}`);
console.log(`  bara ett gemensamt ordled — läs raden   ${String(rakna("svag_traff")).padStart(4)}`);
console.log(`  tabellen gick inte att läsa            ${String(rakna("oavgjort")).padStart(4)}`);
console.log(
  `\n  ${antagna} av dem vilar på antagandet att löftet består i pengar, alltså på kostnadstypen\n` +
    "  och inte på en läsning. Står de emot en granskare avgörs det av läsningen, inte av svepet.\n" +
    `  ${lasta} avgjordes av läsningen i data/anslagsraden-last.json i stället för av tröskeln.`,
);

const drasIn = utfall.filter((r) => r.atgard === "dra-in");
const barLoftet = utfall.filter((r) => r.atgard === "skriv-raden-i-motiveringen");
const lasas = utfall.filter((r) => r.atgard === "las-tabellen");

if (lasas.length > 0) {
  console.log(`\nDe ${lasas.length} som kräver en läsning innan något görs:`);
  for (const r of lasas) console.log(`  ${r.koppling}  ${r.promise_id}  ${r.utfall}`);
}

if (jsonUt !== undefined) {
  writeFileSync(resolve(jsonUt), JSON.stringify(utfall, null, 1) + "\n");
  console.log(`\nSkrivet: ${jsonUt} (${utfall.length} rader)`);
}

// ─────────────────────────────────────────────────────────── verkställighet ──

if (!skriv) {
  console.log("\nIngenting skrivet. Kör med --skriv för att verkställa.");
  process.exit(0);
}

const perId = new Map(kopplingar.map((k) => [k.id, k]));
const rorda: string[] = [];
const berordaLoften = new Set<string>();

for (const r of barLoftet) {
  const k = perId.get(r.koppling);
  const rad = radPerId.get(r.koppling);
  if (!k || !rad) continue;
  // Läsningens skäl följer med in i motiveringen när det finns ett. Utan det
  // ser läsaren bara ett belopp: att raden 1:1 Polismyndigheten står på −261 000
  // säger ingenting om att motionen omfördelar 500 miljoner inom just det
  // anslaget till löftets sak, och ett minustecken utan den förklaringen läses
  // som en nedskärning.
  const skal = skalPerId.get(r.koppling);
  k.method_note = [
    utanTidigareAnslagsnot(k.method_note ?? ""),
    motiveringsnot(rad, datum),
    skal ?? "",
  ]
    .filter((d) => d !== "")
    .join(" ")
    .trim();
  // Fältet bredvid prosan: raden vi just skrev ut ÄR grunden för att citatet
  // står utanför yrkandena, och den grunden ska gå att pröva utan att läsa
  // löptext. Se src/brodtextspar.ts.
  k.bevis = { ...k.bevis, brodtext_oppen: "anslagsrad" };
  rorda.push(k.id);
  if (k.promise_id) berordaLoften.add(k.promise_id);
}

for (const r of drasIn) {
  const k = perId.get(r.koppling);
  if (!k) continue;
  // Samma form som de 53 tidigare indragningarna: statusen plus ett eget
  // `indragen`-fält med datum och skäl. Skälet i motiveringen räcker inte —
  // rutnätet läser fältet, och en indragning utan skäl går inte att granska.
  k.status = "indragen";
  k.indragen = { datum, skal: r.innebord };
  rorda.push(k.id);
  if (k.promise_id) berordaLoften.add(k.promise_id);
}

writeFileSync(kopplingarPath, JSON.stringify(kopplingar, null, 2) + "\n");

/** En rättelsepost för hela genomgången — rättelser samlas. */
const rattelser = JSON.parse(readFileSync(rattelserPath, "utf8")) as unknown[];
rattelser.push({
  date: datum,
  affects:
    `Handlingsvågens rutnät och löftessidorna för ${[...berordaLoften].sort().join(", ")} — ` +
    `${barLoftet.length} kopplingar har fått anslagsraden utskriven i motiveringen och ` +
    `${drasIn.length} är tillbakadragna.`,
  what:
    "En budgetmotion vars enda yrkande är att anvisa anslagen enligt en tabell säger i sitt yrkande " +
    "ingenting om vad pengarna ska gå till — det står i tabellen, som ingår i yrkandet genom " +
    "hänvisningen. Vi har hämtat tabellen ur varje sådan motion och lagt raderna bredvid löftet. " +
    `För ${barLoftet.length} kopplingar finns en rad för just det löftet gäller, och den raden står nu ` +
    "utskriven i motiveringen med anslagets nummer, dess namn och vad motionen begär mot regeringens " +
    "förslag — och där en läsning har avgjort vilken rad som bär står också skälet för den läsningen, " +
    "eftersom ett belopp utan sin förklaring kan läsas som motsatsen till vad motionen begär. " +
    `För ${drasIn.length} kopplingar bär motionen inte löftet: antingen står tabellens rader ` +
    "för saken oförändrade, eller så är löftet inte ett löfte om pengar utan om en lag, en modell, ett " +
    "villkor eller en skatt — och då kan ett belopp inte uttrycka det, hur nära anslaget än ligger. De " +
    "kopplingarna är tillbakadragna med skälet skrivet på var och en.",
  why:
    "Ett belägg ska visa vad partiet faktiskt gjorde, och för en anslagsmotion är det tabellraden. Utan " +
    "den vet läsaren bara att vi hänvisar till en budgetmotion, inte vilken rad i den som bär löftet, och " +
    "kan alltså inte kontrollera oss. Att ett anslag råkar ligga nära ett löfte är inte samma sak som att " +
    "motionen begärde pengar för löftet — och att pengar går till en myndighet är inte samma sak som att " +
    "en lag om myndigheten stiftas. Bedömningen av de kopplingar som står kvar är oförändrad; det är " +
    "belägget som blivit möjligt att granska.",
  commit: "0000000",
});
writeFileSync(rattelserPath, JSON.stringify(rattelser, null, 2) + "\n");

console.log(`\nSkrivet: data/kopplingar.json — ${rorda.length} kopplingar rörda`);
console.log(`  ${barLoftet.length} har fått anslagsraden i motiveringen`);
console.log(`  ${drasIn.length} är tillbakadragna`);
console.log(`Skrivet: data/rattelser.json — en post för hela genomgången`);
