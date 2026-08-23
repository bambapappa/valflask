/**
 * Prövar de talade citaten mot de hållna avskrifterna i bevisvalvet.
 *
 * **Varför skriptet finns.** Fältet `source.transcript_held` säger att vi har
 * kontrollerat ett citat mot en avskrift läsaren inte får se. Ett sådant fält
 * är värdelöst om ingen kan göra om kontrollen — då är det bara ett påstående
 * om oss själva, och projektet litar inte på sådana. Det här skriptet är
 * återskapandet: peka det mot en utcheckning av valvet och det räknar om exakt
 * samma svar, post för post.
 *
 * **Varför avskrifterna inte ligger här.** SPEC §6.2 och §17: fulltext sparas
 * aldrig i repot, och ett tal är någons verk. Mänskligt beslut 2026-08-17 att
 * hellre redovisa kontrollen än att publicera underlaget.
 *
 *   pnpm avskrift:kontroll --valv ~/Dev/projects/vallen-2026
 *   pnpm avskrift:kontroll --valv <sökväg> --skriv     # sätter transcript_held
 *
 * Utan `--skriv` ändras ingenting; skriptet skriver bara ut vad det mätte.
 * Slutkoden är 1 om något publicerat citat INTE bär, så en körning i CI eller
 * för hand fäller på det som är fel och inte på det som saknas.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { looseNormalize } from "../src/import-vallen.ts";
import { normalizeForVerbatim } from "../src/gates.ts";
import { arTaladKalla, filmensId, tidpunktISekunder } from "../src/talad-kalla.ts";
import { svenskDag } from "../src/dagen.ts";

const args = process.argv.slice(2);
const har = (f: string) => args.includes(f);
const varde = (f: string): string | null => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1]! : null;
};

const valv = varde("--valv") ?? process.env.VALLEN_DIR ?? null;
if (valv === null) {
  console.error(
    "Ange valvet: --valv <sökväg till utcheckning av vallen-2026> (eller VALLEN_DIR).\n" +
      "Avskrifterna ligger inte i det här repot och ska inte göra det — se SPEC §6.2.",
  );
  process.exit(2);
}

const DATA = join(import.meta.dirname, "..", "..", "data");
const VALV_REPO = "bambapappa/vallen-2026";

interface Kalla {
  url: string;
  archive_url?: string | null;
  transcript_url?: string | null;
  transcript_held?: {
    video_id: string;
    vault: string;
    checked_at: string;
    comparison: "strikt" | "mjuk";
  } | null;
}
interface Lofte {
  id: string;
  status: string;
  quote: string;
  parties?: string[];
  source: Kalla;
  history?: { date: string; change: string; commit: string }[];
}

const promises = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Lofte[];
const talade = promises.filter(
  (p) => p.status === "aktiv" && arTaladKalla(p.source.url) && !p.source.archive_url,
);

if (talade.length === 0) {
  console.log("Inga aktiva löften på talad källa utan arkivkopia. Ingenting att pröva.");
  process.exit(0);
}

/** Avskriften ur valvet, en gång per film — flera löften delar sändning. */
const avskrifter = new Map<string, string | null>();
function avskrift(videoId: string): string | null {
  if (!avskrifter.has(videoId)) {
    const fil = join(valv!, "transcripts", `${videoId}.txt`);
    avskrifter.set(videoId, existsSync(fil) ? readFileSync(fil, "utf8") : null);
  }
  return avskrifter.get(videoId) ?? null;
}

type Utfall = "strikt" | "mjuk" | "bar-inte" | "ingen-avskrift" | "ingen-tid";
const rader: { lofte: Lofte; videoId: string | null; utfall: Utfall }[] = [];

for (const p of talade) {
  const videoId = filmensId(p.source.url);
  if (tidpunktISekunder(p.source.url) === null) {
    rader.push({ lofte: p, videoId, utfall: "ingen-tid" });
    continue;
  }
  const text = videoId === null ? null : avskrift(videoId);
  if (text === null) {
    rader.push({ lofte: p, videoId, utfall: "ingen-avskrift" });
    continue;
  }
  // Hårdaste regeln först: klarar citatet den strikta jämförelsen ska det stå
  // så, och inte gömma sig bakom ASR-undantaget det inte behövde.
  const utfall: Utfall = normalizeForVerbatim(text).includes(normalizeForVerbatim(p.quote))
    ? "strikt"
    : looseNormalize(text).includes(looseNormalize(p.quote))
      ? "mjuk"
      : "bar-inte";
  rader.push({ lofte: p, videoId, utfall });
}

const märke: Record<Utfall, string> = {
  strikt: "BÄR (strikt)",
  mjuk: "bär (mjukt) ",
  "bar-inte": "BÄR INTE    ",
  "ingen-avskrift": "ingen avskrift",
  "ingen-tid": "ingen tidpunkt",
};
for (const r of rader) {
  console.log(
    `${märke[r.utfall]}  ${r.lofte.id}  ${(r.lofte.parties ?? []).join("/").padEnd(3)}  ` +
      `${(r.videoId ?? "?").padEnd(12)}  ${r.lofte.quote.slice(0, 60)}`,
  );
}

const räkna = (u: Utfall) => rader.filter((r) => r.utfall === u).length;
console.log(
  `\n${rader.length} talade citat prövade mot valvet: ${räkna("strikt")} bär strikt, ` +
    `${räkna("mjuk")} bär med ASR-undantaget, ${räkna("bar-inte")} bär inte, ` +
    `${räkna("ingen-avskrift")} saknar avskrift, ${räkna("ingen-tid")} saknar tidpunkt.`,
);

if (har("--skriv")) {
  const idag = svenskDag();
  let satta = 0;
  for (const r of rader) {
    if (r.utfall !== "strikt" && r.utfall !== "mjuk") continue;
    const p = promises.find((x) => x.id === r.lofte.id)!;
    p.source.transcript_held = {
      video_id: r.videoId!,
      vault: `${VALV_REPO}/transcripts/${r.videoId}.txt`,
      checked_at: idag,
      comparison: r.utfall,
    };
    p.history = [
      ...(p.history ?? []),
      {
        date: idag,
        change:
          "Citatet är prövat mot den avskrift av sändningen som ligger i det privata bevisvalvet, " +
          `och står där ${r.utfall === "strikt" ? "ordagrant" : "ordagrant så när som på skiftläge och skiljetecken (undantaget för maskinskriven text)"}. ` +
          "Avskriften publiceras inte: fulltext sparas aldrig i repot och ett tal är någons verk. " +
          "Kontrollen går att göra om med pnpm avskrift:kontroll av den som har valvet. Inget citat, belopp eller besked ändras.",
        commit: "0000000",
      },
    ];
    satta++;
  }
  writeFileSync(join(DATA, "promises.json"), `${JSON.stringify(promises, null, 2)}\n`);
  console.log(`Skrev transcript_held på ${satta} löften. Kom ihåg changelog och data_hash.`);
}

process.exit(räkna("bar-inte") > 0 ? 1 : 0);
