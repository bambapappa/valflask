/**
 * Spåret efter ett citat som INTE står bland handlingens egna lydelser.
 *
 * H2 kräver att beviset står i den del av dokumentet som ÄR handlingen. Från
 * den regeln finns ett undantag, fattat som mänskligt beslut 2026-08-09: en
 * budgetmotion vars yrkanden bara anvisar medel enligt en tabell godtar inget
 * citat alls, för partiet skriver vad det faktiskt föreslår i brödtexten.
 *
 * Undantaget har hela tiden skrivits ut för läsaren — men i **prosa**, och i
 * tre olika former från tre olika verktyg: anslagsbäraren skriver ut
 * anslagsraden, inkomstbäraren inkomstraden, och bevisbytet den granskarens
 * egna skäl. Alla tre säger vad som gäller. Ingen av dem går att pröva.
 *
 * Det blev tydligt vid genomgången 2026-08-22: ett svep som prövade samtliga
 * 792 aktiva kopplingar mot riksdagens källor fann 69 citat som inte stod i
 * handlingens egen del, och kunde **inte** av sig självt skilja de 68
 * godkända undantagen från den enda verkliga bristen. Skillnaden fanns bara i
 * löptext, i tre generationers formuleringar, och fick läsas för hand.
 *
 * Den här modulen ger undantaget ett fält. Prosan står kvar — den är det
 * läsaren ser och den säger mer än ett fält kan — men fältet säger vilken av
 * de tre grunderna som bär posten, och ett prov håller ihop de två så att ett
 * fält aldrig kan påstå ett undantag som prosan inte förklarar.
 */

/** Vilken grund som bär ett citat utanför handlingens egna lydelser. */
export type Brodtextgrund = "anslagsrad" | "inkomstrad" | "manskligt_beslut";

/**
 * Prosans inledning per grund — nyckeln som binder fältet till texten.
 *
 * Anslagsbäraren bär två varianter: dagens och den som gällde till 2026-08-08,
 * då noten talade om motionens «enda» yrkande. Båda finns i publicerat data.
 */
const PROSANS_INLEDNING: Record<Brodtextgrund, readonly string[]> = {
  anslagsrad: [
    "Motionens anslagsyrkande anvisar anslagen enligt tabellen i motionen",
    "Motionens enda yrkande anvisar anslagen enligt tabellen",
  ],
  inkomstrad: ["Motionens yrkanden fastställer budgetens ramar"],
  manskligt_beslut: ["Citatet står inte bland handlingens egna lydelser, och togs in på ett mänskligt beslut"],
};

/** Alla grunder, i den ordning de prövas när flera skulle kunna passa. */
export const GRUNDER: readonly Brodtextgrund[] = ["manskligt_beslut", "anslagsrad", "inkomstrad"];

/**
 * Vilken grund motiveringen faktiskt förklarar, eller undefined.
 *
 * `manskligt_beslut` prövas först: en post kan ha fått både en anslagsrad
 * utskriven och senare ett bevisbyte på granskarens eget skäl, och då är det
 * granskarens beslut som är den gällande grunden — det är den som beskriver
 * citatet som står där nu.
 */
export function grundenIProsan(motivering: string | undefined): Brodtextgrund | undefined {
  const text = motivering ?? "";
  return GRUNDER.find((g) => PROSANS_INLEDNING[g].some((inledning) => text.includes(inledning)));
}

/** Bär motiveringen någon förklaring alls till ett citat utanför lydelserna? */
export function harProsa(motivering: string | undefined): boolean {
  return grundenIProsan(motivering) !== undefined;
}
