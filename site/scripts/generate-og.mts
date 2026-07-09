import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface PromisePost {
  cost: {
    type: string;
    period: string;
    msek_base: number;
    basis: string;
  };
  status: string;
  parties: string[];
  group_id: string | null;
  id: string;
  slug: string;
  title: string;
  source: { domain: string; fetched_at: string };
}

function promiseTotalMsek(p: PromisePost): number {
  return p.cost.msek_base * (p.cost.period === "per_ar" ? 4 : 1);
}

// R3: samma politik (delat group_id) räknas EN gång. MÅSTE spegla
// src/lib/aggregates.ts — annars visar OG-bilderna en icke-deduperad
// (uppblåst) total medan sajtsidorna visar den rätta.
function dedupeByGroup(promises: PromisePost[]): PromisePost[] {
  const seen = new Set<string>();
  const out: PromisePost[] = [];
  for (const p of promises) {
    if (p.group_id) {
      if (seen.has(p.group_id)) continue;
      seen.add(p.group_id);
    }
    out.push(p);
  }
  return out;
}

function totalFlasket(promises: PromisePost[]): number {
  return dedupeByGroup(promises)
    .filter((p) => p.cost.type === "utgift" || p.cost.type === "intäktsminskning")
    .reduce((sum, p) => sum + promiseTotalMsek(p), 0);
}

function partyTotalMsek(promises: PromisePost[], code: string): number {
  return dedupeByGroup(
    promises.filter((p) => p.parties.includes(code) && p.status !== "tillbakadragen"),
  ).reduce((sum, p) => sum + promiseTotalMsek(p), 0);
}

function formatMsekBare(msek: number): string {
  if (msek >= 1000) {
    const mdkr = msek / 1000;
    return mdkr >= 10
      ? `${mdkr.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")}`
      : `${mdkr.toFixed(1).replace(".", ",")}`;
  }
  return `${msek.toLocaleString("sv-SE")}`;
}

function formatMsekOg(msek: number, basis?: string): string {
  const prefix = basis === "llm_estimat" ? "≈ " : "";
  return `${prefix}${formatMsekBare(msek)}`;
}

function formatBasisLabel(basis: string): string {
  const labels: Record<string, string> = {
    rut: "RUT/utredning",
    myndighet: "Myndighet",
    parti: "Partiets beräkning",
    media: "Media",
    llm_estimat: "LLM-estimat",
  };
  return labels[basis] ?? basis;
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
                      fontSize: 56,
                      textTransform: "uppercase",
                      letterSpacing: "0.01em",
                      lineHeight: 1.1,
                      maxWidth: 1088,
                      textAlign: "center",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
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
                fontSize: 24,
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
    topLabel: "DRYGAST.NU · FLÄSKVÅGEN",
    bigNumber: `${formatMsekOg(flasket)} MDKR`,
    title: "RIKSDAGSPARTIERNAS VALLÖFTEN 2026",
    bottomLine: "drygast.nu · Uppskattningar enligt öppen metod",
  });
  writeFileSync(resolve(ogDir, "start.png"), startPng);
  console.log(`OG: start.png (${formatMsekOg(flasket)} MDKR)`);

  for (const party of parties) {
    const partyTotal = partyTotalMsek(promises, party.code);
    const partyCount = promises.filter((p) => p.parties.includes(party.code) && p.status !== "tillbakadragen").length;

    const png = await generateOgImage({
      topLabel: `DRYGAST.NU · PARTI`,
      bigNumber: `${formatMsekOg(partyTotal)} MDKR`,
      title: `VAD KOSTAR ${party.name.toUpperCase()}S VALLÖFTEN?`,
      bottomLine: `${partyCount} löften · drygast.nu`,
    });
    writeFileSync(resolve(ogDir, `parti-${party.code}.png`), png);
    console.log(`OG: parti-${party.code}.png`);
  }

  for (const p of promises) {
    const total = promiseTotalMsek(p);

    const png = await generateOgImage({
      topLabel: `DRYGAST.NU · ÄRENDE ${p.id} · ${p.source.domain}`,
      bigNumber: `${formatMsekOg(total, p.cost.basis)} MDKR`,
      title: p.title.toUpperCase(),
      bottomLine: `Källa: ${formatBasisLabel(p.cost.basis)} · Hämtad ${p.source.fetched_at.slice(0, 10)} · drygast.nu`,
    });
    const promiseDir = resolve(ogDir, p.id);
    if (!existsSync(promiseDir)) mkdirSync(promiseDir, { recursive: true });
    writeFileSync(resolve(promiseDir, "og.png"), png);
  }
  console.log(`OG: ${promises.length} promise images`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
