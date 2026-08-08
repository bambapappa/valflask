/**
 * Vad en voteringspunkt räknar som sina egna ord.
 *
 * En voterings handling är den punkt kammaren röstade om. Men punktens
 * beslutstext säger ofta bara **vilka lagar** som ändrades — inte åt vilket
 * håll: «Riksdagen antar regeringens förslag till 1. lag om ändring i
 * tandvårdslagen (1985:125) …». Riktningen står i utskottets sammanfattning.
 *
 * **Mänskligt beslut 2026-08-06:** sammanfattningen räknas som handlingens egna
 * ord — men **bara för en punkt som antar något**. Avslår punkten bara motioner
 * beskriver sammanfattningen en ANNAN punkts sak, och då duger den inte som
 * bevis för den här.
 *
 * Porterad från `handlingens-egna-ord`-skillen så att svepet över hela
 * beståndet prövar samma sak som skillen prövar en post i taget. Mätt
 * 2026-08-08: utan den här regeln sa svepet att 20 voteringskopplingar citerade
 * fel del, medan skillen sa att de citerade beslutspunkten. Går de två isär
 * ljuger den ena.
 */

/**
 * Punkten antar, godkänner, bifaller, anvisar, bemyndigar, fastställer eller
 * beslutar något — alltså finns det en sak att sammanfatta.
 */
const ANTAR =
  /\bRiksdagen\s+(?:antar|godkänner|bifaller|anvisar|bemyndigar|fastställer|beslutar)\b/iu;

/**
 * En punkt som **bara** avslår motioner. Den passerar citatgrinden — det är
 * punktens egen beslutstext — men den säger bara att några yrkanden föll, inte
 * vad de begärde.
 */
const BARA_AVSLAG = /^Riksdagen avslår motion(?:erna)?\b/iu;

/** Antar punkten något, eller avslår den bara? */
export function punktenAntarNagot(forslag: string): boolean {
  return !BARA_AVSLAG.test(forslag.trim()) && ANTAR.test(forslag);
}

/**
 * Utskottets egen redogörelse för vad punkten antar — mellan rubrikerna
 * «Sammanfattning» och «Utskottets förslag till riksdagsbeslut».
 */
export function sammanfattning(text: string): string | null {
  const m = /\bSammanfattning\b([\s\S]*?)\bUtskottets förslag till riksdagsbeslut\b/u.exec(text);
  const inre = m?.[1]?.trim();
  return inre === undefined || inre === "" ? null : inre;
}

/**
 * Handlingens egna lydelser för en voteringspunkt.
 *
 * Punktens rubrik och beslutstext alltid; utskottets sammanfattning bara när
 * punkten antar något.
 */
export function punktensEgnaOrd(
  punkt: { rubrik: string; forslag: string },
  betankandetext: string,
): string[] {
  const ut = [`${punkt.rubrik} ${punkt.forslag}`];
  if (punktenAntarNagot(punkt.forslag)) {
    const s = sammanfattning(betankandetext);
    if (s !== null) ut.push(s);
  }
  return ut;
}
