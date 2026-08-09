/**
 * Talen Fläskvågens prosasidor påstår något om — räknade ur datat vid varje
 * bygge.
 *
 * Samma regel som Handlingsvågens `metodtal.ts` och krönikornas
 * `kronikans-tal.ts`: ett tal i prosan är ett påstående om datat, och ett
 * påstående om datat ska vara sant nu. Skrivs det som en siffra i texten är
 * det sant den dagen och tyst osant därefter.
 *
 * Bakgrunden här (mätt 2026-08-09): metodsidan påstod oreserverat att vi
 * "länkar till filmen vid den tidpunkt orden sägs". Det gällde 14 av 32
 * löften ur tal — de övriga 18 pekar på en partisida utan tidpunkt. Meningen
 * är omskriven, och andelen slås upp i stället för att skrivas in, så att den
 * inte kan bli fel igen den dag ett löfte till skördas ur ett tal.
 */
import { getPromises } from "./data.ts";

export interface TaladeKallorTal {
  /** Aktiva löften vars källa är ett tal eller en film. */
  totalt: number;
  /** Av dem: hur många vars källänk pekar på en bestämd tidpunkt. */
  medTidpunkt: number;
}

/**
 * En källänk räknas som tidsatt när den bär en tidpunkt i adressen. Det är
 * hur en videoplattform uttrycker "börja här", och det är det enda som gör
 * påståendet "vid den tidpunkt orden sägs" kontrollerbart för en läsare.
 */
export function harTidpunkt(url: string): boolean {
  return /[?&#](?:t|start)=\d/u.test(url);
}

export function taladeKallorTal(): TaladeKallorTal {
  const talade = getPromises().filter(
    (p) => p.status === "aktiv" && p.source?.kind === "tal",
  );
  return {
    totalt: talade.length,
    medTidpunkt: talade.filter((p) => harTidpunkt(p.source.url)).length,
  };
}
