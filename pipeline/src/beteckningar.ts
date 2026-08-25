/**
 * Skriver om interna beteckningar i publicerad text till ord.
 *
 * `cost.calculation` och `cost.method_note` visas på löftessidan. Ett löftes-id
 * eller en regelkod där säger ingenting till en läsare — «jämförbart löfte
 * p-2026-1924» och «enligt regel 13» är hänvisningar till vårt eget bokföring.
 * Spärren i `publicerad-text.ts` fäller dem, och 103 kö-poster satt fast bakom
 * den 2026-08-25: prissättningen skrev dem, grinden vägrade publicera dem, och
 * ingen väg fanns däremellan.
 *
 * TVÅ SLAGS BETECKNING, TVÅ SKILDA LAGNINGAR.
 *
 * Ett LÖFTES-ID pekar på något verkligt, och den hänvisningen ska inte
 * försvinna — den ska byta form. Numret lyfts ur texten till `cost.anchor_ids`,
 * där sajten renderar det som en länk, och i texten står i stället vad löftet
 * handlar om. Läsaren får både orden och vägen vidare.
 *
 * En REGELKOD pekar på en rad i vår egen prompt, och den raden finns inte för
 * läsaren att slå upp. Där är lagningen att skriva ut vad regeln säger.
 */

/**
 * Reglerna som prissättningen hänvisar till, som NAMN och inte som meningar.
 *
 * Ett första utkast skrev ut hela regeln — «regeln att ett brett
 * uppräkningslöfte prissätts inte, eftersom delarna ligger på partiets egna
 * specifika löften» — och det gick sönder i löpande text: «Enligt regeln att
 * … ligger på partiets egna specifika löften behandlas det som
 * inriktningslöfte» har två satser som slåss om samma verb.
 *
 * Ett namn glider in var som helst i en mening, och sammanhanget bär resten:
 * texten runt omkring säger nästan alltid redan att beloppet är noll.
 */
export const REGELORD: Record<string, string> = {
  "9": "kostnadsregeln om lagar, förbud och regleringar",
  "10": "kostnadsregeln om utrednings- och planlöften",
  "11": "kostnadsregeln om netto och inte brutto",
  "13": "kostnadsregeln om breda uppräkningslöften",
  "14": "kostnadsregeln om att partiets egen siffra gäller",
  "15": "kostnadsregeln om en utpekad åtgärd utan nivå",
  "16": "kostnadsregeln om straffskärpningar",
  "17": "kostnadsregeln om statens eget beredningsarbete",
};

const ID = /\bp-20\d\d-\d{4}\b/gu;
const REGELKOD = /\bregel(?:n|erna)?\s+(\d+)[a-z]?\b/giu;

export interface Loftesuppgift {
  id: string;
  title?: string;
  parties?: readonly string[];
  status?: string;
}

/** Löftet beskrivet så att en läsare känner igen det. */
export function medOrd(l: Loftesuppgift | undefined, id: string): string {
  if (!l) return "ett annat löfte";
  // Versaler per partikod, inte på hela strängen: «S och V», aldrig «S OCH V».
  const parti = (l.parties ?? []).map((x) => x.toUpperCase()).join(" och ");
  const rubrik = (l.title ?? "").trim();
  if (rubrik === "") return parti === "" ? "ett annat löfte" : `${parti}:s löfte`;
  // Rubriken med liten begynnelsebokstav läser sig som en beskrivning i löpande
  // text: «Moderaternas löfte om sänkt skatt på arbete», inte «… om Sänkt».
  const beskrivning = rubrik.charAt(0).toLowerCase() + rubrik.slice(1);
  void id;
  return parti === "" ? `löftet om ${beskrivning}` : `${parti}:s löfte om ${beskrivning}`;
}

export interface Omskrivning {
  text: string;
  /** Löftes-id som lyfts ur texten och hör hemma i `anchor_ids`. */
  ankare: string[];
  /** Regelkoder som skrivits ut i ord. */
  regler: string[];
}

/**
 * Texten utan interna beteckningar.
 *
 * Ett id som inte går att slå upp blir «ett annat löfte» — vagt, men sant, och
 * det är fortfarande bättre än ett nummer. Det ankaret sätts INTE, för ett
 * ankare måste peka på något som finns.
 */
export function skrivOmBeteckningar(
  text: string | null | undefined,
  loften: ReadonlyMap<string, Loftesuppgift>,
): Omskrivning {
  const rå = text ?? "";
  const ankare: string[] = [];
  const regler: string[] = [];

  let ut = rå.replace(ID, (id) => {
    const l = loften.get(id);
    if (l && (l.status ?? "aktiv") === "aktiv" && !ankare.includes(id)) ankare.push(id);
    return medOrd(l, id);
  });

  ut = ut.replace(REGELKOD, (hela, nr: string) => {
    const ord = REGELORD[nr];
    if (ord === undefined) return hela;
    if (!regler.includes(nr)) regler.push(nr);
    return ord;
  });

  // Omskrivningen kan lämna dubbla blanksteg efter ett borttaget nummer.
  ut = ut.replace(/[ \t]{2,}/gu, " ").replace(/\s+([.,;:])/gu, "$1").trim();
  return { text: ut, ankare, regler };
}
