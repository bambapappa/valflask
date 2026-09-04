import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Delningsbilderna räknar och skriver INGENTING själva.
 *
 * Fram till 2026-08-05 bar den här filen egna kopior av dedupeByGroup,
 * totalFlasket, partyTotalMsek, beloppsformateringen och etiketterna. Kopiorna
 * hann glida isär från sajten på fem punkter — värst att belopp under
 * 1 000 mkr skrevs ut med enheten MDKR, alltså tusen gånger för mycket, på 92
 * löftesbilder. Ett faktum har en plats: allt nedan kommer nu ur samma moduler
 * som sidorna använder, och scripts/test-og.mts faller om någon återinför en
 * kopia.
 */
import {
  getPromisesForParty,
  partyTotalMsek,
  promiseTotalMsek,
  totalFlasket,
} from "../src/lib/aggregates.ts";
import { formatBasisLabel, formatMsek } from "../src/lib/calc.ts";
import type { PromisePost } from "../src/lib/data";

/**
 * Beloppet så som det står på bilden. `formatMsek` bär enheten själv — mkr
 * eller mdkr efter storlek — plus minustecken och "≈" vid datoruppskattning.
 * Bilden versaliserar bara; den väljer aldrig enhet på egen hand.
 */
function ogBelopp(msek: number, basis?: string): string {
  return formatMsek(msek, basis).toUpperCase();
}

/*
 * Rubriken skalas så att hela löftet får plats — den kapas aldrig.
 *
 * Bilden bar tidigare `WebkitLineClamp: 2`, men satori (0.29) struntar i
 * klampen: en rubrik på 137 tecken renderades på FYRA rader och svämmade ut
 * över fotraden. En begränsning som inte gör något är värre än ingen, för den
 * ser ut att vara löst. Här räknas höjden i stället ut i förväg.
 *
 * Att kapa rubriken vore fel väg: löftets rubrik är det bilden handlar om,
 * och en trepunkt mitt i en mening säger läsaren mindre än en mindre stil gör.
 * Rubrikerna är 62 tecken i median men 144 som längst (mätt 2026-08-05), så
 * spannet måste rymma båda.
 */
const RUBRIK_BREDD = 1088;
const RAD_HOJD = 1.2;
/** Anton är smal: ett versalt tecken tar ungefär 0,452 × teckengraden i bredd.
 *  Kalibrerat mot en 137-teckens rubrik som bröts på 43 tecken vid grad 56. */
const TECKENBREDD = 0.452;

/** Höjden rubriken har till sitt förfogande, givet hur stort beloppet är. */
export function rubrikUtrymme(bigNumber: string): number {
  const inre = 630 - 48 * 2; // höjd minus lodrät marginal
  const toppRad = 28 * 1.2;
  const fotRad = 2 + 12 + 24 * 1.2; // linje + luft + text
  const beloppsGrad = bigNumber.length > 9 ? 128 : 176;
  return inre - toppRad - fotRad - beloppsGrad * 1.1;
}

/** Största teckengraden som får hela rubriken att rymmas ovanför fotraden. */
export function rubrikStorlek(title: string, bigNumber: string): number {
  const utrymme = rubrikUtrymme(bigNumber);
  for (const grad of [56, 50, 44, 38, 34, 30]) {
    const teckenPerRad = Math.max(1, Math.floor(RUBRIK_BREDD / (TECKENBREDD * grad)));
    const rader = Math.ceil(title.length / teckenPerRad);
    if (rader * grad * RAD_HOJD <= utrymme) return grad;
  }
  return 30;
}

/*
 * Fotraden har två texter som ska stå i var sin kant. Blir den vänstra för
 * lång skriver de över varandra — mätt 2026-08-05 hände det på 8 av 490
 * löftesbilder, alla med den långa grunden "Satt för hand vid granskningen".
 * IBM Plex Mono är fast bredd: varje tecken tar 0,6 × teckengraden.
 */
const MONO_TECKENBREDD = 0.6;
const FOT_LUFT = 24;

/** Största teckengraden där fotradens två texter inte krockar. */
export function fotStorlek(vanster: string, hoger: string): number {
  const tecken = vanster.length + hoger.length;
  for (const grad of [24, 22, 20, 18]) {
    if (tecken * MONO_TECKENBREDD * grad + FOT_LUFT <= RUBRIK_BREDD) return grad;
  }
  return 18;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../../data");
const DIST_DIR = resolve(__dirname, "../dist");
const FONTS_DIR = resolve(__dirname, "../public/fonts");

const antonFont = readFileSync(resolve(FONTS_DIR, "anton-latin-400-normal.ttf"));
const plexMono400 = readFileSync(resolve(FONTS_DIR, "ibm-plex-mono-latin-400-normal.ttf"));
const plexMono700 = readFileSync(resolve(FONTS_DIR, "ibm-plex-mono-latin-700-normal.ttf"));

const fonts = [
  { name: "Anton", data: antonFont, weight: 400, style: "normal" as const },
  { name: "IBM Plex Mono", data: plexMono400, weight: 400, style: "normal" as const },
  { name: "IBM Plex Mono", data: plexMono700, weight: 700, style: "normal" as const },
];

async function generateOgImage(opts: {
  topLabel: string;
  bigNumber: string;
  title: string;
  bottomLine: string;
}): Promise<Buffer> {
  const { topLabel, bigNumber, title, bottomLine } = opts;

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: 1200,
          height: 630,
          backgroundColor: "#111111",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 56px",
        },
        children: [
          {
            type: "div",
            props: {
              style: { color: "#6e6a61", fontFamily: "IBM Plex Mono", fontSize: 28 },
              children: topLabel,
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flex: 1,
                justifyContent: "center",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      color: "#FFD600",
                      fontFamily: "IBM Plex Mono",
                      fontWeight: 700,
                      fontSize: bigNumber.length > 9 ? 128 : 176,
                      lineHeight: 1.1,
                    },
                    children: bigNumber,
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      color: "#F6F3EC",
                      fontFamily: "Anton",
                      fontSize: rubrikStorlek(title, bigNumber),
                      textTransform: "uppercase",
                      letterSpacing: "0.01em",
                      // 1.1 klämmer de svenska prickarna mot raden ovanför.
                      lineHeight: RAD_HOJD,
                      maxWidth: RUBRIK_BREDD,
                      textAlign: "center",
                    },
                    children: title,
                  },
                },
              ],
            },
          },
          {
            type: "div",
            props: {
              style: {
                borderTop: "2px solid #6e6a61",
                paddingTop: 12,
                color: "#6e6a61",
                fontFamily: "IBM Plex Mono",
                fontSize: fotStorlek(bottomLine, "CC BY 4.0"),
                display: "flex",
                justifyContent: "space-between",
              },
              children: [
                { type: "span", props: { children: bottomLine } },
                { type: "span", props: { children: "CC BY 4.0" } },
              ],
            },
          },
        ],
      },
    },
    { width: 1200, height: 630, fonts }
  );

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
  return Buffer.from(resvg.render().asPng());
}

async function main() {
  const promises: PromisePost[] = JSON.parse(readFileSync(resolve(DATA_DIR, "promises.json"), "utf8"));
  const parties: Array<{ code: string; name: string }> = JSON.parse(readFileSync(resolve(DATA_DIR, "parties.json"), "utf8"));

  const ogDir = resolve(DIST_DIR, "og");
  if (!existsSync(ogDir)) mkdirSync(ogDir, { recursive: true });

  const flasket = totalFlasket(promises);

  const startPng = await generateOgImage({
    topLabel: "UTLOVAT.SE · FLÄSKVÅGEN",
    bigNumber: ogBelopp(flasket),
    title: "RIKSDAGSPARTIERNAS VALLÖFTEN 2026",
    bottomLine: "utlovat.se · Uppskattningar enligt öppen metod",
  });
  writeFileSync(resolve(ogDir, "start.png"), startPng);
  console.log(`OG: start.png (${ogBelopp(flasket)})`);

  for (const party of parties) {
    const partyTotal = partyTotalMsek(promises, party.code);
    const partyCount = getPromisesForParty(promises, party.code).length;

    const png = await generateOgImage({
      topLabel: `UTLOVAT.SE · PARTI`,
      bigNumber: ogBelopp(partyTotal),
      title: `VAD KOSTAR ${party.name.toUpperCase()}S VALLÖFTEN?`,
      bottomLine: `${partyCount} löften · utlovat.se`,
    });
    writeFileSync(resolve(ogDir, `parti-${party.code}.png`), png);
    console.log(`OG: parti-${party.code}.png`);
  }

  // Frågevågen: en OG-bild per fråga — samma neutrala kostym, siffran är
  // antal partier med tydligt besked (X/8), aldrig ett omdöme.
  interface IssueEntry { slug: string; title: string; subquestions: Array<{ id: string }> }
  interface StanceEntry { subquestion_id: string; party: string; statements: unknown[] }
  const issuesFile = JSON.parse(readFileSync(resolve(DATA_DIR, "issues.json"), "utf8")) as { issues: IssueEntry[] };
  const stances = JSON.parse(readFileSync(resolve(DATA_DIR, "stances.json"), "utf8")) as StanceEntry[];

  for (const issue of issuesFile.issues) {
    const sqIds = new Set(issue.subquestions.map((sq) => sq.id));
    const partiesWithStance = new Set(
      stances.filter((c) => sqIds.has(c.subquestion_id) && c.statements.length > 0).map((c) => c.party),
    ).size;
    const png = await generateOgImage({
      topLabel: `UTLOVAT.SE · FRÅGEVÅGEN · ${issue.slug}`,
      bigNumber: `${partiesWithStance}/8`,
      title: `VAR STÅR PARTIERNA OM ${issue.title.toUpperCase()}?`,
      bottomLine: "Partier med tydligt besked · Ordagranna citat med arkivkopior · utlovat.se",
    });
    writeFileSync(resolve(ogDir, `fraga-${issue.slug}.png`), png);
  }
  console.log(`OG: ${issuesFile.issues.length} issue images`);

  // Löftesbilderna är 4 094 av 4 113 och tar 123 av stegets 124 sekunder.
  // De behövs i det som driftsätts, inte för att avgöra om en gren håller:
  // koden som räknar dem har en egen grind (`test-og.mts`) som körs före
  // bygget, och T1 kräver bara start- och partibilderna. Därför hoppas de på
  // PR-körningar. Mätt 2026-09-04.
  if (process.env.OG_UTAN_LOFTEN === "1") {
    console.log("OG: löftesbilderna hoppade (OG_UTAN_LOFTEN=1)");
    return;
  }

  for (const p of promises) {
    const total = promiseTotalMsek(p);

    const png = await generateOgImage({
      topLabel: `UTLOVAT.SE · ÄRENDE ${p.id} · ${p.source.domain}`,
      bigNumber: ogBelopp(total, p.cost.basis),
      title: p.title.toUpperCase(),
      bottomLine: `Källa: ${formatBasisLabel(p.cost.basis)} · Hämtad ${p.source.fetched_at.slice(0, 10)} · utlovat.se`,
    });
    const promiseDir = resolve(ogDir, p.id);
    if (!existsSync(promiseDir)) mkdirSync(promiseDir, { recursive: true });
    writeFileSync(resolve(promiseDir, "og.png"), png);
  }
  console.log(`OG: ${promises.length} promise images`);
}

// Kör bara när filen startas direkt. Utan vakten skulle grinden i test-og.mts
// generera alla 490 bilderna bara genom att importera måtten den ska pröva.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
