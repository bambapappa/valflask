/**
 * Svepet över de kopplingar vars motion bara har ramverksyrkanden.
 *
 * Beslutet om budgetmotioners yrkanden avgör dem genom skatteundantaget: gäller
 * löftet en skatt eller en avgift, och binder inkomstberäkningsyrkandet
 * regeringen att återkomma med lagförslag, kan yrkandet bära löftet — men bara
 * när beräkningen har en rad för den skatten, och raden ska då skrivas ut i
 * motiveringen. Sex publicerade kopplingar väntade på just den raden.
 *
 *   npm run inkomstbararen -- --matning inkomst.json
 *   npm run inkomstbararen -- --matning inkomst.json --json utfall.json
 *   npm run inkomstbararen -- --matning inkomst.json --skriv
 *
 * `--skriv` gör två saker och bara två: skriver inkomstraden i motiveringen för
 * de kopplingar som bär, och drar in de som faller med skälet skrivet på var och
 * en. Båda är rättelser av publicerat material, så körningen skriver också
 * **en** post i `data/rattelser.json` — rättelser samlas.
 *
 * **Skriptet läser varken löftet eller tabellen.** Om löftet gäller en skatt och
 * åt vilket håll står i `data/loftets-skatteslag.json`; vilken rad som bär står i
 * `data/inkomstraden-last.json`. Båda är läsningar av en människa med skälet
 * utskrivet, och båda behövs: ordöverlapp är en svag läshjälp mot inkomsttitlar,
 * som är få och breda.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { KopplingPost } from "../src/granskning.ts";
import { radensBelopp, type Inkomstrad } from "../src/inkomsttabell.ts";
import {
  provaInkomstbararen,
  motiveringsnot,
  utanTidigareInkomstnot,
  type Inkomstmatning,
  type Inkomstutfall,
  type Skatteslag,
} from "../src/inkomstbararen.ts";

const rot = resolve(import.meta.dirname, "../..");
const argv = process.argv.slice(2);
const varde = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const skriv = argv.includes("--skriv");
const jsonUt = varde("--json");
const matningsfil = varde("--matning");
const datum = new Date().toISOString().slice(0, 10);

if (matningsfil === undefined) {
  console.error("Ange --matning <fil> — utdata från: npm run inkomst-tabell -- --klass-b --json <fil>");
  process.exit(1);
}

/** Mätningen bär hela tabellen, så att läsningen kan peka ut vilken rad som helst. */
type Matning = Inkomstmatning & { rader?: Inkomstrad[] };
const matningar: Matning[] = JSON.parse(readFileSync(resolve(matningsfil), "utf8"));

const kopplingarPath = resolve(rot, "data/kopplingar.json");
const kopplingar: KopplingPost[] = JSON.parse(readFileSync(kopplingarPath, "utf8"));
const rattelserPath = resolve(rot, "data/rattelser.json");

interface Skatteslagslasning {
  las: Array<{ id: string; slag: Skatteslag; skal: string }>;
}
const slagLast: Skatteslagslasning = JSON.parse(
  readFileSync(resolve(rot, "data/loftets-skatteslag.json"), "utf8"),
);
const slagPerLofte = new Map(slagLast.las.map((l) => [l.id, l]));

interface Radlasning {
  par: Array<{ koppling: string; rad: string; bar: boolean; skal: string }>;
}
const radLast: Radlasning = JSON.parse(
  readFileSync(resolve(rot, "data/inkomstraden-last.json"), "utf8"),
);
const radPerKoppling = new Map(radLast.par.map((r) => [r.koppling, r]));

/**
 * Löftets slag: bara läsningen.
 *
 * Här finns ingen väg via kostnadstypen, till skillnad från anslagsregeln. Tre
 * av de sex löften den här regeln byggdes för står som `utgift` och gäller ändå
 * arbetsgivaravgifter, så en gissning ur typen hade dragit in fyra kopplingar
 * som bär. Saknas löftet i läsningen är svaret att undantaget inte gäller, och
 * det står i utskriften i stället för att gömmas.
 */
function loftetsSkatteslag(promiseId: string | null): { slag: Skatteslag; last: boolean } {
  if (promiseId === null) return { slag: "ingen_skatt", last: false };
  const l = slagPerLofte.get(promiseId);
  return l ? { slag: l.slag, last: true } : { slag: "ingen_skatt", last: false };
}

interface Utfallsrad {
  koppling: string;
  promise_id: string | null;
  utfall: Inkomstutfall;
  slag: Skatteslag;
  slaget_last: boolean;
  raden_last: boolean;
  rad: string | null;
  innebord: string;
  atgard: "skriv-raden-i-motiveringen" | "dra-in" | "las-motionen";
}

const utfall: Utfallsrad[] = [];
/** Raden läsningen pekade ut, per koppling — den ska i motiveringen. */
const radPerId = new Map<string, Inkomstrad>();
let olasta = 0;

for (const m of matningar) {
  const { slag, last } = loftetsSkatteslag(m.promise_id);
  if (!last) olasta++;
  let p = provaInkomstbararen(m, slag);

  // Läsningen pekar ut raden och avgör om den bär. Den gäller bara frågan om
  // raden handlar om löftets sak — att löftet inte är någon skatt, eller att
  // yrkandet inte binder, står kvar oavsett vad någon läst.
  const l = radPerKoppling.get(m.koppling);
  const faravgoras = p.utfall !== "loftet_ar_ingen_skatt" && p.utfall !== "yrkandet_binder_inte";
  if (l && faravgoras) {
    const rad = (m.rader ?? []).find((r) => r.titel === l.rad);
    if (rad === undefined) {
      p = {
        utfall: "oavgjort",
        rad: null,
        innebord: `Läsningen pekar ut inkomsttitel ${l.rad}, men den raden finns inte i den hämtade tabellen.`,
        drasIn: false,
        kraverLasning: true,
      };
    } else if (l.bar) {
      p = { utfall: "bar", rad, innebord: l.skal, drasIn: false, kraverLasning: false };
    } else {
      p = { utfall: "raden_handlar_om_annat", rad, innebord: l.skal, drasIn: true, kraverLasning: false };
    }
  }

  if (p.utfall === "bar" && p.rad) radPerId.set(m.koppling, p.rad);
  utfall.push({
    koppling: m.koppling,
    promise_id: m.promise_id,
    utfall: p.utfall,
    slag,
    slaget_last: last,
    raden_last: l !== undefined && faravgoras,
    rad: p.rad === null ? null : `${p.rad.titel} ${p.rad.namn} ${radensBelopp(p.rad)}`,
    innebord: p.innebord,
    atgard: p.utfall === "bar" ? "skriv-raden-i-motiveringen" : p.drasIn ? "dra-in" : "las-motionen",
  });
}

// ──────────────────────────────────────────────────────────────── utskrift ──

const rakna = (u: Inkomstutfall) => utfall.filter((r) => r.utfall === u).length;
console.log(`\n${utfall.length} kopplingar prövade mot skatteundantaget.\n`);
console.log(`  bär löftet, raden ska i motiveringen   ${String(rakna("bar")).padStart(4)}`);
console.log(`  löftet gäller ingen skatt              ${String(rakna("loftet_ar_ingen_skatt")).padStart(4)}`);
console.log(`  yrkandet binder inte regeringen        ${String(rakna("yrkandet_binder_inte")).padStart(4)}`);
console.log(`  ingen inkomsttabell för budgetåret     ${String(rakna("ingen_inkomsttabell")).padStart(4)}`);
console.log(`  raden står ±0 — ingen ändring begärd   ${String(rakna("raden_star_stilla")).padStart(4)}`);
console.log(`  raden handlar om något annat           ${String(rakna("raden_handlar_om_annat")).padStart(4)}`);
console.log(`  raden går andra vägen — läs motionen   ${String(rakna("raden_gar_andra_vagen")).padStart(4)}`);
console.log(`  ingen rad delar sakord — läs tabellen  ${String(rakna("ingen_rad_delar_sakord")).padStart(4)}`);
console.log(`  bara ett gemensamt ordled — läs raden  ${String(rakna("svag_traff")).padStart(4)}`);
console.log(`  tabellen gick inte att läsa            ${String(rakna("oavgjort")).padStart(4)}`);
console.log(
  `\n  ${olasta} löften saknar läsning i data/loftets-skatteslag.json och behandlas därför som att\n` +
    "  de inte gäller någon skatt — då gäller undantaget inte. Kostnadstypen får aldrig avgöra\n" +
    "  saken: tre av de sex löften regeln byggdes för står som utgift och gäller ändå avgifter.",
);

for (const r of utfall) {
  console.log(`\n  ${r.koppling}  ${r.promise_id}  ${r.utfall}  →  ${r.atgard}`);
  if (r.rad) console.log(`    rad: ${r.rad}`);
  console.log(`    ${r.innebord}`);
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

const kvarAttLasa = utfall.filter((r) => r.atgard === "las-motionen");
if (kvarAttLasa.length > 0) {
  console.error(
    `\n${kvarAttLasa.length} kopplingar kräver en läsning innan något skrivs: ` +
      `${kvarAttLasa.map((r) => r.koppling).join(", ")}.\n` +
      "Skriv läsningen i data/inkomstraden-last.json först. Ingenting skrivet.",
  );
  process.exit(1);
}

const perId = new Map(kopplingar.map((k) => [k.id, k]));
const barLoftet = utfall.filter((r) => r.atgard === "skriv-raden-i-motiveringen");
const drasIn = utfall.filter((r) => r.atgard === "dra-in");
const berordaLoften = new Set<string>();
let rorda = 0;

for (const r of barLoftet) {
  const k = perId.get(r.koppling);
  const rad = radPerId.get(r.koppling);
  if (!k || !rad) continue;
  const slag = loftetsSkatteslag(r.promise_id).slag;
  k.method_note = `${utanTidigareInkomstnot(k.method_note ?? "")} ${motiveringsnot(rad, slag, datum)}`.trim();
  // Samma sak som i anslagsbäraren: inkomstraden är grunden, och grunden ska
  // gå att pröva utan att läsa prosa. Se src/brodtextspar.ts.
  k.bevis = { ...k.bevis, brodtext_oppen: "inkomstrad" };
  rorda++;
  if (k.promise_id) berordaLoften.add(k.promise_id);
}

for (const r of drasIn) {
  const k = perId.get(r.koppling);
  if (!k) continue;
  k.status = "indragen";
  k.indragen = { datum, skal: r.innebord };
  rorda++;
  if (k.promise_id) berordaLoften.add(k.promise_id);
}

writeFileSync(kopplingarPath, JSON.stringify(kopplingar, null, 2) + "\n");

/** En rättelsepost för hela genomgången — rättelser samlas. */
const rattelser = JSON.parse(readFileSync(rattelserPath, "utf8")) as unknown[];
rattelser.push({
  date: datum,
  affects:
    `Handlingsvågens rutnät och löftessidorna för ${[...berordaLoften].sort().join(", ")} — ` +
    `${barLoftet.length} kopplingar har fått inkomstberäkningens rad utskriven i motiveringen och ` +
    `${drasIn.length} är tillbakadragna.`,
  what:
    "En budgetmotion vars yrkanden bara fastställer budgetens ramar säger i yrkandet ingenting om en " +
    "enskild reform — utom när ett av yrkandena godkänner beräkningen av statens inkomster och kräver " +
    "att regeringen återkommer med lagförslag i överensstämmelse med beräkningen. Då är beräkningen ett " +
    "åtagande att lagstifta, och den ingår i yrkandet genom hänvisningen. Vi har hämtat den beräkningen " +
    `ur varje sådan motion och lagt raden bredvid löftet. För ${barLoftet.length} kopplingar finns en rad ` +
    "för just den skatt löftet gäller, och den raden står nu utskriven i motiveringen med inkomsttitelns " +
    "nummer, dess namn och vad motionen begär mot regeringens förslag. För " +
    `${drasIn.length} kopplingar bär motionen inte löftet, och de är tillbakadragna med skälet skrivet ` +
    "på var och en.",
  why:
    "Ett belägg ska visa vad partiet faktiskt gjorde. För en budgetmotion som bara sätter ramarna är det " +
    "inkomstberäkningens rad som visar om partiet begärde en ändring av just den skatt löftet gäller — " +
    "utan den vet läsaren bara att vi hänvisar till en budgetmotion. Att en skatt råkar ligga nära ett " +
    "löfte är inte samma sak som att motionen begärde en ändring av den, och en motion som förstärker " +
    "det avdrag ett löfte säger ska avskaffas är ingen handling på det löftet. Bedömningen av de " +
    "kopplingar som står kvar är oförändrad; det är belägget som blivit möjligt att granska.",
  commit: "0000000",
});
writeFileSync(rattelserPath, JSON.stringify(rattelser, null, 2) + "\n");

console.log(`\nSkrivet: data/kopplingar.json — ${rorda} kopplingar rörda`);
console.log(`  ${barLoftet.length} har fått inkomstraden i motiveringen`);
console.log(`  ${drasIn.length} är tillbakadragna`);
console.log("Skrivet: data/rattelser.json — en post för hela genomgången");
