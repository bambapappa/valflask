/** Milstolpen är regeringens formella tillträde. Datum sätts först med källa. */
export interface Regeringsgrans { datum: string | null; kalla: string | null; }
export const REGERINGSGRANS_2026: Regeringsgrans = { datum: null, kalla: null };

export function verifieradRegeringsgrans(grans: Regeringsgrans): string | null {
  if (grans.datum === null && grans.kalla === null) return null;
  const datum = grans.datum;
  if (!datum || !/^\d{4}-\d{2}-\d{2}$/.test(datum) || datum < "2026-09-13") throw new Error("Ogiltigt regeringsdatum");
  const parsed = new Date(`${datum}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== datum) throw new Error("Ogiltigt regeringsdatum");
  const url = new URL(grans.kalla ?? "");
  if (url.protocol !== "https:" || url.username || url.password || !["regeringen.se", "www.regeringen.se", "riksdagen.se", "www.riksdagen.se"].includes(url.hostname)) throw new Error("Regeringsdatumet saknar officiell källa");
  return datum;
}
