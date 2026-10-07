/** Äldre kalkylskrivare saknar versionsbunden ersättning av strukturerad härledning. */
export function provaAldreKalkylbyte(...kostnader: unknown[]): string[] {
  return kostnader.some(c => c !== null && typeof c === "object" && Object.hasOwn(c, "harledning"))
    ? ["Strukturerad härledning måste omprövas med kalkylen. Denna äldre skrivare saknar stöd för ett beslut om ny härledning och får inte återanvända eller ta bort den."] : [];
}
export function kravAldreKalkylbyte(...kostnader: unknown[]): void {
  const fel = provaAldreKalkylbyte(...kostnader);
  if (fel.length) throw new Error(fel.join("; "));
}
