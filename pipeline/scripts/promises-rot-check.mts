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
 *
 * Utfallskod 1 när något är `andrad` eller `borttagen` — de kräver en
 * människa. Ett nätfel sätter aldrig koden; det vore att låta vårt eget
 * nätstrul se ut som en död källa.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { extractPdfText, looksLikePdf, stripHtml } from "../src/fetch.ts";
import { skaSkrivas, utfallAvStatus, utfallAvText, type Rotutfall } from "../src/kallrota.ts";
import { arTaladKalla } from "../src/talad-kalla.ts";

const ROOT = resolve(import.meta.dirname, "../../");
const PROMISES = join(ROOT, "data", "promises.json");
const UA = "UtlovatBot/1.0 (+https://utlovat.se/om)";
const args = process.argv.slice(2);
const har = (f: string) => args.includes(f);
const varde = (f: string) => (args.indexOf(f) >= 0 ? args[args.indexOf(f) + 1] : undefined);
const torr = har("--dry-run");
const max = Number(varde("--max") ?? "0") || Infinity;
const paus = Number(varde("--paus") ?? "1200");
const sov = (ms: number) => new Promise((r) => setTimeout(r, ms));
const idag = new Date().toISOString().slice(0, 10);

interface Promise_ {
  id: string;
  party?: string;
  status?: string;
  quote: string;
  source: { url: string; source_status?: Rotutfall; source_checked_at?: string };
}

const promises = JSON.parse(readFileSync(PROMISES, "utf8")) as Promise_[];
// Talade källor tas ur kön helt. En spelarsida bär aldrig talade ord som text,
// så kontrollen skulle stämpla varenda sändning som «citatet står inte längre
// där» — en anklagelse mot källan för en fråga sidan inte kan besvara. Samma
// undantag som arkivsvepet gör, och av samma skäl: talade citat beläggs med
// avskrift och tidsstämpel (mänskligt beslut 2026-08-09).
const alla = promises.filter((p) => p.status === "aktiv");
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
async function hamta(url: string): Promise<{ utfall: Rotutfall } | { text: string }> {
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
    };
  } catch {
    return { utfall: "obestamd" };
  }
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
  console.log(`\nSkrev ${PROMISES}. data_hash måste räknas om i changelog.`);
}

// Ett nätfel sätter aldrig koden. Att låta vårt eget nätstrul se ut som en
// död källa är samma fel som arkivsvepets `oavgjort` finns för att undvika.
process.exit(trasiga.length > 0 ? 1 : 0);
