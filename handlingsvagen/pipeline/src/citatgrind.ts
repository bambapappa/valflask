/**
 * Åtkomstpunkt för citatnormaliseringen — den enda regeln som avgör om ett
 * citat räknas som återgivet ord för ord.
 *
 * Funktionen bor i `grindar.ts` här och i `gates.ts` i systerrepot `valflask`,
 * som en byte-identisk kopia. Den här filen finns för att
 * `tests/citatgrind.test.ts` ska kunna vara byte-identisk i båda repon trots
 * det: testet importerar härifrån, och bara den här raden skiljer sig.
 *
 * Kontraktet: `diff` mellan de två repons `tests/citatgrind.test.ts` ska vara
 * tom. Är den inte tom har vågorna olika krav på ordagrannhet, och då kan
 * Handlingsvågen godta ett citat som Fläskvågen hade avvisat — utan att någon
 * grind fäller. Släpps kopiorna ihop till en delad källa (se planen för
 * sammanslagningen) kan den här filen tas bort.
 */
export { normalizeForVerbatim } from "./grindar.ts";
