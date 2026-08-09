/**
 * Ritar kanalbilderna och skriver `kanal/` i repotoppen.
 *
 * Kör: `pnpm kanalbilder` från `site/`. Bilderna är INTE en del av sajtbygget —
 * de laddas upp för hand i ett flöde och byggs om när talen rört sig tillräckligt
 * för att ett golv ska ha blivit inaktuellt (se `kanalbilder.mts`).
 *
 * Kostymen är sajtens egen (DESIGN.md): papper, svärta, EN signalfärg, inga
 * rundade hörn, inga skuggor, inga emoji, Anton för rubriker och IBM Plex Mono
 * för allt annat.
 *
 * Två ramar, av två skäl:
 *
 * - **Lodrätt (1080×1920)** för flöden. Allt som bär betydelse ligger ovanför
 *   y≈1450, eftersom appens egna knappar och bildtext täcker underkanten —
 *   nedre fjärdedelen är därför medvetet tom.
 * - **Liggande (1920×1080)** som omslag till en artikel. Där visas hela bilden,
 *   så ytan används fullt ut: rubrik och resonemang till vänster, paneler till
 *   höger. Ramens fyra delar har låsta höjder som MÅSTE summera till 1 080 —
 *   annars trycks den understa ut ur bilden och innehållet klipps tyst.
 */
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { byggBilder, mätUnderlaget, type Bild, type Block } from "./kanalbilder.mts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = resolve(__dirname, "../public/fonts");
const UT_DIR = resolve(__dirname, "../../kanal");

/* Färgerna är tokens.css, ordagrant. Ändras de där ska de ändras här. */
const PAPPER = "#F6F3EC";
const SVARTA = "#111111";
const GUL = "#FFD600";
const GRAFIT = "#3F3D38";
const DIS = "#6E6A61";
const LINJE_SVAG = "#C9C3B6";

const BREDD = 1080;
const HOJD = 1920;
const MARGINAL = 64;
const SPALT = BREDD - MARGINAL * 2;

/* Artikelbildens mått. Liggande 16:9 duger både som omslag till en text och
   som förhandsbild när länken delas. */
const L_BREDD = 1920;
const L_HOJD = 1080;
const L_MARGINAL = 72;
/** Vänsterspalten bär rubriken och resonemanget, högerspalten panelerna. */
const L_TEXT = 900;
/**
 * Ramens fyra delar. De MÅSTE summera till `L_HOJD` — gör de inte det trycks
 * den understa delen ut ur bilden och innehållet klipps längst ned utan att
 * något säger ifrån. Grinden i test-kanalbilder.mts räknar summan.
 */
const L_HUVUD = 108;
const L_INNEHALL = 830;
const L_KALLRAD = 58;
const L_FOT = 84;
export const L_DELAR = [L_HUVUD, L_INNEHALL, L_KALLRAD, L_FOT];
export const L_RAM = { bredd: L_BREDD, hojd: L_HOJD };
const L_PANEL = L_BREDD - L_MARGINAL * 2 - L_TEXT - 56;

const fonts = [
  { name: "Anton", data: readFileSync(resolve(FONTS_DIR, "anton-latin-400-normal.ttf")), weight: 400 as const, style: "normal" as const },
  { name: "IBM Plex Mono", data: readFileSync(resolve(FONTS_DIR, "ibm-plex-mono-latin-400-normal.ttf")), weight: 400 as const, style: "normal" as const },
  { name: "IBM Plex Mono", data: readFileSync(resolve(FONTS_DIR, "ibm-plex-mono-latin-700-normal.ttf")), weight: 700 as const, style: "normal" as const },
];

type El = { type: string; props: Record<string, unknown> };

function ruta(style: Record<string, unknown>, children?: unknown): El {
  return { type: "div", props: { style: { display: "flex", ...style }, children } };
}

function text(innehall: string, style: Record<string, unknown>): El {
  return ruta(style, innehall);
}

/* ─────────────────────────────────────────────────────────────── blockritare ── */

function ritaBlock(block: Block, bredd: number = SPALT): El {
  switch (block.typ) {
    case "kicker":
      return ruta(
        {
          alignSelf: "flex-start",
          backgroundColor: GUL,
          padding: "8px 16px",
          // Anton bär höga prickar och ringar (Ä, Å). Utan luften här skar de
          // in i överradens gula platta på var tredje rubrik.
          marginBottom: "46px",
        },
        text(block.text, {
          fontFamily: "IBM Plex Mono",
          fontWeight: 700,
          fontSize: "26px",
          letterSpacing: "0.07em",
          color: SVARTA,
        }),
      );

    case "rubrik":
      return text(block.text, {
        fontFamily: "Anton",
        fontSize: `${block.grad ?? 120}px`,
        lineHeight: 1.04,
        letterSpacing: "0.01em",
        color: SVARTA,
        width: `${bredd}px`,
        marginBottom: "36px",
      });

    case "brodtext":
      return text(block.text, {
        fontFamily: "IBM Plex Mono",
        fontSize: `${block.grad ?? 32}px`,
        lineHeight: 1.5,
        color: GRAFIT,
        width: `${bredd}px`,
        marginBottom: "28px",
      });

    case "jattetal":
      return ruta(
        {
          flexDirection: "column",
          backgroundColor: SVARTA,
          padding: "36px 40px 40px",
          width: `${bredd}px`,
          marginBottom: "36px",
        },
        [
          block.over
            ? text(block.over, {
                fontFamily: "Anton",
                fontSize: "64px",
                color: PAPPER,
                letterSpacing: "0.01em",
              })
            : ruta({}),
          text(block.tal, {
            fontFamily: "IBM Plex Mono",
            fontWeight: 700,
            fontSize: "216px",
            lineHeight: 1.05,
            color: GUL,
          }),
          text(block.enhet, {
            fontFamily: "Anton",
            fontSize: "58px",
            color: PAPPER,
            letterSpacing: "0.01em",
          }),
          text(block.underrad, {
            fontFamily: "IBM Plex Mono",
            fontSize: "26px",
            color: LINJE_SVAG,
            marginTop: "14px",
          }),
        ],
      );

    case "punkter":
      return ruta(
        { flexDirection: "column", width: `${bredd}px` },
        block.poster.map((post) =>
          ruta({ marginBottom: "34px", alignItems: "flex-start" }, [
            ruta(
              {
                width: "78px",
                height: "78px",
                backgroundColor: SVARTA,
                alignItems: "center",
                justifyContent: "center",
                marginRight: "28px",
                flexShrink: 0,
              },
              text(post.etikett, { fontFamily: "Anton", fontSize: "44px", color: GUL }),
            ),
            ruta({ flexDirection: "column", width: `${bredd - 106}px` }, [
              text(post.rubrik, {
                fontFamily: "Anton",
                fontSize: "50px",
                color: SVARTA,
                letterSpacing: "0.01em",
                lineHeight: 1.1,
              }),
              text(post.text, {
                fontFamily: "IBM Plex Mono",
                fontSize: "27px",
                lineHeight: 1.45,
                color: GRAFIT,
                marginTop: "10px",
              }),
            ]),
          ]),
        ),
      );

    case "faktarad":
      return ruta(
        { flexWrap: "wrap", width: `${bredd}px`, marginTop: "8px" },
        block.delar.map((del) =>
          ruta({ backgroundColor: SVARTA, padding: "12px 20px", marginRight: "16px", marginBottom: "16px" },
            text(del, {
              fontFamily: "IBM Plex Mono",
              fontWeight: 700,
              fontSize: "30px",
              letterSpacing: "0.07em",
              color: GUL,
            }),
          ),
        ),
      );

    case "statrader":
      return ruta(
        { flexDirection: "column", width: `${bredd}px` },
        block.poster.map((post) =>
          ruta({ alignItems: "center", marginBottom: "26px" }, [
            ruta(
              {
                backgroundColor: SVARTA,
                // Fast bredd, inte minWidth: plattorna ska stå i en rak kant
                // under varandra även när talen är olika långa.
                width: "348px",
                height: "116px",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 18px",
                marginRight: "26px",
                flexShrink: 0,
              },
              text(post.tal, { fontFamily: "IBM Plex Mono", fontWeight: 700, fontSize: "66px", color: GUL }),
            ),
            text(post.etikett, {
              fontFamily: "IBM Plex Mono",
              fontWeight: 700,
              fontSize: "25px",
              lineHeight: 1.35,
              letterSpacing: "0.04em",
              color: SVARTA,
              width: `${bredd - 374}px`,
            }),
          ]),
        ),
      );

    case "staplar": {
      const ETIKETT = 200;
      const VARDE = 270;
      const BANA = bredd - ETIKETT - VARDE;
      return ruta({ flexDirection: "column", width: `${bredd}px` }, [
        ...block.rader.map((rad) =>
          ruta({ alignItems: "center", marginBottom: "18px" }, [
            text(rad.etikett, {
              fontFamily: "IBM Plex Mono",
              fontWeight: 700,
              fontSize: "30px",
              letterSpacing: "0.05em",
              color: SVARTA,
              width: `${ETIKETT}px`,
            }),
            ruta({ width: `${BANA}px`, height: "52px", alignItems: "center", borderLeft: `2px solid ${SVARTA}` },
              ruta({
                width: `${Math.max(4, Math.round(rad.andel * (BANA - 6)))}px`,
                height: "52px",
                backgroundColor: rad.markerad ? GUL : SVARTA,
                borderTop: rad.markerad ? `2px solid ${SVARTA}` : "none",
                borderBottom: rad.markerad ? `2px solid ${SVARTA}` : "none",
                borderRight: rad.markerad ? `2px solid ${SVARTA}` : "none",
              }),
            ),
            text(rad.varde, {
              fontFamily: "IBM Plex Mono",
              fontSize: "26px",
              color: GRAFIT,
              width: `${VARDE}px`,
              paddingLeft: "18px",
            }),
          ]),
        ),
        text(block.not, {
          fontFamily: "IBM Plex Mono",
          fontSize: "22px",
          lineHeight: 1.4,
          color: DIS,
          width: `${bredd}px`,
          marginTop: "10px",
          marginBottom: "24px",
        }),
      ]);
    }

    case "rutnat": {
      const kolumner = block.kolumner.length;
      const CELL_B = 78;
      const CELL_H = 20;
      const LUFT = 6;
      const rader: El[] = [];
      for (let i = 0; i < block.celler.length; i += kolumner) {
        rader.push(
          ruta(
            { marginBottom: `${LUFT}px` },
            block.celler.slice(i, i + kolumner).map((fylld) =>
              ruta({
                width: `${CELL_B}px`,
                height: `${CELL_H}px`,
                marginRight: `${LUFT}px`,
                backgroundColor: fylld ? SVARTA : "transparent",
                border: fylld ? "none" : `1px solid ${LINJE_SVAG}`,
              }),
            ),
          ),
        );
      }
      return ruta({ flexDirection: "column", width: `${bredd}px` }, [
        ruta(
          { marginBottom: "10px" },
          block.kolumner.map((kod) =>
            ruta({ width: `${CELL_B}px`, marginRight: `${LUFT}px`, justifyContent: "center" },
              text(kod, { fontFamily: "IBM Plex Mono", fontWeight: 700, fontSize: "22px", color: DIS }),
            ),
          ),
        ),
        ...rader,
        text(block.not, {
          fontFamily: "IBM Plex Mono",
          fontSize: "22px",
          lineHeight: 1.4,
          color: DIS,
          width: `${bredd}px`,
          marginTop: "12px",
          marginBottom: "22px",
        }),
      ]);
    }

    /**
     * Panelen är artikelbildens byggsten: en inramad ruta med en etikett, en
     * rubrik och ett par tal med sin förklaring bredvid. Ramen är en hårlinje,
     * inte ett kort — ytor görs med linjer i den här kostymen.
     */
    case "panel": {
      const inre = bredd - 4 - 52;
      return ruta(
        {
          flexDirection: "column",
          width: `${bredd}px`,
          border: `2px solid ${SVARTA}`,
          padding: "18px 24px 20px",
          marginBottom: "22px",
        },
        [
          ruta({ alignSelf: "flex-start", backgroundColor: SVARTA, padding: "6px 12px", marginBottom: "14px" },
            text(block.etikett, {
              fontFamily: "IBM Plex Mono",
              fontWeight: 700,
              fontSize: "20px",
              letterSpacing: "0.07em",
              color: GUL,
            }),
          ),
          text(block.rubrik, {
            fontFamily: "Anton",
            fontSize: "34px",
            letterSpacing: "0.01em",
            lineHeight: 1.08,
            color: SVARTA,
            width: `${inre}px`,
            marginBottom: "14px",
          }),
          ...block.rader.map((rad) =>
            ruta({ alignItems: "flex-start", marginBottom: "14px", width: `${inre}px` }, [
              rad.tal
                ? text(rad.tal, {
                    fontFamily: "IBM Plex Mono",
                    fontWeight: 700,
                    fontSize: "34px",
                    lineHeight: 1.2,
                    color: SVARTA,
                    width: "158px",
                    flexShrink: 0,
                  })
                : ruta({ width: "0px" }),
              text(rad.text, {
                fontFamily: "IBM Plex Mono",
                fontSize: "22px",
                lineHeight: 1.35,
                color: GRAFIT,
                width: `${inre - (rad.tal ? 158 : 0)}px`,
                paddingTop: "6px",
              }),
            ]),
          ),
          block.not
            ? ruta({ borderTop: `1px solid ${LINJE_SVAG}`, paddingTop: "12px", marginTop: "4px", width: `${inre}px` },
                text(block.not, {
                  fontFamily: "IBM Plex Mono",
                  fontSize: "20px",
                  lineHeight: 1.35,
                  color: DIS,
                  width: `${inre}px`,
                }),
              )
            : ruta({}),
        ],
      );
    }

    case "luft":
      return ruta({ height: `${block.hojd}px` });
  }
}

/* ───────────────────────────────────────────────────────────────── hela ramen ── */

function ritaLodrat(bild: Bild): El {
  return ruta({ flexDirection: "column", width: `${BREDD}px`, height: `${HOJD}px`, backgroundColor: PAPPER }, [
    // Sidhuvud: sajtens namn till vänster, seriens plats i följden till höger.
    ruta(
      {
        height: "150px",
        backgroundColor: SVARTA,
        alignItems: "center",
        justifyContent: "space-between",
        padding: `0 ${MARGINAL}px`,
        flexShrink: 0,
      },
      [
        ruta({ alignItems: "center" }, [
          text("UTLOVAT", { fontFamily: "Anton", fontSize: "52px", color: PAPPER, letterSpacing: "0.01em" }),
          ruta({ backgroundColor: GUL, padding: "2px 10px", marginLeft: "4px" },
            text(".SE", { fontFamily: "Anton", fontSize: "52px", color: SVARTA, letterSpacing: "0.01em" }),
          ),
        ]),
        text(`${bild.serie} ${bild.nr}/${bild.antal}`, {
          fontFamily: "IBM Plex Mono",
          fontWeight: 700,
          fontSize: "24px",
          letterSpacing: "0.07em",
          color: GUL,
        }),
      ],
    ),

    // Innehållet. Höjden är låst så att bilden aldrig kan växa in i underkanten.
    ruta({ flexDirection: "column", height: "1220px", padding: `52px ${MARGINAL}px 0`, overflow: "hidden" },
      bild.block.map((block) => ritaBlock(block)),
    ),

    // Källraden — obligatorisk under varje diagram, också här.
    ruta({ padding: `0 ${MARGINAL}px`, height: "80px", alignItems: "center", flexShrink: 0 },
      ruta({ width: `${SPALT}px`, borderTop: `2px solid ${SVARTA}`, paddingTop: "14px" },
        text(bild.kallrad, { fontFamily: "IBM Plex Mono", fontSize: "22px", color: DIS }),
      ),
    ),

    // Uppmaningen. Ligger medvetet i den zon appens egna knappar kan täcka —
    // den bär ingenting som inte står någon annanstans på bilden.
    ruta(
      {
        height: "150px",
        backgroundColor: SVARTA,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      },
      ruta({ flexDirection: "column", alignItems: "center" }, [
        text("UTLOVAT.SE", { fontFamily: "Anton", fontSize: "62px", color: GUL, letterSpacing: "0.01em" }),
        text("hela granskningen, med källor", {
          fontFamily: "IBM Plex Mono",
          fontSize: "24px",
          color: PAPPER,
          marginTop: "6px",
        }),
      ]),
    ),
  ]);
}

/* ─────────────────────────────────────────────────────────────────── körningen ── */


/**
 * Artikelbildens ram: rubrik och resonemang till vänster, panelerna till höger.
 *
 * Här finns ingen död zon att spara — en artikelbild visas hel. Därför bär den
 * också mer text än de lodräta, och talen står exakt.
 */
function ritaLiggande(bild: Bild): El {
  const vanster = bild.block.filter((b) => b.typ !== "panel");
  const hoger = bild.block.filter((b) => b.typ === "panel");
  return ruta({ flexDirection: "column", width: `${L_BREDD}px`, height: `${L_HOJD}px`, backgroundColor: PAPPER }, [
    ruta(
      {
        height: `${L_HUVUD}px`,
        backgroundColor: SVARTA,
        alignItems: "center",
        justifyContent: "space-between",
        padding: `0 ${L_MARGINAL}px`,
        flexShrink: 0,
      },
      [
        ruta({ alignItems: "center" }, [
          text("UTLOVAT", { fontFamily: "Anton", fontSize: "46px", color: PAPPER, letterSpacing: "0.01em" }),
          ruta({ backgroundColor: GUL, padding: "2px 9px", marginLeft: "4px" },
            text(".SE", { fontFamily: "Anton", fontSize: "46px", color: SVARTA, letterSpacing: "0.01em" }),
          ),
        ]),
        text("GRANSKNING INFÖR RIKSDAGSVALET 13 SEPTEMBER 2026", {
          fontFamily: "IBM Plex Mono",
          fontWeight: 700,
          fontSize: "22px",
          letterSpacing: "0.07em",
          color: GUL,
        }),
      ],
    ),

    ruta({ height: `${L_INNEHALL}px`, padding: `36px ${L_MARGINAL}px 0`, overflow: "hidden" }, [
      ruta({ flexDirection: "column", width: `${L_TEXT}px`, marginRight: "56px" },
        vanster.map((block) => ritaBlock(block, L_TEXT)),
      ),
      ruta({ flexDirection: "column", width: `${L_PANEL}px` },
        hoger.map((block) => ritaBlock(block, L_PANEL)),
      ),
    ]),

    ruta({ padding: `0 ${L_MARGINAL}px`, height: `${L_KALLRAD}px`, alignItems: "center", flexShrink: 0 },
      ruta({ width: `${L_BREDD - L_MARGINAL * 2}px`, borderTop: `2px solid ${SVARTA}`, paddingTop: "12px" },
        text(bild.kallrad, { fontFamily: "IBM Plex Mono", fontSize: "21px", color: DIS }),
      ),
    ),

    ruta(
      {
        height: `${L_FOT}px`,
        backgroundColor: SVARTA,
        alignItems: "center",
        justifyContent: "space-between",
        padding: `0 ${L_MARGINAL}px`,
        flexShrink: 0,
      },
      [
        text("UTLOVAT.SE/HANDLINGSVAGEN", { fontFamily: "Anton", fontSize: "40px", color: GUL, letterSpacing: "0.01em" }),
        text("hela granskningen, med källor och arkivkopior", {
          fontFamily: "IBM Plex Mono",
          fontSize: "24px",
          color: PAPPER,
        }),
      ],
    ),
  ]);
}

/** Måtten som gäller för bildens format. */
function matt(bild: Bild): { bredd: number; hojd: number } {
  return bild.format === "liggande" ? { bredd: L_BREDD, hojd: L_HOJD } : { bredd: BREDD, hojd: HOJD };
}

/** En färdig PNG. Exporterad så att grinden kan mäta ramen utan att skriva filer. */
export async function ritaEnBild(bild: Bild): Promise<Buffer> {
  const { bredd, hojd } = matt(bild);
  const ram = bild.format === "liggande" ? ritaLiggande(bild) : ritaLodrat(bild);
  const svg = await satori(ram as never, { width: bredd, height: hojd, fonts });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: bredd } }).render().asPng());
}

function skrivTexter(bilder: Bild[], datum: string, akt: string): string {
  const rader: string[] = [
    "# Kanalbilder — skärmtext, bildtexter och talen bakom golven",
    "",
    "Skriven av `site/scripts/generate-kanalbilder.mts`. **Ändra inte för hand** —",
    "kör om skriptet i stället, annars säger filen och bilderna olika saker.",
    "",
    `Talen är mätta ur datat den ${datum} (akt \`${akt}\`).`,
    "",
    "Bilderna säger \"över\" och \"mer än\" med flit: en bild ligger kvar i ett flöde",
    "långt efter att den lagts upp, och beståndet växer varje vecka. Golvet är det",
    "rundaste talet under mätningen som inte tappar mer än en femtedel. Under varje",
    "bild står vad golvet vilade på när bilden ritades.",
    "",
    "**Bygg om bilderna när ett golv passerats** — alltså när ett mätt tal vuxit så",
    "mycket att nästa runda tal ligger under det, eller sjunkit under sitt eget golv.",
    "",
  ];
  for (const bild of bilder) {
    rader.push(`## ${bild.fil}.png`, "");
    rader.push(
      `*${bild.serie} ${bild.nr}/${bild.antal} — ${bild.format === "liggande" ? "liggande 1920×1080" : "lodrät 1080×1920"}*`,
      "",
    );
    if (bild.format === "liggande") {
      rader.push(
        "> Den här bilden skriver talen **exakt**, inte som golv: den hör till en",
        "> daterad text, och en läsare som klickar sig vidare ska hitta samma tal i",
        "> registret. Bygg om den när talen rört sig och texten ska återanvändas.",
        "",
      );
    }
    rader.push("**Skärmtext**", "");
    for (const block of bild.block) {
      if (block.typ === "kicker") rader.push(`- Överrad: ${block.text}`);
      if (block.typ === "rubrik") rader.push(`- Rubrik: **${block.text}**`);
      if (block.typ === "brodtext") rader.push(`- Text: ${block.text}`);
      if (block.typ === "jattetal")
        rader.push(`- Jättetal: ${block.over ?? ""} ${block.tal} ${block.enhet} — ${block.underrad}`.trim());
      if (block.typ === "punkter")
        for (const p of block.poster) rader.push(`- ${p.etikett}. **${p.rubrik}** — ${p.text}`);
      if (block.typ === "faktarad") rader.push(`- Faktarad: ${block.delar.join(" · ")}`);
      if (block.typ === "statrader")
        for (const p of block.poster) rader.push(`- ${p.tal} — ${p.etikett}`);
      if (block.typ === "staplar") {
        for (const r of block.rader) rader.push(`- Stapel ${r.etikett}: ${r.varde}`);
        rader.push(`- Not: ${block.not}`);
      }
      if (block.typ === "rutnat") rader.push(`- Rutnät: ${block.not}`);
      if (block.typ === "panel") {
        rader.push(`- Panel *${block.etikett}* — **${block.rubrik}**`);
        for (const r of block.rader) rader.push(`  - ${r.tal ? `${r.tal} — ` : ""}${r.text}`);
        if (block.not) rader.push(`  - Not: ${block.not}`);
      }
    }
    rader.push("", `**Källrad på bilden:** ${bild.kallrad}`, "");
    rader.push("**Förslag på bildtext**", "", `> ${bild.bildtext}`, "");
    if (bild.matningar.length > 0) {
      rader.push("**Golven och mätningen bakom dem**", "");
      rader.push("| Står på bilden | Mätt värde |", "| --- | --- |");
      for (const m of bild.matningar) rader.push(`| ${m.pastaende} | ${m.matt} |`);
      rader.push("");
    }
  }
  return rader.join("\n");
}

async function main(): Promise<void> {
  const underlag = mätUnderlaget();
  const bilder = byggBilder(underlag);
  mkdirSync(UT_DIR, { recursive: true });
  for (const bild of bilder) {
    writeFileSync(resolve(UT_DIR, `${bild.fil}.png`), await ritaEnBild(bild));
    console.log(`skrev kanal/${bild.fil}.png`);
  }
  writeFileSync(resolve(UT_DIR, "TEXTER.md"), `${skrivTexter(bilder, underlag.datum, underlag.akt)}\n`);
  console.log(`skrev kanal/TEXTER.md — ${bilder.length} bilder`);
}

// Samma vakt som generate-og.mts: filen ska gå att importera från grinden utan
// att skriva en enda fil.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
