/**
 * Flyttar en kö-kandidats kostnad till det publicerade löfte den dubblerar.
 *
 * VARFÖR. Kön ställer frågan «ska det här publiceras?», och för en dubblett är
 * svaret nej. Men ibland är kandidatens uträkning BÄTTRE än den som står på det
 * publicerade löftet, och då kastar ett rent nej bort det enda som var värt
 * något i posten. Det är inte hypotetiskt: av de 22 kandidater som delar minst
 * nittio procent av sina ord med ett publicerat löfte skiljer sig beloppen i
 * tre, och i ett av dem bär kandidaten 350 miljoner kronor medan det
 * publicerade står på noll.
 *
 * VAD SOM FLYTTAS. Beloppet, spannet, uträkningen och metodnoten — det läsaren
 * ser. Aldrig citatet, rubriken eller källan: det publicerade löftet är och
 * förblir sitt eget, och det är bara prislappen som byts.
 *
 * VAD SOM INTE FÅR HÄNDA. Ett belopp som byter period eller kostnadstyp under
 * tystnad är en annan siffra, inte en bättre. Byter de måste det stå utskrivet
 * i skälet, annars faller raden. Modulen avgör aldrig att den ena uträkningen
 * ÄR bättre — det är en läsning, och den gör en människa i Avgörandet.
 */
import { internaBeteckningar } from "./publicerad-text.ts";

export const UTRAKNING_MAX_TECKEN = 800;
export const SKAL_MIN_TECKEN = 25;

export interface Kostnad {
  type?: string | null;
  period?: string | null;
  msek_low?: number | null;
  msek_base?: number | null;
  msek_high?: number | null;
  basis?: string | null;
  calculation?: string | null;
  method_note?: string | null;
  [k: string]: unknown;
}

export interface Malpost {
  id: string;
  status?: string;
  title?: string;
  parties?: readonly string[];
  cost?: Kostnad | null;
  history?: { date: string; change: string; commit: string }[];
  [k: string]: unknown;
}

export interface Flyttrad {
  /** Kö-postens id — den som avvisas. */
  fran: string;
  /** Det publicerade löftets id — den som får kostnaden. */
  till: string;
  /** Kandidatens kostnad, som den såg ut när beslutet togs. */
  kostnad: Kostnad;
  /** Vad läsningen fann. Går i rättelseloggen. */
  skal: string;
}

export interface Provning { ok: boolean; fel: string[] }

/** Vad posten bidrar med till en total, över mandatperioden. */
export const mandatperioden = (c: Kostnad | null | undefined): number =>
  (c?.msek_base ?? 0) * (c?.period === "per_ar" ? 4 : 1);

export function provaFlytt(rad: Flyttrad, mal: Malpost | undefined): Provning {
  const fel: string[] = [];
  const namn = `${rad.fran} → ${rad.till}`;

  if (!mal) return { ok: false, fel: [`${namn}: ${rad.till} finns inte`] };
  if ((mal.status ?? "aktiv") !== "aktiv") {
    fel.push(`${namn}: ${rad.till} har status ${mal.status} — en indragen post publicerar ingenting`);
  }

  const ny = rad.kostnad;
  const bas = ny.msek_base;
  if (bas === null || bas === undefined) {
    fel.push(`${namn}: kandidaten har ingen kostnad att flytta`);
  }
  const low = ny.msek_low ?? bas ?? 0;
  const high = ny.msek_high ?? bas ?? 0;
  if (bas !== null && bas !== undefined && !(low <= bas && bas <= high)) {
    fel.push(`${namn}: spannet ${low}–${bas}–${high} är inte i ordning`);
  }

  const utrakning = (ny.calculation ?? "").trim();
  if (utrakning.length === 0) {
    fel.push(`${namn}: en flyttad kostnad utan uträkning är bara en siffra — det är uträkningen som är skälet att flytta`);
  }
  if (utrakning.length > UTRAKNING_MAX_TECKEN) {
    fel.push(`${namn}: uträkningen är ${utrakning.length} tecken, och schemat tar ${UTRAKNING_MAX_TECKEN}`);
  }

  // Uträkningen och metodnoten publiceras. En intern beteckning i dem är
  // samma fel som fällde trettiofem poster i kö-prissättningen.
  const interna = internaBeteckningar(ny as never, rad.till);
  if (interna.length > 0) {
    fel.push(`${namn}: publicerad text bär interna beteckningar — ${interna.join(", ")}`);
  }

  // Byter period eller kostnadstyp är det inte samma siffra längre, och då
  // ska bytet stå utskrivet. Annars ser läsaren ett tal röra sig utan att
  // något säger att enheten bytts under det.
  const gammal = mal.cost ?? {};
  const byten: string[] = [];
  if ((ny.period ?? gammal.period) !== gammal.period) byten.push(`period ${gammal.period} → ${ny.period}`);
  if ((ny.type ?? gammal.type) !== gammal.type) byten.push(`kostnadstyp ${gammal.type} → ${ny.type}`);
  if (byten.length > 0 && !/period|engång|per år|kostnadstyp|utgift|besparing|intäkt/iu.test(rad.skal)) {
    fel.push(
      `${namn}: flytten byter ${byten.join(" och ")}, och skälet säger inget om det. ` +
        "Ett belopp som byter enhet är en annan siffra, inte en bättre.",
    );
  }

  if (rad.skal.trim().length < SKAL_MIN_TECKEN) {
    fel.push(`${namn}: skälet är för kort — rättelseloggen ska säga vad läsningen fann`);
  }

  // En flytt som inte flyttar något är en rättelsenot om ingenting.
  if (
    mandatperioden(ny) === mandatperioden(gammal) &&
    (ny.calculation ?? "").trim() === (gammal.calculation ?? "").trim()
  ) {
    fel.push(`${namn}: kostnaden och uträkningen är redan desamma — det finns ingenting att flytta`);
  }

  return { ok: fel.length === 0, fel };
}

/** Hur mycket rikssumman rör sig av flytten, över mandatperioden. */
export const forandring = (rad: Flyttrad, mal: Malpost): number =>
  mandatperioden(rad.kostnad) - mandatperioden(mal.cost);

/** Målposten med den nya kostnaden och en historikpost som säger varifrån den kom. */
export function flytta<T extends Malpost>(mal: T, rad: Flyttrad, datum: string): T {
  const gammal = mal.cost ?? {};
  const ny = rad.kostnad;
  const enhet = (c: Kostnad) => (c.period === "per_ar" ? "miljoner kronor per år" : "miljoner kronor");
  const fore = gammal.msek_base ?? 0;
  const efter = ny.msek_base ?? 0;
  return {
    ...mal,
    cost: {
      ...gammal,
      type: ny.type ?? gammal.type,
      period: ny.period ?? gammal.period,
      msek_low: ny.msek_low ?? efter,
      msek_base: efter,
      msek_high: ny.msek_high ?? efter,
      basis: ny.basis ?? gammal.basis,
      calculation: (ny.calculation ?? "").trim(),
      method_note: (ny.method_note ?? "").trim() || gammal.method_note,
      // Ett ankare hör till det belopp som ersattes, inte till det nya.
      anchor_ids: [],
    },
    history: [
      ...(mal.history ?? []),
      {
        date: datum,
        commit: "0000000",
        change:
          (fore === efter
            ? `Uträkningen ersatt. Beloppet är oförändrat, ${efter.toLocaleString("sv-SE")} ${enhet(ny)}. `
            : `Beloppet ändrat från ${fore.toLocaleString("sv-SE")} till ${efter.toLocaleString("sv-SE")} ` +
              `${enhet(ny)}. `) +
          "Ett löfte med samma innebörd fanns i granskningskön och avvisades som en dubblett, men dess " +
          "uträkning var bättre grundad än den som stod här. Den är flyttad hit i stället för att kastas " +
          `med kö-posten. ${rad.skal.trim()}`,
      },
    ],
  };
}
