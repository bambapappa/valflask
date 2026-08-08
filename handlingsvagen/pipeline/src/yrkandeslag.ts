/**
 * Vad en motions yrkanden är för slag — och därmed vad de kan bära.
 *
 * En motions handling är dess yrkande. Men yrkanden är inte ett slag utan
 * fyra, och beslutet b-0039 hänger på skillnaden mellan dem:
 *
 * - **Anslagsyrkandet** anvisar anslagen inom ett utgiftsområde enligt en
 *   tabell i motionen. Tabellen ingår i yrkandet genom hänvisningen, så finns
 *   det en rad för saken har partiet begärt att riksdagen beslutar om just den.
 * - **Ramverksyrkandet** godkänner riktlinjer, fastställer utgiftstaket eller
 *   fördelar utgifter per utgiftsområde. Den enskilda reformen ligger inne i en
 *   områdessumma och pekas inte ut — ett sådant yrkande bär inget enskilt löfte.
 * - **Inkomstberäkningsyrkandet** godkänner beräkningen av statens inkomster.
 *   Bär det också ledet om att regeringen ska återkomma med lagförslag i
 *   överensstämmelse med beräkningen kan det bära ett skatte- eller
 *   avgiftslöfte, för då binder det regeringen att lagstifta.
 * - **Sakyrkandet** är allt annat: «Riksdagen ställer sig bakom det som anförs
 *   i motionen om …», ett avslag på ett bestämt regeringsförslag, en lagtext.
 *   Det säger vad partiet vill i sak och kan bära ett löfte direkt.
 *
 * Lydelserna är hämtade ur riksdagens egna yrkandelistor, aldrig skrivna för
 * hand. Mönstren nedan är byggda ur 7 152 lydelser i beståndet, inte ur minnet.
 */

/** Yrkandets slag, i den ordning b-0039 skiljer dem. */
export type Yrkandeslag = "anslag" | "ramverk" | "inkomstberakning" | "sak";

/**
 * Anslagsyrkandets kärna. Formuleringen efter «anvisar anslagen» varierar
 * («enligt förslaget i tabell A», «enligt det förslag som framgår av tabell 1»,
 * «med de ändringar i förhållande till regeringens förslag som framgår av
 * tabell 1»), men de två orden gör det inte.
 */
const ANSLAG = /anvisar\s+anslagen/iu;

/** Ramverket: riktlinjerna, utgiftstaket, fördelningen per utgiftsområde. */
const RAMVERK =
  /riktlinjer för den ekonomiska politiken|fastställer utgiftstaket|fördelning(?:en)? av utgifter på utgiftsområden|preliminära beräkningen av inkomster/iu;

/** Inkomstberäkningen, som bär ett skattelöfte bara med lagförslagsledet. */
const INKOMSTBERAKNING = /godkänner beräkningen av inkomsterna/iu;

/**
 * Ledet som gör inkomstberäkningen bindande: regeringen ska «återkomma med
 * lagförslag i överensstämmelse med denna beräkning». Utan det är yrkandet en
 * siffra i en tabell och inget åtagande att lagstifta.
 */
const LAGFORSLAGSLEDET = /återkomma med lagförslag i överensstämmelse med/iu;

/** Vad ett enskilt yrkande är för slag. */
export function yrkandeslag(lydelse: string): Yrkandeslag {
  if (ANSLAG.test(lydelse)) return "anslag";
  if (INKOMSTBERAKNING.test(lydelse)) return "inkomstberakning";
  if (RAMVERK.test(lydelse)) return "ramverk";
  return "sak";
}

/** Bär motionen ett inkomstberäkningsyrkande som binder regeringen att lagstifta? */
export function bindandeInkomstberakning(lydelser: string[]): boolean {
  return lydelser.some((l) => INKOMSTBERAKNING.test(l) && LAGFORSLAGSLEDET.test(l));
}

/**
 * Motionens slag — vilken behandling b-0039 föreskriver för den.
 *
 * `sakyrkanden` går före allt annat, och det är avsiktligt. Har motionen ett
 * enda sakyrkande finns det något att läsa som kan bära löftet direkt, och då
 * ska ingen mekanisk regel avgöra saken. Mätt i beståndet flyttar den
 * ordningen 13 kopplingar från en tabellkontroll till en läsning: bland dem
 * motioner som anvisar anslag men också yrkar avslag på ett bestämt
 * regeringsförslag, vilket är precis det slags yrkande som kan bära ett löfte.
 */
export type Motionsslag = "bara_anslag" | "bara_ramverk" | "sakyrkanden" | "inga_yrkanden";

/** Motionens slag ur dess yrkandelydelser. */
export function motionensSlag(lydelser: string[]): Motionsslag {
  if (lydelser.length === 0) return "inga_yrkanden";
  const slag = lydelser.map(yrkandeslag);
  if (slag.includes("sak")) return "sakyrkanden";
  if (slag.includes("anslag")) return "bara_anslag";
  return "bara_ramverk";
}

/** Vad slaget innebär, i klartext för den som läser en utskrift. */
export const SLAGETS_INNEBORD: Record<Motionsslag, string> = {
  bara_anslag:
    "bara anslagsyrkanden — kan bära ett löfte som består i pengar om tabellen har en rad för saken",
  bara_ramverk:
    "bara ramverksyrkanden — bär inget enskilt löfte, utom ett skattelöfte via inkomstberäkningen",
  sakyrkanden: "sakyrkanden finns — läs om något av dem bär löftet",
  inga_yrkanden: "ingen yrkandelista hos riksdagen — brödtexten är allt som finns",
};
