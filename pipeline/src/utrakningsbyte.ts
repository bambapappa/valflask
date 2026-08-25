/**
 * Byter uträkning på redan publicerade löften, utan att röra beloppet.
 *
 * Systern till `rubrikbyte` och `citatbyte`, för det tredje fältet som möter
 * läsaren. Uträkningen är vår text om hur beloppet kommit till — den är alltså
 * redaktionell som rubriken och får rättas, till skillnad från citatet. Men den
 * är också det enda skäl läsaren har att tro på siffran, så bytet är en
 * **rättelse** och skrivs som en.
 *
 * VARFÖR VERKTYGET BEHÖVS. `findAmountMismatches` letar efter löften där
 * beloppsfältet och uträkningen säger olika saker. När den hittar ett äkta
 * sådant fall är felet nästan alltid i TEXTEN och inte i talet: en tidigare
 * version av resonemanget har blivit kvar sist i fältet och motsäger de tal som
 * faktiskt publicerats. Att då ändra beloppet vore att rätta åt fel håll.
 *
 * DÄRFÖR RÖR VERKTYGET ALDRIG BELOPPET. Ett byte som också ville flytta talet
 * är ett annat beslut med andra spärrar — det gör `ankarsattning` eller
 * `regelnollning`, som mäter vad summorna gör. Här står låg, bas och hög stilla
 * per definition, och provet nedan låser fast det.
 *
 * VAD SOM PRÖVAS. Att posten finns och är aktiv, att texten är ny, inte tom och
 * inte över takets längd, att den inte bär en intern beteckning — och det som
 * är hela poängen: att den nya uträkningen NAMNGER det publicerade basbeloppet.
 * En uträkning som inte nämner sitt eget tal är just felet vi rättar.
 */
import { statedBaseMsek } from "./quality-scan.ts";
import { INTERN_BETECKNING } from "./publicerad-text.ts";

/** Vad `promises.schema.json` tar emot i `cost.calculation`. */
export const UTRAKNING_MAX_TECKEN = 800;
export const SKAL_MIN_TECKEN = 40;

export interface Utrakningsrad {
  id: string;
  /** Den nya uträkningen, som den ska möta läsaren. */
  utrakning: string;
  /** Vad läsningen fann. Går i rättelseloggen, aldrig i uträkningen. */
  skal: string;
}

export interface Utrakningspost {
  id: string;
  status?: string;
  title?: string | null;
  cost: {
    msek_low?: number | null;
    msek_base?: number | null;
    msek_high?: number | null;
    calculation?: string | null;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export function provaUtrakningsrad(
  rad: Utrakningsrad,
  loften: ReadonlyMap<string, Utrakningspost>,
): { ok: boolean; fel: string[] } {
  const fel: string[] = [];
  const p = loften.get(rad.id);
  if (!p) return { ok: false, fel: [`${rad.id} finns inte i promises.json`] };
  if ((p.status ?? "aktiv") !== "aktiv") fel.push(`${rad.id} har status ${p.status}`);
  if (rad.skal.trim().length < SKAL_MIN_TECKEN) {
    fel.push(
      `${rad.id}: skälet är ${rad.skal.trim().length} tecken, minst ${SKAL_MIN_TECKEN} krävs. ` +
        "Rättelseloggen ska säga vad läsningen fann.",
    );
  }

  const ny = rad.utrakning.trim();
  if (ny === "") fel.push(`${rad.id}: den nya uträkningen är tom, och den visas publikt`);
  if (ny.length > UTRAKNING_MAX_TECKEN) {
    fel.push(`${rad.id}: uträkningen är ${ny.length} tecken, taket är ${UTRAKNING_MAX_TECKEN}`);
  }
  if (INTERN_BETECKNING.test(ny)) {
    fel.push(`${rad.id}: uträkningen bär en intern beteckning — den möter läsaren. Skriv hänvisningen i ord.`);
  }
  if (INTERN_BETECKNING.test(rad.skal)) {
    fel.push(`${rad.id}: skälet bär en intern beteckning. Skriv vad som faktiskt sker i stället.`);
  }
  if (ny === (p.cost.calculation ?? "").trim()) fel.push(`${rad.id}: uträkningen är oförändrad`);

  // HELA POÄNGEN: den nya texten ska leda fram till det tal som står publicerat.
  // Görs inte det är motsägelsen kvar, bara omformulerad.
  const bas = p.cost.msek_base ?? 0;
  if (ny !== "" && bas !== 0) {
    const angivet = statedBaseMsek(ny);
    if (angivet === null) {
      fel.push(
        `${rad.id}: den nya uträkningen namnger inget basbelopp. Skriv ut talet ${bas} ` +
          "så att läsaren kan följa stegen fram till det.",
      );
    } else if (angivet !== bas) {
      fel.push(
        `${rad.id}: uträkningen leder till ${angivet} men det publicerade basbeloppet är ${bas}. ` +
          "Verktyget rör aldrig talet — skriv texten så att den stämmer med det, " +
          "eller flytta beloppet med det verktyg som mäter vad summorna gör.",
      );
    }
  }

  return { ok: fel.length === 0, fel };
}

/** Löftet efter bytet. Beloppet står stilla — se modulens huvud. */
export function tillampa(lofte: Utrakningspost, rad: Utrakningsrad): Utrakningspost {
  return { ...lofte, cost: { ...lofte.cost, calculation: rad.utrakning.trim() } };
}
