/**
 * H2-svepet — ordagrannheten prövas om mot riksdagens källor, varje vecka.
 *
 * VARFÖR DEN HÄR FINNS
 *
 * H2 prövas när en koppling skapas: citatet ska stå tecken för tecken i
 * riksdagsdokumentet, och i den del som ÄR handlingen. Efter publicering
 * prövas den aldrig igen. Kopplingarna bär bara metadata — dokumenttexten
 * sparas inte lokalt — så det som står på sajten vilar på en kontroll gjord
 * en gång, mot en text som ligger hos någon annan.
 *
 * Att den kontrollen åldras är mätt och inte befarat. Andra ledet i H2 — att
 * citatet ska stå i handlingens EGEN del — tillkom 2026-08-06, efter att kön
 * fyllts, och när kön kördes om mot den nya regeln föll 354 poster till 69.
 * Frågorna kom in i grinden först 2026-08-14. Varje sådan skärpning gäller
 * bara det som prövas efter den, om ingen kör om.
 *
 * Omkörningen gjordes som en engångsinsats med ett skript som låg utanför
 * repot. Ett engångsskript åldras samma dag det körts.
 *
 * DEN HÄR RAPPORTERAR, DEN BLOCKERAR INTE
 *
 * Svepet är ett veckojobb, inte en byggrind — det talar med riksdagens API
 * och en byggrind som gör det faller när nätet gör det, inte när datat är
 * fel. Fynden skrivs som data och committas; larmet går när SVEPET är
 * trasigt, aldrig för att ett fynd hittades. Det är samma ordning som
 * källrötebevakningen: ett fynd är ett mätvärde, inte ett haveri.
 *
 * BRÖDTEXTEN ÄR INGET FYND
 *
 * 76 publicerade kopplingar citerar med flit handlingens brödtext, på tre
 * utskrivna grunder (`bevis.brodtext_oppen`). Ett svep som rapporterade dem
 * varje vecka hade lärt läsaren att bortse från listan. De räknas för sig.
 */

import { normalizeForVerbatim, utanforHandlingen } from "./grindar.ts";
import type { GrindKontext } from "./grindar.ts";
import type { Brodtextgrund } from "./brodtextspar.ts";

export type Sveputfall =
  /** Citatet står ordagrant i källan och i handlingens egen del. Inget att göra. */
  | "haller"
  /** Citatet står i brödtexten, men på en utskriven grund. Inget fynd. */
  | "brodtext_med_grund"
  /** Citatet står i dokumentet men inte i handlingens egen del, och ingen grund är angiven. */
  | "utanfor_handlingen"
  /** Citatet står inte i dokumentet alls. Det allvarligaste utfallet. */
  | "inte_ordagrant"
  /** Hämtningen föll, eller handlingens delar gick inte att läsa. Inget besked. */
  | "oprovad";

/** Utfallen som ska läsas av en människa. De andra är mätvärden. */
export const FYND: readonly Sveputfall[] = ["inte_ordagrant", "utanfor_handlingen"];

export interface Sveprad {
  koppling_id: string;
  handling_id: string;
  dok_id: string;
  utfall: Sveputfall;
  /** Vad utfallet betyder, i klartext. Samma text som grinden och bevisbytet ger. */
  skal: string;
}

/**
 * Prövar ett publicerat citat mot den text som ligger hos riksdagen i dag.
 *
 * `kalltext === null` betyder att hämtningen föll — inte att citatet är
 * borta. Skillnaden är hela skälet till att utfallet `oprovad` finns:
 * blandas de två ihop rapporterar svepet ett nätfel som ett datafel, och då
 * blir listan obrukbar den vecka riksdagen är långsam.
 *
 * `handlingstext === undefined` betyder att handlingens egna delar inte gick
 * att läsa — en yrkandelista som inte svarade, en fråga utan igenkänd
 * lydelse. Då prövas bara det ordagranna, precis som grinden gör.
 */
export function provaCitatet(
  citat: string,
  kalltext: string | null,
  handlingstext: GrindKontext["handlingstext"] | undefined,
  brodtextgrund: Brodtextgrund | undefined,
): { utfall: Sveputfall; skal: string } {
  if (kalltext === null) {
    return { utfall: "oprovad", skal: "Källdokumentet gick inte att hämta — citatet är oprövat den här veckan" };
  }
  const c = normalizeForVerbatim(citat);
  if (c === "" || !normalizeForVerbatim(kalltext).includes(c)) {
    return {
      utfall: "inte_ordagrant",
      skal: "Citatet återfinns inte ordagrant i riksdagsdokumentet (normaliserad jämförelse)",
    };
  }
  if (!handlingstext || handlingstext.delar.length === 0) {
    return {
      utfall: "oprovad",
      skal: "Handlingens egna lydelser gick inte att läsa — bara det ordagranna är prövat",
    };
  }
  if (handlingstext.delar.some((del) => normalizeForVerbatim(del).includes(c))) {
    return { utfall: "haller", skal: "Citatet står ordagrant i handlingens egen del" };
  }
  if (brodtextgrund) {
    return {
      utfall: "brodtext_med_grund",
      skal: `Citatet står i brödtexten på utskriven grund (${brodtextgrund})`,
    };
  }
  return {
    utfall: "utanfor_handlingen",
    skal: utanforHandlingen(handlingstext.sort, handlingstext.delar.length),
  };
}

export interface Svepstatus {
  provade: number;
  haller: number;
  brodtext_med_grund: number;
  oprovad: number;
  /** Kopplingarna en människa ska läsa. Tom lista är svepets normalläge. */
  fynd: Sveprad[];
}

export function svepstatus(rader: readonly Sveprad[]): Svepstatus {
  const antal = (u: Sveputfall) => rader.filter((r) => r.utfall === u).length;
  return {
    provade: rader.length,
    haller: antal("haller"),
    brodtext_med_grund: antal("brodtext_med_grund"),
    oprovad: antal("oprovad"),
    fynd: rader.filter((r) => FYND.includes(r.utfall)).sort((a, b) => a.koppling_id.localeCompare(b.koppling_id)),
  };
}

/**
 * Är svepet självt trasigt?
 *
 * Ett enstaka oprövat dokument är vardag — riksdagen svarar inte alltid. Att
 * nästan ingenting gick att pröva är något annat: då mäter körningen
 * ingenting, och att skriva «inga fynd» efter en sådan körning vore att
 * rapportera tystnad som ett friskintyg. Gränsen är satt högt med flit —
 * larmet ska gå för ett trasigt svep, inte för en långsam morgon.
 */
export const OPROVAT_TAK = 0.5;

export function svepetArTrasigt(status: Svepstatus): boolean {
  return status.provade > 0 && status.oprovad / status.provade > OPROVAT_TAK;
}
