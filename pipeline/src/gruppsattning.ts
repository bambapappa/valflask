/**
 * Grupper: samma politik hos olika partier räknas en gång.
 *
 * VAD EN GRUPP GÖR. `dedupeByGroup` i sajtens `aggregates.ts` låter gruppens
 * största post bära summan; de övriga räknas inte in i någon total. Rikssumman
 * SJUNKER därför när en grupp bildas. Handlingsvågen fäller däremot en dom per
 * löfte, så varje parti svarar fortfarande för sitt eget.
 *
 * Det är alltså inte en sammanslagning: alla löften står kvar och syns för
 * läsaren med sina egna belopp. Det som ändras är bara att samma politik inte
 * räknas flera gånger i en total.
 *
 * **Modulen avgör aldrig att två löften lovar samma sak.** Det är en läsning,
 * och den gör en människa. Det modulen gör är att pröva det som skrivits.
 */

export interface Grupplofte {
  id: string;
  title?: string;
  status?: string;
  group_id?: string | null;
  parties?: readonly string[];
  cost?: { msek_base?: number | null; period?: string | null } | null;
  history?: { date: string; change: string; commit: string }[];
  [k: string]: unknown;
}

export interface Grupprad {
  /** Gruppens id: `g-` följt av gemener, siffror och bindestreck. */
  grupp: string;
  ids: string[];
  /** Vad läsningen fann. Går i rättelseloggen. */
  skal: string;
}

export const GRUPPID = /^g-[a-z0-9-]+$/u;
export const SKAL_MIN_TECKEN = 40;

/** Vad posten bidrar med till en total, över mandatperioden. */
export const mandatperioden = (p: Grupplofte): number =>
  (p.cost?.msek_base ?? 0) * (p.cost?.period === "per_ar" ? 4 : 1);

export interface Gruppprovning { ok: boolean; fel: string[] }

/**
 * Prövar en grupprad mot allt som går att pröva utan att läsa.
 *
 * Det som INTE prövas är det enda som avgör om gruppen är riktig: om löftena
 * verkligen lovar samma sak.
 */
export function provaGrupprad(
  rad: Grupprad,
  loften: ReadonlyMap<string, Grupplofte>,
): Gruppprovning {
  const fel: string[] = [];
  if (!GRUPPID.test(rad.grupp)) {
    fel.push(`${rad.grupp}: grupp-id ska vara g- följt av gemener, siffror och bindestreck`);
  }
  // En grupp med en enda post är ingen grupp — den säger bara att posten är
  // ensam, och `dedupeByGroup` gör då ingenting.
  if (rad.ids.length < 2) fel.push(`${rad.grupp}: en grupp med färre än två medlemmar är ingen grupp`);
  if (rad.skal.trim().length < SKAL_MIN_TECKEN) {
    fel.push(`${rad.grupp}: skälet är för kort — rättelseloggen ska säga vad läsningen fann`);
  }
  if (new Set(rad.ids).size !== rad.ids.length) fel.push(`${rad.grupp}: samma id står två gånger`);

  for (const id of rad.ids) {
    const p = loften.get(id);
    if (!p) { fel.push(`${rad.grupp}: ${id} finns inte`); continue; }
    if ((p.status ?? "aktiv") !== "aktiv") fel.push(`${rad.grupp}: ${id} har status ${p.status}`);
    // Att flytta ett löfte mellan grupper ändrar två summor samtidigt och ska
    // vara ett medvetet beslut, inte en biverkan.
    if (p.group_id && p.group_id !== rad.grupp) {
      fel.push(`${rad.grupp}: ${id} sitter redan i gruppen ${p.group_id} — flytta den medvetet eller lämna den`);
    }
  }
  return { ok: fel.length === 0, fel };
}

/** Hur mycket rikssumman sjunker när gruppen bildas. */
export function sankning(medlemmar: readonly Grupplofte[]): number {
  if (medlemmar.length < 2) return 0;
  const varden = medlemmar.map(mandatperioden);
  return varden.reduce((a, b) => a + b, 0) - Math.max(...varden);
}

/**
 * Hur mycket rikssumman sjunker av just DEN HÄR raden.
 *
 * `sankning()` svarar på vad en färdig grupp döljer, och det är rätt svar bara
 * när gruppen bildas från grunden. Utökas en grupp som redan finns är en del av
 * den sänkningen redan tagen: står tre löften i gruppen sedan tidigare räknas
 * två av dem inte redan i dag, och raden får inte ta åt sig äran för det.
 *
 * Skillnaden är inte kosmetisk. Talet går rakt in i rättelsenotens mening om
 * hur mycket totalen sjunker — det är ett publicerat påstående om vad
 * ändringen gjorde.
 */
export function sankningsdelta(rad: Grupprad, alla: readonly Grupplofte[]): number {
  const aktiv = (p: Grupplofte) => (p.status ?? "aktiv") === "aktiv";
  const iGruppen = alla.filter((p) => p.group_id === rad.grupp && aktiv(p));
  const nya = alla.filter((p) => rad.ids.includes(p.id) && p.group_id !== rad.grupp && aktiv(p));
  const efter = [...iGruppen, ...nya];
  return sankning(efter) - sankning(iGruppen);
}

/** Posten med sitt group_id och en historikpost som säger vad gruppen gör. */
export function tillampa<T extends Grupplofte>(
  lofte: T, rad: Grupprad, medlemmar: readonly Grupplofte[], datum: string,
): T {
  const storst = Math.max(...medlemmar.map(mandatperioden));
  const barSumman = mandatperioden(lofte) === storst;
  return {
    ...lofte,
    group_id: rad.grupp,
    history: [
      ...(lofte.history ?? []),
      { date: datum, commit: "0000000",
        change:
          `Löftet ingår nu i en grupp med ${medlemmar.length - 1} annat eller andra löften som lovar ` +
          "samma sak. Fläskvågen räknar gruppen en gång, och gruppens största post bär summan — " +
          (barSumman
            ? "den här posten är den största och bär den."
            : "den här posten räknas därför inte in i totalen, men står kvar med sitt eget belopp på sin sida.") +
          " Handlingsvågen fäller fortfarande en dom per löfte, så partiet svarar för sitt eget." },
    ],
  };
}
