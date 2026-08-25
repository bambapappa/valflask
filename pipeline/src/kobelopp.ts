/**
 * Kostnaden som granskarens belopp ger kö-posten.
 *
 * Speglar `approve()`:s egen konstruktion när `<low> <base> <high>` anges, och
 * finns som en egen funktion just för att de två inte ska glida isär. Sätts
 * beloppet på kö-posten i förväg beskriver prövningen exakt det som publiceras;
 * sätts det vid godkännandet gör den det inte, och grinden fäller posten.
 */
export interface Kokostnad {
  type?: string | null;
  period?: string | null;
  msek_low?: number | null;
  msek_base?: number | null;
  msek_high?: number | null;
  basis?: string | null;
  basis_url?: string | null;
  method_note?: string | null;
  calculation?: string | null;
  confidence?: number | null;
  [k: string]: unknown;
}

export function koKostnad(
  fore: Kokostnad | null | undefined,
  belopp: { low: number; bas: number; high: number },
  utrakning: string,
): Kokostnad {
  return {
    ...(fore ?? {}),
    type: fore?.type ?? "utgift",
    period: fore?.period ?? "per_ar",
    msek_low: Math.round(belopp.low),
    msek_base: Math.round(belopp.bas),
    msek_high: Math.round(belopp.high),
    // `basis` säger hur förankrat beloppet är. En människa satte det här talet,
    // och etiketten får aldrig påstå att en språkmodell står bakom det.
    basis: "granskare",
    basis_url: null,
    // Noten beskriver hur beloppet kommit till och måste beskriva DET belopp
    // som står bredvid. Kö-postens gamla not beskrev ett annat tal.
    method_note: "(belopp satt av granskare)",
    calculation: utrakning,
    confidence: 0.9,
    // Ett ankare hörde till beloppet som ersattes.
    anchor_ids: [],
  };
}
