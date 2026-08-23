/**
 * Fläskvågens källröta-bevakning.
 *
 * Frågevågen har haft `stances:rot-check` och `rot-watch.yml` sedan
 * lanseringen. Löftena har aldrig haft någon motsvarighet: en källa hämtades
 * en gång vid skörden och öppnades sedan aldrig mer. Det höll fram till
 * 2026-08-09, då `p-2026-0690` och `p-2026-0708` visade sig peka på en adress
 * som svarar 404 — hittat av en slump, för att en arkivkopia skulle sättas.
 *
 * Skriptet öppnar varje aktivt löftes källa och stämplar `source_status`:
 *   ok          citatet står kvar ordagrant
 *   andrad      sidan svarar, men citatet står inte längre där
 *   borttagen   sidan svarar 404/410
 *   (obestämd)  nätfel, timeout, 429, 5xx — INGENTING skrivs
 *
 * Ingenting raderas och ingen bedömning ändras. En ändrad eller borttagen
 * källa är en synlig stämpel, och arkivkopian gäller.
 *
 *   pnpm promises:rot-check              kontrollera och skriv
 *   pnpm promises:rot-check --dry-run    rapportera bara
 *   pnpm promises:rot-check --max 40     bryt efter N källsidor
 *   pnpm promises:rot-check --paus 2000  takten mellan hämtningar (ms)
 *   pnpm promises:rot-check --id p-1,p-2  pröva om enstaka löften
 *   pnpm promises:rot-check --fynd-ar-data  utfallskod 0 även vid fynd
 *
 * En flaggad källa får dessutom `source_change` — vad som står där i dag,
 * ordagrant ur sidan. Statusen räcker för stämpeln på löftessidan; för att
 * lägga fram fallet på `/andrade-kallor` krävs både en arkivkopia som bär
 * citatet och att en människa kontrollerat båda länkarna (`reviewed_at`).
 *
 * Utfallskod 1 när något är `andrad` eller `borttagen` — de kräver en
 * människa. Ett nätfel sätter aldrig koden; det vore att låta vårt eget
 * nätstrul se ut som en död källa.
 *
 * `--fynd-ar-data` vänder just det: koden blir 0 även när något flaggas.
 * Flaggan finns för `rot-watch.yml` och ska inte användas för hand. En
 * schemalagd körning som faller betyder «bevakningen är trasig», och den
 * skillnaden går förlorad om ett väntat fynd fäller jobbet: beståndet bär
 * redan tre `andrad`, så körningen hade larmat varje måndag för ett läge som
 * står utskrivet på `/andrade-kallor`. Värre än så — steget som committar
 * stämplarna ligger efter kontrollen och hade hoppats över, så bevakningen
 * hade mätt varje vecka och kastat mätningen. Frågevågens motsvarighet gör
 * redan så här: en ändrad källa är data, inte ett fel.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { computeDataHash } from "../src/publish.ts";
import { extractPdfText, looksLikePdf, stripHtml } from "../src/fetch.ts";
import {
  andringsslag,
  hittaPassage,
  skaSkrivas,
  utfallAvStatus,
  utfallAvText,
  type Andringsslag,
  type Rotutfall,
} from "../src/kallrota.ts";
import { arTaladKalla } from "../src/talad-kalla.ts";
import { svenskDag } from "../src/dagen.ts";

const ROOT = resolve(import.meta.dirname, "../../");
const PROMISES = join(ROOT, "data", "promises.json");
const UA = "UtlovatBot/1.0 (+https://utlovat.se/om)";
const args = process.argv.slice(2);
const har = (f: string) => args.includes(f);
const varde = (f: string) => (args.indexOf(f) >= 0 ? args[args.indexOf(f) + 1] : undefined);
const torr = har("--dry-run");
const fyndArData = har("--fynd-ar-data");
const max = Number(varde("--max") ?? "0") || Infinity;
const paus = Number(varde("--paus") ?? "1200");
// Ett enskilt fall ska gå att pröva om utan att öppna hela beståndets källor.
// Ett flaggat löfte kontrolleras alltid mot källan igen innan det läggs fram.
const bara = new Set((varde("--id") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const sov = (ms: number) => new Promise((r) => setTimeout(r, ms));
const idag = svenskDag();

/**
 * Vad som ändrats, inte bara att något ändrats.
 *
 * Statusen `andrad` räcker för en stämpel på löftessidan men inte för att
 * lägga fram fallet offentligt — då måste läsaren se båda leden. Fälten här
 * är mätvärden, hämtade ur sidan som den ser ut i dag, aldrig omskrivna.
 * `reviewed_at` sätts av en människa och är det som avgör om fallet visas.
 */
interface Kallandring {
  kind: Andringsslag;
  observed_at: string;
  /** Meningen som står där i dag, ordagrant ur källan. Saknas när sidan är utbytt. */
  now_reads?: string;
  /** Dit adressen leder nu, när den inte längre stannar på sig själv. */
  redirects_to?: string;
  /** Datum då fallet kontrollerats mot båda länkarna. Sätts aldrig här. */
  reviewed_at?: string;
  /** Anmärkning för hand, när mätvärdena behöver sammanhang. */
  note?: string;
}

interface Promise_ {
  id: string;
  party?: string;
  status?: string;
  quote: string;
  source: {
    url: string;
    archive_url?: string;
    source_status?: Rotutfall;
    source_checked_at?: string;
    source_change?: Kallandring;
  };
}

const promises = JSON.parse(readFileSync(PROMISES, "utf8")) as Promise_[];
// Talade källor tas ur kön helt. En spelarsida bär aldrig talade ord som text,
// så kontrollen skulle stämpla varenda sändning som «citatet står inte längre
// där» — en anklagelse mot källan för en fråga sidan inte kan besvara. Samma
// undantag som arkivsvepet gör, och av samma skäl: talade citat beläggs med
// avskrift och tidsstämpel (mänskligt beslut 2026-08-09).
const alla = promises.filter((p) => p.status === "aktiv" && (bara.size === 0 || bara.has(p.id)));
const talade = alla.filter((p) => arTaladKalla(p.source.url));
const aktiva = alla.filter((p) => !arTaladKalla(p.source.url));

/** Flera löften delar ofta samma artikel. Hämta sidan en gång, pröva varje citat. */
const stripFrag = (u: string) => u.split("#")[0]!;
const perUrl = new Map<string, Promise_[]>();
for (const p of aktiva) {
  const key = stripFrag(p.source.url);
  perUrl.set(key, [...(perUrl.get(key) ?? []), p]);
}
const urler = [...perUrl.keys()].slice(0, max);

console.log(
  `Källröta, Fläskvågen: ${aktiva.length} aktiva löften över ${perUrl.size} källsidor. ` +
    `Öppnar ${urler.length}${torr ? " (torrkörning)" : ""}. ` +
    `${talade.length} talade källor prövas inte här — de beläggs med avskrift och tidsstämpel.`,
);

/** Hämtar sidans text. `null` = gick inte att avgöra, aldrig "citatet saknas". */
async function hamta(url: string): Promise<{ utfall: Rotutfall } | { text: string; slutlig: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/pdf,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { utfall: "obestamd" };
  }
  const avStatus = utfallAvStatus(res.status);
  if (avStatus) return { utfall: avStatus };
  try {
    const bytes = new Uint8Array(await res.arrayBuffer());
    return {
      text: looksLikePdf(res.headers.get("content-type"), bytes)
        ? (await extractPdfText(bytes)).pages.join("\n")
        : stripHtml(new TextDecoder("utf-8").decode(bytes)),
      // Vart adressen faktiskt ledde. `p-2026-0487` svarar 200 — men på en
      // annan sida, för valmanifestets adress skickar numera vidare till en
      // översiktssida. Utan detta ser fallet ut som ett omskrivet stycke.
      slutlig: res.url || url,
    };
  } catch {
    return { utfall: "obestamd" };
  }
}

/**
 * Skriver ned VAD som ändrats, inte bara att något ändrats.
 *
 * Två regler bär den här funktionen:
 *
 * 1. **En lagad källa lämnar inget spår.** Går statusen tillbaka till `ok`
 *    försvinner beviset, för då finns ingen ändring att lägga fram.
 * 2. **Människans godkännande följer inte med en ny mätning.** Ändrar sig
 *    slaget — en omskriven mening blir en utbytt sida — nollas `reviewed_at`.
 *    Godkännandet gällde det som prövades då, inte det som står nu.
 */
function skrivAndring(p: Promise_, utfall: Rotutfall, svar: { text: string; slutlig: string } | null): void {
  if (utfall === "ok") {
    delete p.source.source_change;
    return;
  }
  const nu = svar ? hittaPassage(svar.text, p.quote) : null;
  const slag = andringsslag(utfall, nu);
  if (!slag) return;

  const forra = p.source.source_change;
  const andring: Kallandring = { kind: slag, observed_at: idag };
  if (nu) andring.now_reads = nu;
  if (svar && stripFrag(svar.slutlig) !== stripFrag(p.source.url)) andring.redirects_to = svar.slutlig;
  if (forra?.kind === slag) {
    if (forra.reviewed_at) andring.reviewed_at = forra.reviewed_at;
    if (forra.note) andring.note = forra.note;
  }
  p.source.source_change = andring;
}

let oppnade = 0;
let andrade = 0;
const rapport: string[] = [];
const trasiga: Promise_[] = [];

for (const url of urler) {
  const grupp = perUrl.get(url)!;
  const svar = await hamta(url);
  oppnade++;
  for (const p of grupp) {
    const utfall = "text" in svar ? utfallAvText(svar.text, p.quote) : svar.utfall;
    if (utfall === "obestamd") continue;
    if (skaSkrivas(p.source.source_status, utfall)) {
      andrade++;
      rapport.push(`${p.id} (${p.party ?? "?"}): ${p.source.source_status ?? "aldrig kontrollerad"} → ${utfall}  ${url}`);
    }
    if (!torr) {
      p.source.source_status = utfall;
      p.source.source_checked_at = idag;
      skrivAndring(p, utfall, "text" in svar ? svar : null);
    }
    if (utfall !== "ok") trasiga.push(p);
  }
  if (oppnade < urler.length) await sov(paus);
}

console.log(
  `\nÖppnade ${oppnade} källsidor. ${andrade} statusändringar. ` +
    `${trasiga.length} löften har en källa som inte längre bär sitt citat.`,
);
for (const rad of rapport) console.log(`  ${rad}`);

if (trasiga.length > 0) {
  console.log("\nDessa kräver en människa — rättad adress, nytt citat, eller tillbakadragning:");
  for (const p of trasiga) console.log(`  ${p.source.source_status?.toUpperCase().padEnd(10)} ${p.id}  ${p.source.url}`);
}

if (!torr && oppnade > 0) {
  writeFileSync(PROMISES, JSON.stringify(promises, null, 2) + "\n");
  // Changelog-posten skrivs här och inte för hand. Sedan bevakningen ligger i
  // rot-watch.yml committar en robot promises.json varje måndag, och kravet
  // att sista postens data_hash matchar computeDataHash(promises.json) hade
  // brutits tyst varje gång. Samma postform som publish.ts och review.ts.
  // Inget löfte är tillagt, ändrat eller tillbakadraget — bara stämplarna —
  // så de tre listorna är tomma med flit.
  const CHANGELOG = join(ROOT, "data", "changelog.json");
  const logg = JSON.parse(readFileSync(CHANGELOG, "utf8")) as unknown[];
  logg.push({
    run_id: `rot-check-${idag}`,
    added: [],
    updated: [],
    retracted: [],
    data_hash: computeDataHash(promises),
    timestamp: new Date().toISOString(),
  });
  writeFileSync(CHANGELOG, JSON.stringify(logg, null, 2) + "\n");
  console.log(`\nSkrev ${PROMISES} och en changelog-post med omräknad data_hash.`);
}

// Ett nätfel sätter aldrig koden. Att låta vårt eget nätstrul se ut som en
// död källa är samma fel som arkivsvepets `oavgjort` finns för att undvika.
process.exit(trasiga.length > 0 && !fyndArData ? 1 : 0);
