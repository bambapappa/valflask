/**
 * Nollar publicerade belopp som en redan fastställd kostnadsregel säger ska
 * vara noll.
 *
 * Det här är inte ett nytt omdöme. `CLAUDE.md` och `A5-cost.md` bär reglerna,
 * fastställda genom mänskligt beslut, och två av dem lyder:
 *
 *   · **Lagar, förbud, avregleringar och marknadsåtgärder → 0.** «Löftet hålls
 *     av lagändringen, vars direkta kostnad är försumbar.» Följderna prissätts
 *     inte — det står utskrivet i regeln.
 *   · **Utrednings- och planlöften → 0.** «Är löftet att tillsätta en utredning
 *     eller ta fram en handlingsplan prissätts utredningen (försumbar).»
 *
 * A2 svepte beståndet efter den andra regeln 2026-08-13 och fällde fyra löften
 * av 690. Beståndet är 2 713 i dag, och ingenting mätte ledet däremellan. Det
 * som behövs är alltså inget beslut utan ett svep — och ett verktyg som gör
 * svepet spårbart i stället för handskrivet.
 *
 * **Verktyget nollar aldrig ett löfte som lovar något utöver regeln.** Vilket
 * som gör det är en läsning, och den ska vara gjord innan raden skrivs. Det
 * skriptet gör är att pröva det som skrivits, mäta vad summorna gör, och skriva
 * historik och rättelsepost så att ingenting ändras tyst.
 */

/** Reglerna ett belopp får nollas med. Fler får inte hittas på här. */
export const REGLER = {
  utredning:
    "Utrednings- och planlöften prissätts till noll: är löftet att utreda, se över " +
    "eller ta fram en plan är det utredningen som prissätts, inte den politik den " +
    "kan leda till.",
  lagandring:
    "Lagar, förbud, avregleringar och marknadsåtgärder prissätts till noll: löftet " +
    "hålls av lagändringen, vars direkta kostnad är försumbar. Beloppet avser " +
    "åtgärden, inte dess följder.",
} as const;

export type Regel = keyof typeof REGLER;

export interface Nollrad {
  id: string;
  regel: Regel;
  /** Den nya uträkningen. Ska säga varför nollan följer av regeln. */
  utrakning: string;
  /** Vad läsningen fann. Går i rättelseloggen, aldrig i uträkningen. */
  skal: string;
  /**
   * Nytt spann när bara EN DEL av löftet faller under regeln.
   *
   * Ett löfte som buntar en straffskärpning med en fotboja och ett höjt
   * statsbidrag ska inte nollas — bara straffdelen ska bort. Utan det här
   * ledet vore enda valen att nolla hela posten, vilket vore fel, eller att
   * skriva om den för hand, vilket är just det verktyget finns för att slippa.
   *
   * Måste alltid vara LÄGRE än det nuvarande basbeloppet: verktyget tar bort
   * en del av ett belopp, det sätter aldrig ett nytt.
   */
  spann?: { low: number; base: number; high: number };
}

export const SKAL_MIN_TECKEN = 40;

interface Kostnad {
  msek_low?: number | null;
  msek_base?: number | null;
  msek_high?: number | null;
  period?: string | null;
  calculation?: string | null;
  method_note?: string | null;
}

export interface Lofte {
  id: string;
  title?: string;
  quote?: string;
  status?: string;
  parties?: readonly string[];
  cost: Kostnad;
  history?: { date: string; change: string; commit: string }[];
}

export interface Nollprovning {
  ok: boolean;
  fel: string[];
}

export function provaNollrad(lofte: Lofte | undefined, rad: Nollrad): Nollprovning {
  const fel: string[] = [];
  if (!lofte) return { ok: false, fel: [`${rad.id} finns inte i promises.json`] };
  if (lofte.status === "tillbakadragen") {
    fel.push(`${rad.id} är redan tillbakadragen — en tillbakadragen post räknas inte i någon summa`);
  }
  if (!(rad.regel in REGLER)) {
    fel.push(`${rad.id}: regeln måste vara en av ${Object.keys(REGLER).join(", ")}`);
  }
  const bas = lofte.cost.msek_base ?? 0;
  if (bas === 0) {
    fel.push(`${rad.id} står redan på noll — det finns ingenting att nolla`);
  }
  if (rad.spann) {
    const { low, base, high } = rad.spann;
    if (!(low <= base && base <= high)) {
      fel.push(`${rad.id}: spannet ${low}–${base}–${high} är inte i ordning`);
    }
    if (base >= bas) {
      fel.push(
        `${rad.id}: det nya basbeloppet ${base} är inte lägre än det nuvarande ${bas}. ` +
          "Verktyget tar bort en del av ett belopp, det sätter aldrig ett nytt.",
      );
    }
    if (base < 0 || low < 0) fel.push(`${rad.id}: ett negativt belopp är inte en delrättning`);
  }
  if (rad.skal.trim().length < SKAL_MIN_TECKEN) {
    fel.push(
      `${rad.id}: skälet är för kort. Rättelseloggen ska säga vad läsningen fann, ` +
        "inte bara att en regel finns.",
    );
  }
  if (rad.utrakning.trim() === "") {
    fel.push(`${rad.id}: den nya uträkningen saknas — nollan ska gå att följa som alla andra belopp`);
  }
  // Uträkningen ska namnge sin regel. Annars går nollan inte att skilja från
  // en nolla som satts av ett haveri, och det var C6:s fel.
  const namnger = /prissätts till noll|hålls av (?:en )?lagändring|utredning|handlingsplan|försumbar/iu;
  if (!namnger.test(rad.utrakning)) {
    fel.push(`${rad.id}: uträkningen säger inte vilken regel nollan vilar på`);
  }
  // En intern beteckning i publicerad text är samma fel som publicerad-text spärrar.
  const intern = /\b[kp]-20\d\d-\d{4}\b|\bg-p-20\d\d-\d{4}\b/u.exec(rad.utrakning);
  if (intern) {
    fel.push(`${rad.id}: uträkningen bär den interna beteckningen ${intern[0]} — skriv ut saken i ord`);
  }
  return { ok: fel.length === 0, fel };
}

/** Vad mandatperioden tappar när posten nollas. */
export function paverkan(lofte: Lofte): number {
  const bas = lofte.cost.msek_base ?? 0;
  return lofte.cost.period === "per_ar" ? bas * 4 : bas;
}

/** Posten med beloppet nollat och uträkningen omskriven. */
export function nolla<T extends Lofte>(lofte: T, rad: Nollrad, datum: string): T {
  const fore = lofte.cost.msek_base ?? 0;
  const enhet = lofte.cost.period === "per_ar" ? "miljoner kronor per år" : "miljoner kronor";
  const nytt = rad.spann ?? { low: 0, base: 0, high: 0 };
  return {
    ...lofte,
    cost: {
      ...lofte.cost,
      msek_low: nytt.low,
      msek_base: nytt.base,
      msek_high: nytt.high,
      calculation: rad.utrakning.trim(),
    },
    history: [
      ...(lofte.history ?? []),
      {
        date: datum,
        change:
          (rad.spann
            ? `Beloppet sänkt till ${nytt.base.toLocaleString("sv-SE")} ${enhet}, tidigare ` +
              `${fore.toLocaleString("sv-SE")}. Den del av löftet som faller under regeln är borttagen; ` +
              "resten står kvar. "
            : `Beloppet nollat, tidigare ${fore.toLocaleString("sv-SE")} ${enhet}. `) +
          REGLER[rad.regel] +
          " Regeln är fastställd sedan tidigare; posten hade undgått den.",
        commit: "0000000",
      },
    ],
  };
}

export function rattelsePost(
  rader: { lofte: Lofte; rad: Nollrad }[],
  datum: string,
  summor: { partier: Map<string, number>; riket: number },
): { date: string; affects: string; what: string; why: string; commit: string } {
  const ider = [...new Set(rader.map((r) => r.lofte.id))].sort();
  const partitext = [...summor.partier.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([p, mkr]) => `${p.toUpperCase()} minskar med ${mkr.toLocaleString("sv-SE")} miljoner kronor`)
    .join(", ");
  const perRegel = new Map<Regel, number>();
  for (const r of rader) perRegel.set(r.rad.regel, (perRegel.get(r.rad.regel) ?? 0) + 1);
  const regeltext = [...perRegel.entries()]
    .map(([r, n]) => `${n} enligt regeln att ${r === "utredning" ? "utredningar och planer" : "lagar och förbud"} prissätts till noll`)
    .join(", ");

  const delrattade = rader.filter((r) => r.rad.spann).length;
  const nollade = rader.length - delrattade;
  const vadtext =
    delrattade === 0
      ? `${nollade} löften nollade`
      : nollade === 0
        ? `${delrattade} löften delrättade`
        : `${nollade} löften nollade och ${delrattade} delrättat`;

  return {
    date: datum,
    affects: `${ider.join(", ")} — ${vadtext}`,
    what:
      `${rader.length} löften stod på ett belopp som kostnadsreglerna säger ska vara noll: ${regeltext}. ` +
      (delrattade > 0
        ? `${nollade > 0 ? `${nollade} är nollade` : "Beloppen är sänkta"}, och ${delrattade} ` +
          "buntar flera åtaganden — där är bara den del som faller under regeln borttagen, resten står kvar. "
        : "Beloppen är nollade. ") +
      `Uträkningarna skriver ut vilken regel som gäller. ` +
      `${partitext ? `${partitext}. ` : ""}` +
      `Summan för alla partier minskar med ${summor.riket.toLocaleString("sv-SE")} miljoner kronor för mandatperioden.`,
    why:
      "Reglerna är fastställda sedan tidigare och står i projektets metodbeskrivning: ett löfte om " +
      "att utreda något prissätts till utredningen och inte till den politik den kan leda till, och " +
      "ett löfte som hålls av en lagändring prissätts till åtgärden och inte till dess följder. " +
      "Reglerna tillämpades senast på hela beståndet i augusti, när det var en fjärdedel så stort. " +
      "Sedan dess har nya löften tillkommit utan att någon kontroll mätte ledet, och de här posterna " +
      "hade undgått regeln. Ingen bedömning av politiken har ändrats — bara vilken regel som gäller " +
      "för dess prislapp.",
    commit: "0000000",
  };
}
