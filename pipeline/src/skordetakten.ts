/**
 * skordetakten.ts — en höjd skördetakt har en klocka.
 *
 * BAKGRUNDEN (2026-08-17). Sju partiers politikavdelningar kopplades in samma
 * dag och 757 sidor låg olästa. För att hämta in det höjdes takten från tre
 * körningar om dygnet med 20 sidor till sex med 45 — en ikappkörning, inte ett
 * nytt normalläge.
 *
 * Anteckningen om att sänka tillbaka skrevs först på anslagstavlan. Det var
 * inte nog, av samma skäl som ordreglerna i CLAUDE.md bär: **en regel utan
 * grind är en påminnelse, och påminnelser åldras.** Repot har redan bevisat
 * det två gånger — en språkregel stod skriven i över en månad medan ordet
 * levde kvar på ett trettiotal ställen, och ett tidigare beslut om symmetriska
 * källistor skrevs ner och byggdes aldrig. Ett undantag utan bortre gräns är
 * ingen interimlösning; det är ett nytt normalläge med bättre ordval.
 *
 * REGELN. Takten får ligga över normalläget bara så länge `data/skordetakten.json`
 * deklarerar höjningen OCH dagens datum inte passerat dess `till_och_med`.
 * Grinden faller annars — och den faller åt båda hållen:
 *
 *   - Höjs takten UTAN att filen säger det, faller den direkt. En tyst
 *     höjning är precis hur den förra snedfördelningen kunde växa.
 *   - Lever höjningen längre än sitt datum, faller den. Vill någon ha mer
 *     tid ändras `till_och_med` i filen, och då står förlängningen i
 *     historiken med ett skäl bredvid sig i stället för att ske av glömska.
 *
 * Samma form som arkivväntans fjortondagarsgräns i `arkivvantan.ts`.
 */

export interface Takt {
  korningar_per_dygn: number;
  sidor_per_korning: number;
}

export interface Hojning extends Takt {
  sedan: string;
  till_och_med: string;
  skal: string;
  sank_nar?: string;
}

export interface Skordetakten {
  normal: Takt;
  hojd?: Hojning | null;
}

export type Utfall =
  | "normal"
  | "hojd_inom_fristen"
  | "hojd_utan_deklaration"
  | "fristen_har_gatt_ut"
  | "deklarationen_stammer_inte";

export interface Besked {
  godtas: boolean;
  utfall: Utfall;
  /** En mening som säger vad som är fel och vad som ska göras. */
  forklaring: string;
  /** Dygn kvar av fristen. Negativt när den gått ut, null när takten är normal. */
  dygnKvar: number | null;
}

/**
 * Antal körningar per dygn ur en cron-rad.
 *
 * Bara timfältet räknas — takten är körningar per dygn, och alla våra
 * scheman kör varje dag. Formerna som stöds är de tre som förekommer:
 * en lista (`0,4,8`), ett intervall (`* / 4`) och ett enskilt värde (`3`).
 *
 * Går raden inte att läsa svarar funktionen null, och grinden faller på det.
 * En oläsbar cron ska aldrig tolkas som «det är nog lugnt» — det är precis
 * den sortens tyst antagande som gör en grind meningslös.
 */
export function korningarPerDygn(cron: string): number | null {
  const falt = cron.trim().split(/\s+/u);
  if (falt.length < 5) return null;
  const timmar = falt[1]!;

  if (timmar === "*") return 24;

  const intervall = /^\*\/(\d+)$/u.exec(timmar);
  if (intervall) {
    const steg = Number(intervall[1]);
    return steg > 0 && steg <= 24 ? Math.ceil(24 / steg) : null;
  }

  const delar = timmar.split(",");
  const varden = delar.map((d) => Number(d));
  if (varden.some((v) => !Number.isInteger(v) || v < 0 || v > 23)) return null;
  return new Set(varden).size;
}

/** Cron-raden ur ett workflow. Null när ingen finns. */
export function cronUrWorkflow(yaml: string): string | null {
  const m = /^\s*-\s*cron:\s*"([^"]+)"/mu.exec(yaml);
  return m ? m[1]! : null;
}

/** max_articles_per_run ur sources.yaml. Null när den inte går att läsa. */
export function sidorUrSources(yaml: string): number | null {
  const m = /^\s*max_articles_per_run:\s*(\d+)\s*$/mu.exec(yaml);
  return m ? Number(m[1]) : null;
}

function dygnMellan(fran: string, till: string): number {
  const a = Date.parse(`${fran.slice(0, 10)}T00:00:00.000Z`);
  const b = Date.parse(`${till.slice(0, 10)}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

const samma = (a: Takt, b: Takt): boolean =>
  a.korningar_per_dygn === b.korningar_per_dygn && a.sidor_per_korning === b.sidor_per_korning;

/**
 * Prövar den faktiska takten mot deklarationen.
 *
 * `nu` skickas in i stället för att läsas ur klockan — annars går provet inte
 * att skriva, och en grind som bara kan prövas genom att vänta till i övermorgon
 * är inte prövad alls.
 */
export function provaTakten(fil: Skordetakten, faktisk: Takt, nu: string): Besked {
  if (samma(faktisk, fil.normal)) {
    return {
      godtas: true,
      utfall: "normal",
      forklaring: "Takten är normalläget.",
      dygnKvar: null,
    };
  }

  const hojd = fil.hojd;
  if (!hojd) {
    return {
      godtas: false,
      utfall: "hojd_utan_deklaration",
      forklaring:
        `Takten är ${faktisk.korningar_per_dygn} körningar à ${faktisk.sidor_per_korning} sidor, ` +
        `men normalläget är ${fil.normal.korningar_per_dygn} à ${fil.normal.sidor_per_korning} och ` +
        "data/skordetakten.json deklarerar ingen höjning. Antingen sänks takten tillbaka, " +
        "eller så skrivs höjningen in i filen med skäl och ett till_och_med-datum.",
      dygnKvar: null,
    };
  }

  if (!samma(faktisk, hojd)) {
    return {
      godtas: false,
      utfall: "deklarationen_stammer_inte",
      forklaring:
        `Filen deklarerar ${hojd.korningar_per_dygn} körningar à ${hojd.sidor_per_korning} sidor, ` +
        `men takten är ${faktisk.korningar_per_dygn} à ${faktisk.sidor_per_korning}. ` +
        "En deklaration som inte stämmer vaktar ingenting — rätta filen eller takten.",
      dygnKvar: dygnMellan(nu, hojd.till_och_med),
    };
  }

  const kvar = dygnMellan(nu, hojd.till_och_med);
  if (kvar < 0) {
    return {
      godtas: false,
      utfall: "fristen_har_gatt_ut",
      forklaring:
        `Den höjda takten gällde till och med ${hojd.till_och_med} och det var ${-kvar} dygn sedan. ` +
        "Sänk tillbaka till normalläget på BÅDA ställena — cron i .github/workflows/pipeline.yml " +
        "och max_articles_per_run i data/sources.yaml — och ta bort hojd-blocket ur " +
        "data/skordetakten.json. Behövs mer tid: flytta fram till_och_med och skriv varför. " +
        "Det ska synas i historiken att någon valde det.",
      dygnKvar: kvar,
    };
  }

  return {
    godtas: true,
    utfall: "hojd_inom_fristen",
    forklaring: `Höjd takt, ${kvar} dygn kvar av fristen (till och med ${hojd.till_och_med}).`,
    dygnKvar: kvar,
  };
}
