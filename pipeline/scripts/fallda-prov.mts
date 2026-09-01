/**
 * Skriver de fallna proven sist i loggen.
 *
 *   node --import tsx/esm scripts/fallda-prov.mts <tap-fil>
 *
 * Provsvitens utskrift är omkring tiotusen rader och jobbloggen går bara att
 * läsa 5 000 rader från slutet. Ett fel mitt i sviten hamnar därför utom
 * synhåll: körningen säger ATT något föll, inte VAD. Det kostade två
 * körningar, en omkörning och sex misslyckade återskapningar 2026-09-01.
 *
 * Regeln bor i `src/tapfel.ts` och prövas där. Det här är bara läsningen och
 * utskriften.
 */
import { readFileSync } from "node:fs";
import { sammanfattning } from "../src/tapfel.ts";

const fil = process.argv[2];
if (!fil) {
  console.error("Ange filen med provsvitens utskrift: fallda-prov.mts <tap-fil>");
  process.exit(2);
}

let tap: string;
try {
  tap = readFileSync(fil, "utf8");
} catch (fel) {
  // Saknas filen kom sviten aldrig igång — jobbet föll på något tidigare, och
  // DET felet står redan i loggen. Säg vad som hände och gå ur utan att fälla:
  // en hjälpsam sammanfattning ska aldrig lägga ett rött steg ovanpå det som
  // faktiskt gick sönder.
  console.log(`Ingen provutskrift att sammanfatta (${(fel as Error).message}).`);
  process.exit(0);
}

const text = sammanfattning(tap);
// Grön körning ska förbli tyst: ingen rubrik, ingen tom sammanfattning.
if (text !== "") console.log(`\n──────── fällda prov ────────\n\n${text}`);
