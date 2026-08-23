/**
 * Hur gamla är sidorna vi skördar löften ur? (ATTGORA B3)
 *
 * Ett löftes `date_stated` sätts till skördedagen när sidan inte bär något
 * eget datum. För en sida som beskriver partiets gällande politik är det
 * rimligt — men praxisen sattes utan att någon mätt åldern, och
 * Kristdemokraternas A–Ö-sida om migration visade sig vara senast uppdaterad
 * **4 juli 2022**, alltså före förra valet.
 *
 * Skriptet öppnar varje aktivt löftes källsida en gång och läser sidans egen
 * uppgift om när den senast ändrades. Det **ändrar ingenting** — varken data
 * eller bedömning. Beslutet om vad åldern ska få betyda är en människas.
 *
 *   pnpm kallans:alder                    hela beståndet
 *   pnpm kallans:alder --domän kristdemokraterna.se
 *   pnpm kallans:alder --max 20 --paus 500
 *   pnpm kallans:alder --json /tmp/alder.json
 *
 * Talade källor hoppas över: en spelarsida bär inget datum för vad som sades,
 * och skulle bara mäta när videotjänsten rörde sin mall. Samma undantag som
 * källrötekontrollen gör.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sidansAlder, alderIDagar, type Alderskalla } from "../src/kallans-alder.ts";
import { arTaladKalla } from "../src/talad-kalla.ts";
import { svenskDag } from "../src/dagen.ts";

const ROOT = resolve(import.meta.dirname, "../../");
const PROMISES = join(ROOT, "data", "promises.json");
const UA = "UtlovatBot/1.0 (+https://utlovat.se/om)";

const args = process.argv.slice(2);
const varde = (f: string) => (args.indexOf(f) >= 0 ? args[args.indexOf(f) + 1] : undefined);
const baraDoman = varde("--domän") ?? varde("--doman");
const max = Number(varde("--max") ?? "0") || Infinity;
const paus = Number(varde("--paus") ?? "800");
const jsonUt = varde("--json");
const sov = (ms: number) => new Promise((r) => setTimeout(r, ms));
const idag = svenskDag();

interface Promise_ {
  id: string;
  status?: string;
  parties: string[];
  date_stated: string;
  source: { url: string; domain: string };
}

const promises = JSON.parse(readFileSync(PROMISES, "utf8")) as Promise_[];
const aktiva = promises.filter(
  (p) =>
    p.status === "aktiv" &&
    !arTaladKalla(p.source.url) &&
    (baraDoman === undefined || p.source.domain === baraDoman),
);

/** En sida, med de löften som vilar på den. */
interface Sida {
  url: string;
  domain: string;
  partier: Set<string>;
  loften: string[];
  /** Tidigaste skördedagen bland löftena — det datum sidans ålder ska mätas mot. */
  tidigastSkordad: string;
}

const sidor = new Map<string, Sida>();
for (const p of aktiva) {
  const s = sidor.get(p.source.url) ?? {
    url: p.source.url,
    domain: p.source.domain,
    partier: new Set<string>(),
    loften: [],
    tidigastSkordad: p.date_stated,
  };
  for (const parti of p.parties) s.partier.add(parti);
  s.loften.push(p.id);
  if (p.date_stated < s.tidigastSkordad) s.tidigastSkordad = p.date_stated;
  sidor.set(p.source.url, s);
}

const kon = [...sidor.values()].slice(0, max === Infinity ? undefined : max);
console.log(
  `${aktiva.length} aktiva löften vilar på ${sidor.size} unika källsidor` +
    `${baraDoman ? ` på ${baraDoman}` : ""}. Öppnar ${kon.length}.\n`,
);

interface Matning {
  url: string;
  domain: string;
  partier: string[];
  loften: number;
  loftesIdn: string[];
  tidigast_skordad: string;
  /** Sidans egen uppgift om senaste ändring, eller null när den inte säger något. */
  senast_andrad: string | null;
  kalla: Alderskalla | null;
  /** Dagar mellan sidans senaste ändring och den tidigaste skörden. */
  dagar_fore_skord: number | null;
  /** Sant när hämtningen föll — det är inte samma sak som «sidan saknar datum». */
  gick_ej_att_hamta: boolean;
  svar?: number | string;
}

const matningar: Matning[] = [];
let n = 0;
for (const s of kon) {
  n += 1;
  if (n % 25 === 0) console.log(`  ${n}/${kon.length}`);
  const post: Matning = {
    url: s.url,
    domain: s.domain,
    partier: [...s.partier].sort(),
    loften: s.loften.length,
    loftesIdn: s.loften,
    tidigast_skordad: s.tidigastSkordad,
    senast_andrad: null,
    kalla: null,
    dagar_fore_skord: null,
    gick_ej_att_hamta: false,
  };
  try {
    const res = await fetch(s.url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      // En sida som inte svarar säger ingenting om sin ålder. Att blanda ihop
      // det med «sidan saknar datum» vore att låta vårt eget nätstrul se ut
      // som en uppgift om partiets sida.
      post.gick_ej_att_hamta = true;
      post.svar = res.status;
    } else {
      const alder = sidansAlder(await res.text());
      if (alder) {
        post.senast_andrad = alder.datum;
        post.kalla = alder.kalla;
        post.dagar_fore_skord = alderIDagar(alder.datum, s.tidigastSkordad);
      }
    }
  } catch (e) {
    post.gick_ej_att_hamta = true;
    post.svar = e instanceof Error ? e.message : String(e);
  }
  matningar.push(post);
  await sov(paus);
}

// ───────────────────────────────────────────────────────────── utskrift ──

const hamtade = matningar.filter((m) => !m.gick_ej_att_hamta);
const medDatum = hamtade.filter((m) => m.senast_andrad !== null);
const utanDatum = hamtade.filter((m) => m.senast_andrad === null);
const foll = matningar.filter((m) => m.gick_ej_att_hamta);

console.log(`\n${matningar.length} sidor öppnade den ${idag}.`);
console.log(`  ${medDatum.length} bär ett eget datum · ${utanDatum.length} säger inget · ${foll.length} gick inte att hämta`);

const arstal = new Map<string, { sidor: number; loften: number }>();
for (const m of medDatum) {
  const ar = m.senast_andrad!.slice(0, 4);
  const rad = arstal.get(ar) ?? { sidor: 0, loften: 0 };
  rad.sidor += 1;
  rad.loften += m.loften;
  arstal.set(ar, rad);
}
console.log("\nSenast ändrad, per år:");
for (const [ar, rad] of [...arstal.entries()].sort()) {
  console.log(`  ${ar}   ${String(rad.sidor).padStart(3)} sidor   ${String(rad.loften).padStart(3)} löften`);
}

/**
 * De sidor som ändrades före den mandatperiod löftena ska gälla. Valdagen
 * 2022-09-11 är gränsen: en sida som inte rörts sedan dess beskriver politiken
 * som den såg ut inför förra valet.
 */
const FORRA_VALET = "2022-09-11";
const foreForraValet = medDatum.filter((m) => m.senast_andrad! < FORRA_VALET);
if (foreForraValet.length > 0) {
  const loften = foreForraValet.reduce((a, m) => a + m.loften, 0);
  console.log(`\n⚠ ${foreForraValet.length} sidor har inte ändrats sedan före valet 2022 — de bär ${loften} publicerade löften:`);
  for (const m of foreForraValet.sort((a, b) => a.senast_andrad!.localeCompare(b.senast_andrad!))) {
    console.log(`  ${m.senast_andrad}  ${m.loften} löften  ${m.url}`);
    console.log(`              ${m.loftesIdn.join(" ")}`);
  }
}

const aldst = [...medDatum].sort((a, b) => a.senast_andrad!.localeCompare(b.senast_andrad!)).slice(0, 15);
console.log("\nDe 15 äldsta sidorna:");
for (const m of aldst) {
  console.log(
    `  ${m.senast_andrad}  (${String(m.dagar_fore_skord).padStart(5)} dagar före skörden)  ` +
      `${m.loften} löften  ${m.partier.join(",")}  ${m.url}`,
  );
}

if (foll.length > 0) {
  console.log(`\n${foll.length} sidor gick inte att hämta — oprövade, inte utan datum:`);
  for (const m of foll) console.log(`  ${m.svar}  ${m.url}`);
}

if (jsonUt) {
  writeFileSync(jsonUt, `${JSON.stringify({ matt: idag, matningar }, null, 2)}\n`, "utf8");
  console.log(`\nMätningen skriven till ${jsonUt}`);
}

console.log("\nSkriptet ändrar ingenting. Vad åldern ska få betyda är ett mänskligt beslut.");
