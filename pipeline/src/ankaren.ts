/**
 * Ankare: uträkningar som vilar på ett annat löftes belopp.
 *
 * Ett löfte utan egen siffra prissätts ofta genom att låna ett annat partis
 * angivna belopp. Lånet står utskrivet i uträkningen, och det är bra — men det
 * skapar ett beroende som ingenting bevakade. Ändrades långivarens belopp stod
 * låntagaren kvar på det gamla, och sajten visade två tal för samma politik.
 *
 * Det hände på riktigt: Socialdemokraternas äldreomsorgslöfte gick
 * 8 000 → 3 000 → 1 950 medan Liberalernas och Miljöpartiets lånade siffra
 * stod kvar på 3 000. Och eftersom gruppen representeras av det HÖGSTA
 * beloppet sänkte rättelsen av partiets eget löfte rikssumman med noll kronor.
 *
 * VARFÖR PARTIET OCH INTE TALET. Ett första svep frågade bara «finns talet som
 * något löftes nuvarande belopp?». Det var blint: när flera löften delar ett
 * lånat belopp står kopiorna kvar på talet även när originalet ändrats, och
 * kopiorna maskerar långivaren. Svepet gav noll fynd oavsett hur trasigt
 * beståndet var. Kontrollen går därför mot det parti uträkningen NAMNGER.
 *
 * RÄCKVIDDEN ÄR BEGRÄNSAD OCH DET ÄR AVSIKTLIGT UTSKRIVET. Ett ankare som bara
 * säger «i linje med jämförbara löften» namnger varken parti eller belopp, och
 * går aldrig att kontrollera igen när källan ändras. `ankartackning()` räknar
 * hur stor del av beståndet som alls går att pröva, så ett fynd aldrig läses
 * som att resten är rent.
 */

/** Partinamn i löpande text → partikod. */
export const PARTINAMN: Record<string, string> = {
  socialdemokraterna: "s",
  moderaterna: "m",
  sverigedemokraterna: "sd",
  centerpartiet: "c",
  vänsterpartiet: "v",
  kristdemokraterna: "kd",
  liberalerna: "l",
  miljöpartiet: "mp",
};

/**
 * Formuleringar som säger att beloppet kommer någon annanstans ifrån.
 *
 * Listan är mätt mot beståndet, inte gissad: «jämförbar» ensamt träffar 193
 * löften, och «lånat»/«anger själva» tillkom när äldreomsorgsrättelsen skrev om
 * uträkningarna till att säga lånet rent ut.
 */
const ANKARORD =
  /jämförbar|liknande löfte|andra partiers|samma politik|i linje med|ankar|samma nivå|motsvarande nivå|lånat|lånet|anger själva|anger själv/iu;

/** Belopp med enhet: «3 000 mkr», «1,95 miljarder», «1 950 miljoner kronor». */
const BELOPP = /(\d[\d\s  ]*(?:[,.]\d+)?)\s*(mdkr|miljarder|mkr|miljoner|msek)/giu;

/** Meningsdelning som duger för prosa — punkt, utrop, fråga, semikolon, radbrytning. */
export function meningar(text: string): string[] {
  return text.split(/(?<=[.!?;])\s+|\n/u).filter((m) => m.trim() !== "");
}

/** Meningarna i en uträkning som säger att beloppet är lånat. */
export function ankarmeningar(calculation: string): string[] {
  return meningar(calculation).filter((m) => ANKARORD.test(m));
}

/** Partikoder som nämns vid namn i meningen. */
export function namndaPartier(mening: string): string[] {
  return Object.entries(PARTINAMN)
    .filter(([namn]) => new RegExp(namn, "iu").test(mening))
    .map(([, kod]) => kod);
}

/**
 * Belopp i meningen, omräknade till msek.
 *
 * Tusenavskiljaren är ofta ett hårt eller smalt blanksteg i vår prosa, inte ett
 * vanligt mellanslag — därför tas alla tre bort innan talet läses.
 */
export function beloppIMening(mening: string): number[] {
  const ut: number[] = [];
  for (const m of mening.matchAll(BELOPP)) {
    const tal = Number(m[1]!.replace(/[\s  ]/gu, "").replace(",", "."));
    if (!Number.isFinite(tal) || tal === 0) continue;
    ut.push(/mdkr|miljarder/iu.test(m[2]!) ? tal * 1000 : tal);
  }
  return ut;
}

/** Det svepet behöver veta om ett löfte. */
export interface Ankarlofte {
  id: string;
  parties: string[];
  title: string;
  status?: string | null;
  cost?: { msek_base?: number | null; calculation?: string | null } | null;
}

/** Ett ankare, läst ur en enda mening. */
export interface Ankare {
  id: string;
  parties: string[];
  title: string;
  /** Partiet beloppet lånats av. */
  langivare: string;
  /** Beloppet uträkningen lånar, i msek. */
  belopp: number;
  mening: string;
}

/** Alla utläsbara ankare i beståndet — de som namnger både parti och belopp. */
export function ankare(loften: Ankarlofte[]): Ankare[] {
  const ut: Ankare[] = [];
  for (const p of loften) {
    if ((p.status ?? "aktiv") !== "aktiv") continue;
    for (const mening of ankarmeningar(p.cost?.calculation ?? "")) {
      const langivare = namndaPartier(mening).filter((k) => !p.parties.includes(k));
      if (langivare.length === 0) continue;
      for (const belopp of beloppIMening(mening)) {
        for (const l of langivare) {
          ut.push({ id: p.id, parties: p.parties, title: p.title, langivare: l, belopp, mening: mening.trim() });
        }
      }
    }
  }
  return ut;
}

/**
 * Hur stor del av beståndet svepet alls kan uttala sig om.
 *
 * Finns för att ett fynd av ett aldrig ska läsas som «resten är rent». Skillnaden
 * mellan `med_ankarord` och `provbara` är ankare vi skrivit så att de inte går
 * att följa upp — och den skillnaden är själva åtgärdspunkten.
 */
export function ankartackning(loften: Ankarlofte[]): {
  aktiva: number;
  med_ankarord: number;
  provbara: number;
} {
  let aktiva = 0;
  let medOrd = 0;
  let provbara = 0;
  for (const p of loften) {
    if ((p.status ?? "aktiv") !== "aktiv") continue;
    aktiva++;
    const mm = ankarmeningar(p.cost?.calculation ?? "");
    if (mm.length === 0) continue;
    medOrd++;
    const gar = mm.some(
      (m) => namndaPartier(m).some((k) => !p.parties.includes(k)) && beloppIMening(m).length > 0,
    );
    if (gar) provbara++;
  }
  return { aktiva, med_ankarord: medOrd, provbara };
}

/** Ett ankare som pekar på ett belopp långivaren inte har kvar. */
export interface Foraldrat extends Ankare {
  /** Långivarens nuvarande belopp, till hjälp för den som ska rätta. */
  langivarens_belopp: number[];
}

/**
 * Ankare som pekar på ett belopp långivaren HAFT men inte har.
 *
 * `haft` är partikod → alla belopp partiets löften burit genom historien.
 * Kravet att beloppet ska ha funnits hos långivaren är vad som skiljer ett
 * föråldrat ankare från ett tal som råkar likna ett belopp.
 */
export function foraldradeAnkare(
  loften: Ankarlofte[],
  haft: Record<string, number[]>,
): Foraldrat[] {
  const nu: Record<string, Set<number>> = {};
  for (const p of loften) {
    if ((p.status ?? "aktiv") !== "aktiv") continue;
    const b = p.cost?.msek_base;
    if (typeof b !== "number") continue;
    for (const parti of p.parties) (nu[parti] ??= new Set()).add(b);
  }
  return ankare(loften)
    .filter((a) => !nu[a.langivare]?.has(a.belopp) && (haft[a.langivare] ?? []).includes(a.belopp))
    .map((a) => ({ ...a, langivarens_belopp: [...(nu[a.langivare] ?? [])].sort((x, y) => x - y) }));
}

/** Ord värda att jämföra på — korta ord säger inget om ämnet. */
function amnesord(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-zåäöé]+/u)
      .filter((o) => o.length >= 5),
  );
}

/** Ett ankare som kan peka på det som ska ändras — och hur troligt det är. */
export interface Beroende extends Ankare {
  /**
   * Antal ämnesord som ankarmeningen delar med det ändrade löftets rubrik.
   *
   * Noll betyder inte att träffen är falsk, bara att ingenting utom partiet och
   * beloppet talar för den. Den som ändrar måste läsa meningen.
   */
  amnestraffar: number;
  /** Löftet träffen gäller — ett parti kan ha flera löften på samma belopp. */
  galler: string;
}

/**
 * Vilka löften ankrar i de här löftena?
 *
 * Den här frågan ställs INNAN en ändring, inte efter. Dras ett löfte tillbaka
 * eller ändras dess belopp ska den som gör det se vad som lutar sig mot det —
 * annars blir låntagarna föräldralösa i samma stund, och ingen märker det förrän
 * nästa svep. Ren funktion utan git: den läser nuvarande belopp, för det är det
 * som är på väg att ändras.
 *
 * MATCHNINGEN ÄR PARTI + BELOPP, OCH DEN ÄR MED FLIT TRUBBIG. Ett ankare
 * namnger partiet och talet men aldrig löftet — interna id:n är förbjudna i
 * publicerad text. Har ett parti två löften på samma belopp träffar båda, och
 * bara meningen avgör vilket som avses. Provat: en ändring av Centerpartiets
 * IVF-löfte på 300 mkr flaggade två löften som i själva verket ankrade i
 * partiets studieförbudslöfte, också på 300.
 *
 * Därför filtreras ingenting bort — det skulle dölja äkta träffar. I stället
 * räknas `amnestraffar`, och listan sorteras så att de troliga står först.
 */
export function beroendeAv(loften: Ankarlofte[], idn: string[]): Beroende[] {
  const mal = new Set(idn);
  const berorda = loften.filter((p) => mal.has(p.id));
  const parBelopp = new Map<string, string[]>();
  const rubrik = new Map<string, Set<string>>();
  for (const p of berorda) {
    const b = p.cost?.msek_base;
    if (typeof b !== "number") continue;
    rubrik.set(p.id, amnesord(p.title));
    for (const parti of p.parties) {
      const k = `${parti}::${b}`;
      parBelopp.set(k, [...(parBelopp.get(k) ?? []), p.id]);
    }
  }
  const ut: Beroende[] = [];
  for (const a of ankare(loften)) {
    if (mal.has(a.id)) continue;
    for (const galler of parBelopp.get(`${a.langivare}::${a.belopp}`) ?? []) {
      const ord = amnesord(a.mening);
      let traffar = 0;
      for (const o of rubrik.get(galler) ?? []) if (ord.has(o)) traffar++;
      ut.push({ ...a, galler, amnestraffar: traffar });
    }
  }
  return ut.sort((x, y) => y.amnestraffar - x.amnestraffar);
}
