/**
 * Återställer ett tillbakadraget löfte.
 *
 * VARFÖR ETT VERKTYG. Att dra in ett löfte har ett verktyg med spärrar; att
 * ångra det hade inget. Den 23–24 augusti 2026 återställdes fem poster för hand
 * med JSON-redigering, utan att något prövade att beloppet var det gamla eller
 * att skälet var skrivet. Fyra av dem fanns bara därför att ett tidigare beslut
 * visade sig fel — och just då, när man rättar ett fel, är risken störst att
 * göra ett nytt.
 *
 * VAD SOM PRÖVAS. Att posten finns och FAKTISKT är tillbakadragen, att skälet
 * är skrivet, och — det som gör verktyget värt att ha — att det belopp som
 * återförs är det posten bar innan den drogs in. Verktyget hittar aldrig på en
 * ny siffra; det lämnar tillbaka den gamla. Ska beloppet ändras är det
 * `regelnollning` eller `ankarsattning` som gäller, efteråt och synligt.
 *
 * Sorten följer med: ett inriktningslöfte bär aldrig ett basbelopp, så en post
 * som återförs med ett belopp blir en reform.
 */

export interface Aterstallningslofte {
  id: string;
  title?: string;
  status?: string;
  loftestyp?: string;
  cost?: Record<string, unknown> | null;
  history?: { date: string; change: string; commit: string }[];
  [k: string]: unknown;
}

export interface Aterstallningsrad {
  id: string;
  /** Vad läsningen fann. Går i rättelseloggen. */
  skal: string;
}

export const SKAL_MIN_TECKEN = 40;

export interface Aterstallningsprovning { ok: boolean; fel: string[] }

export function provaAterstallning(
  nu: Aterstallningslofte | undefined,
  fore: Aterstallningslofte | undefined,
  rad: Aterstallningsrad,
): Aterstallningsprovning {
  const fel: string[] = [];
  if (!nu) return { ok: false, fel: [`${rad.id} finns inte i promises.json`] };
  if (!fore) {
    return { ok: false, fel: [`${rad.id} finns inte i den revision beloppet ska hämtas ur`] };
  }
  if ((nu.status ?? "aktiv") === "aktiv") {
    fel.push(`${rad.id} är inte tillbakadragen — det finns ingenting att återställa`);
  }
  if ((fore.status ?? "aktiv") !== "aktiv") {
    fel.push(`${rad.id} var tillbakadragen redan i den revision beloppet hämtas ur`);
  }
  if (rad.skal.trim().length < SKAL_MIN_TECKEN) {
    fel.push(`${rad.id}: skälet är för kort — rättelseloggen ska säga varför indragningen var fel`);
  }
  return { ok: fel.length === 0, fel };
}

/** Vad posten bidrar med till en total, över mandatperioden. */
export const mandatperioden = (p: Aterstallningslofte): number => {
  const c = (p.cost ?? {}) as { msek_base?: number | null; period?: string | null };
  return (c.msek_base ?? 0) * (c.period === "per_ar" ? 4 : 1);
};

/**
 * Posten återställd: status aktiv, kostnaden som den var, sorten justerad.
 *
 * ALLT ANNAT LÄMNAS. Rubrik, citat, källa och grupp är oförändrade sedan
 * indragningen — de rördes inte av den, och ska inte röras av att den ångras.
 */
export function aterstall<T extends Aterstallningslofte>(
  nu: T, fore: Aterstallningslofte, rad: Aterstallningsrad, datum: string,
): T {
  const kostnad = { ...(fore.cost ?? {}) } as Record<string, unknown>;
  const bas = (kostnad.msek_base as number | null | undefined) ?? 0;
  const sort = bas !== 0 && nu.loftestyp === "inriktning" ? "reform" : nu.loftestyp;
  return {
    ...nu,
    status: "aktiv",
    ...(sort ? { loftestyp: sort } : {}),
    cost: kostnad,
    history: [
      ...(nu.history ?? []),
      {
        date: datum,
        commit: "0000000",
        change:
          `Löftet är återställt. Det drogs tillbaka tidigare, och indragningen var fel: ${rad.skal} ` +
          `Beloppet är det posten bar innan den drogs in — ${bas.toLocaleString("sv-SE")} — inte en ny ` +
          "siffra. Rubrik, citat och källa är oförändrade; de rördes inte av indragningen." +
          (sort !== nu.loftestyp ? " Sorten återgår till reform, eftersom ett inriktningslöfte aldrig bär ett basbelopp." : ""),
      },
    ],
  };
}
