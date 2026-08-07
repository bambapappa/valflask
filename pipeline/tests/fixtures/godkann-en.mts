/**
 * Godkänner kö-post 0 i den datakatalog som anges som argument.
 *
 * Finns för att `approve()` avslutar processen när grinden fäller en post, och
 * en process som avslutar sig går inte att prova inifrån testet. Testet startar
 * den här i stället och läser utfallskoden — så det som prövas är att grinden
 * verkligen sitter i godkännandevägen, inte bara att den fungerar för sig.
 */
import { approve } from "../../src/review.ts";

approve(["0"], process.argv[2]!);
