/**
 * Ett citat som bara är riksdagens beslutsformel, utan en upplysning om vad
 * som beslutades.
 *
 * «Riksdagen avslår motionerna 2024/25:442 av Serkan Köse (S), 2024/25:1774 av
 * Mats Berglund m.fl. (MP) yrkande 44 …» säger vad som hände men ingenting om
 * saken. Läsaren ser ett beslut utan innehåll.
 *
 * **Grinden är den som analysen 2026-08-22 föreslog och som medvetet inte
 * byggdes**, med skälet att den hade fällt rätt data innan G5 var avgjord. G5
 * är avgjord 2026-08-23, och mätningen visar varför den behövde vara det:
 * av 27 procedurcitat i beståndet bär 19 ett sakinnehåll — de namnger
 * propositionen, lagen eller anslagsområdet — och åtta gör det inte. Av de
 * åtta är fem sådana där handlingens rubrik eller anslagsraden bär saken, och
 * **tre är voteringspunkter där formeln ÄR beslutet**: en avslagspunkt har
 * ingen annan text, och det finns inget bättre att citera.
 *
 * Därför fäller grinden inte på citatet ensamt. Den fäller när citatet är tomt
 * **och** motiveringen inte heller säger vad som beslutades. Ett tomt citat
 * med en motivering som förklarar vad de avslagna förslagen ville är fullgott;
 * ett tomt citat med en motivering som bara upprepar formeln är det inte.
 *
 * Grinden är grön i dag, och det är avsikten: den finns för att nästa
 * bevisbyte inte ska klistra in en avslagslista utan förklaring.
 */

/** Inledningen som gör citatet till en beslutsformel. */
const FORMELN = /^\s*(riksdagen|utskottet)\s+(antar|avslår|avstyrker|anvisar|bemyndigar|godkänner|beslutar|tillkännager|ställer sig bakom)\b/iu;

/**
 * Det som stryks innan vi frågar om något sakligt står kvar.
 *
 * Ordningen spelar roll: dokumentnummer och yrkandehänvisningar först, sedan
 * namnen med partibeteckning, sist de rent formella orden. Stryks namnen före
 * numren blir «av Serkan Köse (S), 2024/25:1774» till ett halvt uttryck.
 */
const STRYK: readonly RegExp[] = [
  /^\s*(riksdagen|utskottet)\s+\w+\s*/iu,
  /\b\d{4}\/\d{2,4}:\d+\b/gu,
  /\byrkande(na|t)?\s*[\d\s,och–-]*/giu,
  /\bav\s+\p{Lu}[\p{L}.-]*(\s+\p{Lu}[\p{L}.-]*)*\s*(m\.?fl\.?)?\s*\(\p{Lu}+\)/gu,
  /\b(regeringens förslag till|regeringens|proposition(en)?|motion(en|erna)?|skrivelse(n)?|betänkande(t)?|lag om ändring i|lag om|delvis|därmed|bifaller|delar|det avser|punkt(en|erna)?|och|samt|enligt|förslaget|tabell(en)?)\b/giu,
];

/** Vad som står kvar av citatet när formeln och hänvisningarna strukits. */
export function sakinnehallet(citat: string | undefined): string {
  let t = citat ?? "";
  for (const r of STRYK) t = t.replace(r, " ");
  t = t.replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\b\d+\b/gu, " ");
  // Korta ord bär sällan sakinnehåll och står ofta kvar ur formelspråket.
  return t.split(/\s+/u).filter((w) => w.length > 3).join(" ");
}

/**
 * Namnger citatet en författning?
 *
 * «lag om ändring i brottsbalken i de delar det avser 29 kap. 7 §» säger inte
 * vad paragrafen gör, men den säger var man slår upp det. Det räcker som
 * upplysning — en läsare kan följa den, till skillnad från en lista över
 * motionsnummer och ledamotsnamn.
 */
const FORFATTNING = /\p{L}{3,}(lagen|balken|förordningen|ordningen)\b|\blag om \p{L}{4,}/iu;

/** Är citatet en beslutsformel utan upplysning om saken? */
export function tomtProcedurcitat(citat: string | undefined): boolean {
  if (!FORMELN.test(citat ?? "")) return false;
  if (FORFATTNING.test(citat ?? "")) return false;
  return sakinnehallet(citat).split(/\s+/u).filter(Boolean).length < 2;
}

/**
 * Säger motiveringen vad som beslutades?
 *
 * Kravet är avsiktligt lågt: en mening som beskriver vad förslagen ville eller
 * vad beslutet innebär räcker. Måttet ska skilja en förklaring från en
 * upprepning av formeln, inte betygsätta prosan.
 */
const FORKLARAR =
  /\b(innebär|innebar|betyder|ville|vill|föreslog|föreslår|yrkar|yrkade|förslag som|avslår förslag|går emot|stödjer|handlar om|gäller|syftar)\b/iu;

export function motiveringenForklarar(motivering: string | undefined): boolean {
  const text = motivering ?? "";
  if (text.trim().length < 40) return false;
  return FORKLARAR.test(text);
}

export interface Procedurpost {
  id: string;
  status?: string;
  method_note?: string | null;
  bevis?: { citat?: string | null } | null;
}

/**
 * Aktiva kopplingar vars citat är en tom beslutsformel och vars motivering
 * inte heller säger vad som beslutades.
 */
export function utanUpplysning(poster: readonly Procedurpost[]): string[] {
  return poster
    .filter((k) => k.status === "aktiv")
    .filter((k) => tomtProcedurcitat(k.bevis?.citat ?? undefined))
    .filter((k) => !motiveringenForklarar(k.method_note ?? undefined))
    .map((k) => k.id)
    .sort();
}
