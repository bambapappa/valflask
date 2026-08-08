/**
 * Inkomstberäkningens tabell ur en budgetmotion.
 *
 * Ett inkomstberäkningsyrkande lyder att riksdagen "godkänner beräkningen av
 * inkomsterna i statens budget enligt tabellen" och — när det binder — att
 * regeringen ska "återkomma med lagförslag i överensstämmelse med denna
 * beräkning". Tabellen ingår i yrkandet genom hänvisningen, precis som
 * anslagstabellen gör i anslagsyrkandet, och det är där partiets faktiska
 * begäran står: en rad per inkomsttitel med avvikelsen mot regeringens förslag.
 *
 * Beslutet om budgetmotioners yrkanden säger att ett ramverksyrkande inte bär
 * något enskilt löfte **utom** när löftet gäller en skatt eller en avgift och
 * inkomstberäkningsyrkandet binder regeringen att lagstifta. Sex publicerade
 * kopplingar väntade på just den raden, och den gick inte att hämta:
 * `anslagstabell.ts` läser *utgiftsanslagens* tabell, och ett skattelöfte kan
 * aldrig bäras av en utgiftsrad. Därför den här modulen.
 *
 * Ren parsning utan nätverk: anroparen hämtar HTML:en.
 */
import { tabeller, tabelltal } from "./anslagstabell.ts";
import { overlapp } from "./sakord.ts";

/** En rad i inkomstberäkningens tabell. */
export interface Inkomstrad {
  /** Inkomsttitelns nummer, t.ex. "1280". Fyra siffror, riksdagens egen indelning. */
  titel: string;
  /** Titelns namn så som motionen skriver det, t.ex. "Nedsättningar". */
  namn: string;
  /**
   * Avvikelsen mot regeringens förslag **i tabellens egen enhet**, inte
   * omräknad. Budgetårets inkomsttabell anger tusental kronor.
   *
   * Tecknet är inkomstens, inte reformens: en skattesänkning står som ett
   * **minus** (staten tar in mindre) och en skattehöjning som ett plus. Ett
   * minus på en rad är alltså inte automatiskt en motsägelse mot ett löfte —
   * det är vad ett löfte om sänkt skatt ska ge.
   *
   * `0` betyder att motionen uttryckligen lämnar inkomsttiteln orörd (`±0`):
   * partiet begärde ingen ändring av den skatten. `null` betyder att raden inte
   * bar någon läsbar siffra, och okänt får varken läsas som noll eller som
   * regeringens förslag.
   */
  avvikelse: number | null;
}

/** Inkomsttiteln står som nummer och namn i **samma** cell, till skillnad från anslagen. */
const INKOMSTTITEL = /^(\d{4})\s+(\S.*)$/u;

/**
 * Inkomstberäkningens rader för **budgetåret**.
 *
 * Urvalet av tabell är hela svårigheten. En budgetmotion bär normalt två
 * tabeller med rubriken "Inkomsttitel": budgetårets, som har en kolumn för
 * regeringens förslag och anges i **tusental kronor**, och de beräknade åren,
 * som saknar den kolumnen och anges i **miljoner kronor**. Rubrikerna är i
 * övrigt identiska. Läses fel tabell blir varje belopp tusen gånger fel, och
 * felet syns inte — talen är rimliga i båda enheterna.
 *
 * Därför krävs kolumnen "Regeringens förslag". Den finns bara i budgetårets
 * tabell, och det är budgetåret yrkandet gäller.
 */
export function parseInkomsttabell(html: string): Inkomstrad[] {
  const ut: Inkomstrad[] = [];
  for (const rader of tabeller(html)) {
    const rubrik = rader[0] ?? [];
    if (!rubrik.some((c) => /inkomsttitel/iu.test(c))) continue;
    if (!rubrik.some((c) => /regeringens förslag/iu.test(c))) continue;
    const franSlutet = avvikelsekolumnFranSlutet(rubrik);
    if (franSlutet === null) continue;
    for (const celler of rader) {
      const m = INKOMSTTITEL.exec(celler[0] ?? "");
      if (m === null) continue;
      ut.push({
        titel: m[1]!,
        namn: m[2]!.trim(),
        avvikelse: tabelltal(celler[celler.length - 1 - franSlutet] ?? ""),
      });
    }
  }
  return ut;
}

/**
 * Hur många celler från radens slut avvikelsen står.
 *
 * Räknas från slutet av samma skäl som i anslagstabellen: riksdagens rubriker
 * har inte alltid lika många celler som dataraderna, och ett index från vänster
 * glider då ett steg och visar regeringens förslag som partiets avvikelse.
 */
function avvikelsekolumnFranSlutet(rubrik: string[]): number | null {
  const i = rubrik.findIndex((c) => /avvikelse|förändring|ändring/iu.test(c));
  return i === -1 ? null : rubrik.length - 1 - i;
}

/** En kandidatrad med hur många av löftets sakord den delar. */
export interface Inkomsttraff {
  rad: Inkomstrad;
  /** Antal av löftets sakord som återkommer i titelns namn. Alltid minst 1. */
  poang: number;
}

/**
 * Raderna som kan tänkas bära ett skattelöfte, rangordnade efter ordöverlapp.
 *
 * **Rangordningen väljer inte rad.** Inkomsttitlarna är dessutom betydligt
 * bredare än anslagen — hela statens inkomster ryms i ett trettiotal rader — så
 * att en rad finns för en skatt säger mindre här än att ett anslag finns i
 * utgiftstabellen. Vad raden rör sig av är en läsning, och den läsningen måste
 * göras mot motionens egen reformtabell.
 *
 * Vid lika ordöverlapp går den **snävare** titeln före. Tabellen bär både
 * summeringsrader och de titlar som summeras: "1200 Indirekta skatter på arbete"
 * och "1210 Arbetsgivaravgifter" delar båda ordet *arbete* med ett löfte om
 * arbetsgivaravgiften, och utan regeln avgörs vilken som visas av radordningen —
 * alltid till summeringsradens fördel, eftersom den står först. Att skriva
 * summan av alla skatter på arbete i en motivering som den rad som bär ett löfte
 * om en enda avgift vore att visa läsaren något mycket bredare än vi påstår.
 */
export function narmastLoftetMedPoang(rader: Inkomstrad[], loftetext: string): Inkomsttraff[] {
  return rader
    .map((rad) => ({ rad, poang: overlapp(rad.namn, loftetext) }))
    .filter((x) => x.poang > 0)
    .sort((a, b) => b.poang - a.poang || Number(arSummering(a.rad)) - Number(arSummering(b.rad)));
}

/**
 * Är titeln en summeringsrad?
 *
 * Riksdagens inkomsttitlar är hierarkiska: `1000` är huvudgruppen, `1200`
 * gruppen och `1210` titeln som summeras in i den. En titel som slutar på två
 * nollor är alltså en summa av raderna under sig, inte en egen skatt.
 */
function arSummering(rad: Inkomstrad): boolean {
  return rad.titel.endsWith("00");
}

/**
 * Beloppet som text, i tabellens egen enhet och med tecknet kvar.
 *
 * Tusenavskiljaren är ett vanligt mellanslag, inte det hårda mellanslag
 * `toLocaleString` ger — ett osynligt tecken som skiljer två skrivningar av
 * samma belopp gör att en jämförelse mellan dem faller utan att någon ser varför.
 */
export function radensBelopp(rad: Inkomstrad): string {
  if (rad.avvikelse === null) return "okänt belopp";
  if (rad.avvikelse === 0) return "±0";
  const tal = Math.abs(rad.avvikelse).toLocaleString("sv-SE").replace(/\s/gu, " ");
  return `${rad.avvikelse > 0 ? "+" : "−"}${tal}`;
}
