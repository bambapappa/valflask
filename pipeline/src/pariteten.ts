/**
 * Paritetssvepet — nollade reformlöften som liknar ett prissatt löfte hos ett
 * annat parti.
 *
 * VARFÖR DEN HÄR FINNS
 *
 * Regeln «samma politik ska kosta lika» står i projektminnet och är fastställd
 * genom mänskligt beslut. Den har ingen mätning. Det märktes i genomgången av
 * de 2 720 publicerade löftena 2026-08-21/22: de tre värdefullaste fynden var
 * alla paritetsfel, inte räknefel —
 *
 *   · 18 000 msek av ett partis summa vilade på samma reform två gånger,
 *   · ett mänskligt beslut om att nolla utredningslöften hade tillämpats på
 *     de 28 löften som fastnade i sökmönstret medan 36 likadana bar en
 *     schablon,
 *   · och samma åtgärd kostade noll hos ett parti och pengar hos ett annat.
 *
 * Ingen av dem kunde hittas genom att läsa ett löfte i taget, och ingen av
 * dem hittades av granskningen som läste vartenda löfte. De syns bara när
 * löften jämförs med varandra. Sökningen fanns bara som ett engångsskript i
 * en granskningsmapp, och ett engångsskript åldras samma dag det körts.
 *
 * DEN HÄR RAPPORTERAR, DEN BLOCKERAR INTE
 *
 * Precisionen räcker inte för en spärr: vid läsning höll elva av femton
 * träffar inte — titlarna delade ord men åtgärderna var olika. Ett svep som
 * fäller bygget på den träffbilden hade lärt alla att kringgå det. Fynden är
 * därför en kö som ska kvitteras, och varje kvittens bär sitt skäl. Att en
 * post kvitteras med «olika åtgärder» är ett fullgott utfall — kön mäter att
 * frågan är ställd, inte att något är fel.
 *
 * VAD SOM SKILJER ETT FYND FRÅN ETT ORDSAMMANTRÄFFANDE
 *
 * Två löften kopplas bara ihop när de delar ett SÄLLSYNT sakord i sina
 * RUBRIKER. Båda leden bär sin vikt. Sällsyntheten skiljer «alunskiffer» och
 * «karensavdrag» från «nationell» och «tydligare»: ett ord som står i vart
 * tionde löfte säger ingenting om att det är samma politik. Rubrikkravet
 * skiljer sakfrågan från bakgrunden — citatet nämner grannpolitik i förbigående,
 * rubriken är härledd ur åtagandet. Mätt mot publicerade data 2026-08-22:
 * ett delat sakord ensamt flaggar 490 löften, sällsynthetskravet tar bort 65,
 * rubrikkravet ytterligare 175, och rubriköverlappet resten — 36 kvar.
 */

import { stemmedTokens } from "./similarity.ts";

/** Ett delat ord räknas som sakord först vid den här längden — kortare ord är oftast form, inte politik. */
export const SAKORD_MIN_LANGD = 7;

/**
 * Hur många av de aktiva löftena ett ord får stå i och ändå räknas som
 * sällsynt. 25 av ~2 700 är knappt en procent. Höjs talet kommer «nationell»
 * och «regeringen» in, och då är fyndet ett ordsammanträffande.
 */
export const SALLSYNT_TAK = 25;

/** Hur mycket rubrikerna minst ska överlappa. Kalibrerad mot publicerade data 2026-08-22: 0,25 ger 36 fynd, 0,30 ger 18. */
export const RUBRIKLIKHET_MIN = 0.25;

export interface ParitetsLofte {
  id: string;
  title: string;
  quote: string;
  parties: string[];
  category: string;
  group_id: string | null;
  status: string;
  loftestyp?: "reform" | "inriktning";
  cost?: { msek_base?: number; period?: string | null } | null;
}

export interface Paritetsfynd {
  /** Stabil nyckel: det nollade löftet och dess prissatta motpart. */
  nyckel: string;
  nollat: string;
  nollat_rubrik: string;
  nollat_partier: string[];
  prissatt: string;
  prissatt_rubrik: string;
  prissatt_partier: string[];
  /** Beloppet som står på spel — motpartens basbelopp. Kön sorteras på det. */
  msek_base: number;
  period: string | null;
  kategori: string;
  /** De sällsynta sakorden rubrikerna delar. Skälet till att paret alls står här. */
  delade_ord: string[];
  /** Rubriköverlapp 0–1. En rankning, inte ett omdöme. */
  rubriklikhet: number;
}

/** Vad läsningen av ett fynd landade i. Kön mäter att frågan är ställd — inte att något var fel. */
export type Kvittensutfall =
  /** Läst: det är inte samma åtgärd. Titlarna delade ord, politiken skiljer sig. */
  | "olika_atgarder"
  /** Läst: det ÄR samma åtgärd, och nollan är rätt — ett förbud kostar staten ingenting. */
  | "nollan_haller"
  /** Läst: beloppen vilade på olika grund, och något rättades. */
  | "rattat"
  /**
   * Läst: frågan är verklig och rör en publicerad siffra, men svaret är inte
   * svepets att ge. Raden går vidare till `haller-det` och ett mänskligt
   * beslut, och räknas för sig tills det beslutet är fattat — annars ser en
   * läst men olöst rad likadan ut som en oläst.
   */
  | "till_beslut";

export interface Kvittens {
  utfall: Kvittensutfall;
  skal: string;
  datum: string;
}

export const nyckelFor = (nollat: string, prissatt: string): string => `${nollat}→${prissatt}`;

const helatexten = (l: ParitetsLofte): string => `${l.title} ${l.quote}`;

const basbelopp = (l: ParitetsLofte): number => l.cost?.msek_base ?? 0;

/** Hur många aktiva löften varje ordstam står i — grunden för sällsyntheten. */
export function ordfrekvens(loften: readonly ParitetsLofte[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const l of loften) {
    for (const ord of stemmedTokens(helatexten(l))) df.set(ord, (df.get(ord) ?? 0) + 1);
  }
  return df;
}

function overlapp(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let delade = 0;
  for (const t of a) if (b.has(t)) delade += 1;
  return delade / (a.size + b.size - delade);
}

/**
 * Parar ihop varje nollat reformlöfte med det prissatta löfte hos ett annat
 * parti som ligger närmast — eller med inget alls, vilket är det vanliga.
 *
 * Ett inriktningslöfte söks aldrig: dess nolla säger att löftet inte går att
 * prissätta, och det är en annan fråga än den här. Delade löften (samma
 * `group_id`) är redan hopknutna av en människa och räknas en gång, så de är
 * inte paritetsfel utan lösningen på ett.
 */
export function paritetsfynd(
  loften: readonly ParitetsLofte[],
  installningar: { sallsyntTak?: number; rubriklikhetMin?: number } = {},
): Paritetsfynd[] {
  const sallsyntTak = installningar.sallsyntTak ?? SALLSYNT_TAK;
  const rubriklikhetMin = installningar.rubriklikhetMin ?? RUBRIKLIKHET_MIN;

  const aktiva = loften.filter((l) => l.status === "aktiv");
  const df = ordfrekvens(aktiva);
  const rubrikord = new Map(aktiva.map((l) => [l.id, stemmedTokens(l.title)]));

  const nollade = aktiva.filter((l) => l.loftestyp === "reform" && basbelopp(l) === 0);
  const prissatta = aktiva.filter((l) => basbelopp(l) > 0);

  const fynd: Paritetsfynd[] = [];
  for (const nollat of nollade) {
    const ordA = rubrikord.get(nollat.id) ?? new Set<string>();
    let basta: Paritetsfynd | null = null;

    for (const prissatt of prissatta) {
      if (prissatt.category !== nollat.category) continue;
      if (nollat.group_id !== null && nollat.group_id === prissatt.group_id) continue;
      if (prissatt.parties.some((p) => nollat.parties.includes(p))) continue;

      const ordB = rubrikord.get(prissatt.id) ?? new Set<string>();
      const delade = [...ordA].filter(
        (o) => ordB.has(o) && o.length >= SAKORD_MIN_LANGD && (df.get(o) ?? 0) <= sallsyntTak,
      );
      if (delade.length === 0) continue;

      const likhet = overlapp(ordA, ordB);
      if (likhet < rubriklikhetMin) continue;
      if (basta && likhet <= basta.rubriklikhet) continue;

      basta = {
        nyckel: nyckelFor(nollat.id, prissatt.id),
        nollat: nollat.id,
        nollat_rubrik: nollat.title,
        nollat_partier: nollat.parties,
        prissatt: prissatt.id,
        prissatt_rubrik: prissatt.title,
        prissatt_partier: prissatt.parties,
        msek_base: basbelopp(prissatt),
        period: prissatt.cost?.period ?? null,
        kategori: nollat.category,
        delade_ord: delade.sort(),
        rubriklikhet: Number(likhet.toFixed(3)),
      };
    }
    if (basta) fynd.push(basta);
  }

  // Störst belopp först: kön betas av uppifrån, och den post som kan flytta
  // mest i en publicerad summa ska läsas först.
  return fynd.sort((a, b) => b.msek_base - a.msek_base || a.nyckel.localeCompare(b.nyckel));
}

/** Fynden ingen läst än. Det är det tal kön mäts på. */
export function okvitterade(
  fynd: readonly Paritetsfynd[],
  kvittenser: ReadonlyMap<string, Kvittens>,
): Paritetsfynd[] {
  return fynd.filter((f) => !kvittenser.has(f.nyckel));
}

/**
 * Fynden som är lästa och verkliga men väntar på ett mänskligt beslut om en
 * publicerad siffra. De hör inte hemma i läslistan — de är redan lästa — men
 * de får inte heller försvinna in i «kvitterat»: en olöst fråga som ser löst
 * ut är värre än en oläst.
 */
export function vantarPaBeslut(
  fynd: readonly Paritetsfynd[],
  kvittenser: ReadonlyMap<string, Kvittens>,
): Paritetsfynd[] {
  return fynd.filter((f) => kvittenser.get(f.nyckel)?.utfall === "till_beslut");
}
