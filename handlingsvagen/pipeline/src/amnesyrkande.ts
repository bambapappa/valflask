/**
 * Yrkandet som bara namnger ett ämne, utan att säga vad som ska göras med det.
 *
 * H2 kräver att citatet står i ett av motionens yrkanden, och den grinden
 * håller: i kön 2026-09-06 stod samtliga 112 motionsciteringar i ett yrkande,
 * mot 149 av 187 i brödtexten i kön 2026-08-06. Men den prövar att citatet
 * **är** ett yrkande, inte att yrkandet bär en riktning:
 *
 *   «Riksdagen ställer sig bakom det som anförs i motionen om kärnkraft och
 *   tillkännager detta för regeringen.»
 *
 * Ett sådant yrkande passerar H2 och säger ändå inte om partiet vill bygga ut
 * kärnkraften eller avveckla den. Utan riktning finns ingen koppling att pröva,
 * och H5 säger att riktningen ska följa av dokumentets egen text — inte av
 * motionens rubrik och inte av en läsning av brödtexten. Fyra av köns 136
 * förslag var av det slaget, och yrkandelistan hos riksdagen visade att det
 * inte fanns någon längre lydelse att byta till: den korta lydelsen var hela
 * yrkandet.
 *
 * **Regeln fäller bara det som är otvetydigt tomt.** Ett missat ämnesyrkande
 * kostar en läsning; ett felaktigt fällt yrkande kostar en verklig handling.
 * Därför krävs alla fyra villkoren nedan, och därför är ordgränsen två:
 *
 * - **«att» friar.** «om att avskaffa karensavdraget», «om rätten att
 *   reparera» — infinitivmärket bär verbet som säger vad som ska göras.
 * - **En preposition friar.** «om krav på heltid», «om utbyggnad av
 *   civilplikt», «om gruppförbud för PFAS» — ledet efter prepositionen gör
 *   ämnet till en åtgärd.
 * - **En obestämd artikel friar.** «om en skärpt vårdgaranti», «om ett
 *   landsbygdslån» — artikeln säger att något nytt föreslås.
 * - **Högst två ord.** Det är villkoret som håller «om stärkt sydsvenskt
 *   försvar» utanför: «stärkt» är en riktning, och en trygg regel ska hellre
 *   släppa igenom det ledet än gissa vilka ord som är riktningsbärande.
 *
 * Mätt mot hela beståndet — 1 279 tillkännagivandeyrkanden i `kopplingar.json`
 * och `kopplingsforslag.json` — träffar regeln tolv citat: mot kön 2026-09-06
 * exakt de fyra som genomgången pekade ut för hand («om språkkrav» två gånger,
 * «om kärnkraft», «om public service»), och mot det publicerade åtta: «om
 * Äldreomsorgslyftet» fyra gånger, «om EBO-lagen» två, «om apoteksmarknaden»
 * och «om partiella hyreskontrakt». De åtta är publicerade och rörs inte av
 * den här grinden — att byta eller dra in dem är en rättelse och ett mänskligt
 * beslut. Att de syns är avsikten: en grind som bara mäter framtiden säger
 * ingenting om vad som redan står.
 */

/**
 * Tillkännagivandeyrkandets form, med ämnet som fångad grupp.
 *
 * Slutledet skrivs på två sätt i beståndet — «och tillkännager detta för
 * regeringen» och «och detta tillkännager riksdagen för regeringen» — och båda
 * är samma yrkande. Bara den här formen prövas: ett avslagsyrkande, en lagtext
 * eller ett anslagsyrkande bär sin riktning på andra sätt och avgörs av andra
 * regler.
 */
const TILLKANNAGIVANDET =
  /^\s*riksdagen ställer sig bakom det som anförs i motionen om (.+?)\s*(?:och (?:detta )?tillkännager (?:detta )?(?:för |riksdagen för )regeringen)\s*\.?\s*$/iu;

/** Infinitivmärket — bär verbet som säger vad som ska göras. */
const INFINITIVMARKET = /(^|\s)att(\s|$)/iu;

/** Prepositionerna som gör ämnet till en åtgärd genom sitt efterled. */
const PREPOSITION = /(^|\s)(av|för|från|i|inom|med|mot|om|på|till|vid)(\s|$)/iu;

/** Obestämd artikel först — något nytt föreslås, inte ett ämne pekas ut. */
const OBESTAMD_ARTIKEL = /^(en|ett)\s/iu;

/** Högst så många ord får ämnet vara för att räknas som otvetydigt tomt. */
export const AMNETS_MAXORD = 2;

/**
 * Ämnet i ett tillkännagivandeyrkande, eller `null` när citatet inte har den
 * formen. Skiljetecken behålls — ämnet skrivs ut i grindens skäl, och där ska
 * det stå som i motionen.
 */
export function yrkandetsAmne(citat: string): string | null {
  const m = TILLKANNAGIVANDET.exec(citat ?? "");
  return m ? (m[1] ?? "").trim() : null;
}

/** Vad som friar ett ämne från att räknas som tomt. */
export type Fribiljett = "infinitivmarket" | "preposition" | "obestamd artikel" | "langre an tva ord";

/**
 * Fribiljetten ett ämne bär, eller `null` när det är otvetydigt tomt.
 *
 * De fyra villkoren prövas var för sig och i den här ordningen så att var och
 * ett går att mäta ensamt. Ordgränsen sist är avsiktlig: den skulle annars täcka
 * över de tre andra i dagens bestånd — inget ämne där är på två ord *och* bär
 * ett infinitivmärke eller en preposition — och ett villkor som bara är sant
 * därför att ett annat råkar fånga samma rader är ingen regel, det är en
 * tillfällighet. `tests/amnesyrkande.test.ts` prövar därför fribiljetterna
 * direkt och inte bara genom slutsatsen.
 */
export function friarAmnet(amne: string): Fribiljett | null {
  if (INFINITIVMARKET.test(amne)) return "infinitivmarket";
  if (PREPOSITION.test(amne)) return "preposition";
  if (OBESTAMD_ARTIKEL.test(amne)) return "obestamd artikel";
  if (amne.split(/\s+/u).length > AMNETS_MAXORD) return "langre an tva ord";
  return null;
}

/**
 * Är yrkandet ett rent ämnesyrkande — namnger det ett ämne utan att säga vad
 * som ska göras med det?
 */
export function riktningslostAmnesyrkande(citat: string): boolean {
  const amne = yrkandetsAmne(citat);
  if (amne === null || amne === "") return false;
  return friarAmnet(amne) === null;
}

/** Grindens skäl, med ämnet utskrivet så att den som läser ser vad som fattas. */
export function amnesyrkandetsSkal(citat: string): string {
  return (
    `Yrkandet lyder «om ${yrkandetsAmne(citat) ?? "…"}» och namnger bara ett ämne — ` +
    "det säger inte vad handlingen vill, och utan riktning finns ingen koppling att " +
    "pröva. Finns en längre lydelse i motionens yrkandelista: byt till den."
  );
}
