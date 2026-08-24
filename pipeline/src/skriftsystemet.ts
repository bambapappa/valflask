/**
 * Publicerad text ska vara skriven med latinska bokstäver.
 *
 * VARFÖR. Texten är genererad av en språkmodell, och en modell kan halka över
 * i ett annat skriftsystem MITT I ETT ORD utan att något går sönder. Resultatet
 * ser ut som svenska på avstånd och är obegripligt på nära håll:
 *
 *   «handlar främst om личliga och organisatoriska resurser»   (лич = person)
 *   «extratjänster (stats субventionerad anställning)»          (суб = sub)
 *   «osäkerhet uppåt vid kraftig扩ning»                          (扩 = utök)
 *
 * Alla tre stod publikt på löftessidor. Felet syns inte i en stavningskontroll,
 * det bryter sökningen, och en skärmläsare byter språk mitt i meningen.
 *
 * VAD SOM ÄR TILLÅTET. Kravet gäller BOKSTÄVER, inte tecken. Siffror,
 * skiljetecken, valutatecken, procent, tankstreck och upphöjda siffror är
 * oberörda — «100–200 tusen m³ HVO» är korrekt svenska och ska passera. Grekiska
 * bokstäver kan förekomma i formler och är därför inte förbjudna i sig; det som
 * fälls är bokstäver ur skriftsystem som inte används i svensk sakprosa.
 *
 * Funnen 2026-08-23 vid en genomgång av hela beståndet, efter att ETT annat
 * teckenfel — en uträkning som tappat alla å, ä och ö — hittats av en läsare i
 * Avgörandet. Det första felet var isolerat; det här var tre.
 */

/** Skriftsystem som inte förekommer i svensk sakprosa. */
const FORBJUDNA = [
  { namn: "kyrilliska", prov: /\p{Script=Cyrillic}/u },
  { namn: "grekiska", prov: /\p{Script=Greek}/u },
  { namn: "kinesiska", prov: /\p{Script=Han}/u },
  { namn: "arabiska", prov: /\p{Script=Arabic}/u },
  { namn: "hebreiska", prov: /\p{Script=Hebrew}/u },
  { namn: "japanska", prov: /\p{Script=Hiragana}|\p{Script=Katakana}/u },
  { namn: "koreanska", prov: /\p{Script=Hangul}/u },
  { namn: "kyrilliska eller annat", prov: /\p{Script=Devanagari}|\p{Script=Thai}|\p{Script=Armenian}/u },
] as const;

export interface Teckenfynd {
  /** Vilket skriftsystem som hittades. */
  skrift: string;
  /** Tecknen själva, utan dubbletter. */
  tecken: string[];
  /** Texten runt det första tecknet, för att se ordet det sitter i. */
  sammanhang: string;
}

/** Hittar bokstäver ur främmande skriftsystem i en text. */
export function frammandeTecken(text: string | null | undefined): Teckenfynd[] {
  const t = text ?? "";
  const ut: Teckenfynd[] = [];
  for (const { namn, prov } of FORBJUDNA) {
    const global = new RegExp(prov.source, "gu");
    const träffar = [...t.matchAll(global)];
    if (träffar.length === 0) continue;
    const i = träffar[0]!.index ?? 0;
    ut.push({
      skrift: namn,
      tecken: [...new Set(träffar.map((m) => m[0]))],
      sammanhang: t.slice(Math.max(0, i - 40), i + 40),
    });
  }
  return ut;
}

export interface Textpost {
  id: string;
  status?: string;
  title?: string | null;
  quote?: string | null;
  cost?: { calculation?: string | null; method_note?: string | null } | null;
}

export interface Textbrott extends Teckenfynd {
  id: string;
  falt: string;
}

/** Alla aktiva löften vars publicerade text bär främmande bokstäver. */
export function skriftbrott(poster: readonly Textpost[]): Textbrott[] {
  const ut: Textbrott[] = [];
  for (const p of poster) {
    if ((p.status ?? "aktiv") !== "aktiv") continue;
    const falt: Array<[string, string | null | undefined]> = [
      ["title", p.title],
      ["quote", p.quote],
      ["calculation", p.cost?.calculation],
      ["method_note", p.cost?.method_note],
    ];
    for (const [namn, text] of falt) {
      for (const f of frammandeTecken(text)) ut.push({ id: p.id, falt: namn, ...f });
    }
  }
  return ut.sort((a, b) => a.id.localeCompare(b.id) || a.falt.localeCompare(b.falt));
}
