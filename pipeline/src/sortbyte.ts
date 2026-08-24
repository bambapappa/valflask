/**
 * Sortbytet: `loftestyp` kan vara fel medan beloppet är rätt.
 *
 * VARFÖR DE ÄR TVÅ SAKER. Sorten sattes maskinellt 2026-08-22 ur citat OCH
 * prissättning, så ett nollat löfte blev inriktning. Men en regeländring pekar
 * ut en bestämd åtgärd — den är alltså en reform — och dess direkta statliga
 * kostnad är ändå noll enligt kostnadsreglerna. De två sakerna sattes ihop, och
 * tolv reformer stod därför som inriktningar.
 *
 * Det spelar roll bortom klassningen: sorten styr sedan 2026-08-22 även
 * kopplingssteget, så en felklassad reform står utanför prövningen mot vad
 * partiet faktiskt gjort i riksdagen.
 *
 * **Beloppet rörs aldrig här.** Är beloppet fel är det `regelnollning` eller
 * `ankarsattning` som gäller.
 */

export const SORTER = ["reform", "inriktning"] as const;
export type Sort = (typeof SORTER)[number];

export const UTRAKNING_MIN_TECKEN = 60;
export const SKAL_MIN_TECKEN = 40;
const INTERN_BETECKNING = /\b[kp]-20\d\d-\d{4}\b/u;

export interface Sortlofte {
  id: string;
  title?: string;
  status?: string;
  loftestyp?: string;
  parties?: readonly string[];
  /**
   * Kostnaden spreadas vidare i sin helhet, så indexsignaturen är inte slarv:
   * `tillampa` byter bara `calculation` och måste lämna låg, hög, period,
   * kostnadstyp och ankare precis som de var.
   */
  cost?: ({ msek_base?: number | null; calculation?: string | null } & Record<string, unknown>) | null;
  history?: { date: string; change: string; commit: string }[];
  [k: string]: unknown;
}

export interface Sortrad {
  id: string;
  sort: string;
  /** Ny uträkning som säger vilken regel beloppet följer av. */
  utrakning: string;
  /** Vad läsningen fann. Går i rättelseloggen. */
  skal: string;
}

export interface Sortprovning { ok: boolean; fel: string[] }

export function provaSortrad(lofte: Sortlofte | undefined, rad: Sortrad): Sortprovning {
  const fel: string[] = [];
  if (!lofte) return { ok: false, fel: [`${rad.id} finns inte`] };
  if ((lofte.status ?? "aktiv") !== "aktiv") fel.push(`${rad.id} har status ${lofte.status}`);
  if (!SORTER.includes(rad.sort as Sort)) fel.push(`${rad.id}: sorten måste vara reform eller inriktning`);
  if (rad.sort === lofte.loftestyp) fel.push(`${rad.id} är redan ${rad.sort}`);
  // Hela skillnaden mellan sorterna: en inriktning har ingen åtgärd att
  // prissätta. `loftestyp.test.ts` vaktar samma sak mot beståndet.
  if (rad.sort === "inriktning" && (lofte.cost?.msek_base ?? 0) !== 0) {
    fel.push(`${rad.id}: ett inriktningslöfte bär aldrig ett basbelopp, och posten står på ${lofte.cost?.msek_base}`);
  }
  if (rad.utrakning.trim().length < UTRAKNING_MIN_TECKEN) {
    fel.push(`${rad.id}: den nya uträkningen är för kort för att förklara sorten`);
  }
  if (INTERN_BETECKNING.test(rad.utrakning)) {
    fel.push(`${rad.id}: uträkningen bär en intern beteckning — den möter läsaren`);
  }
  if (rad.skal.trim().length < SKAL_MIN_TECKEN) {
    fel.push(`${rad.id}: skälet är för kort — rättelseloggen ska säga vad läsningen fann`);
  }
  return { ok: fel.length === 0, fel };
}

/** Posten med ny sort och ny uträkning. Beloppet står stilla. */
export function tillampa<T extends Sortlofte>(lofte: T, rad: Sortrad, datum: string): T {
  return {
    ...lofte,
    loftestyp: rad.sort,
    cost: { ...(lofte.cost ?? {}), calculation: rad.utrakning },
    history: [
      ...(lofte.history ?? []),
      { date: datum, commit: "0000000",
        change:
          `Sorten ändrad från ${lofte.loftestyp} till ${rad.sort}. Beloppet är oförändrat — det som var ` +
          "fel var klassningen, inte siffran. Sorten sattes maskinellt ur citat och prissättning, och ett " +
          "nollat löfte blev därför inriktning även när citatet pekar ut en bestämd åtgärd. Uträkningen " +
          "skriver nu ut vilken regel nollan följer av." },
    ],
  };
}
