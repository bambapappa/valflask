/**
 * Krönikornas tal — statisk text, färska siffror.
 *
 * **Mänskligt beslut 2026-08-09**, som ersätter «krönikor är ögonblicksbilder»
 * som huvudregel: *texten och redogörelsen är statiska, beloppen och antalen
 * dynamiska.* En krönika behåller då sitt värde för läsaren i stället för att
 * bli ett museiföremål, och rättelseloggen slipper en post varje gång en siffra
 * någon annanstans rättas.
 *
 * Skälet är att den gamla regeln kostade fel sak. Ett belopp som rättas på ett
 * löfte flyttar rikssumman, och rikssumman står i varje krönika. Med
 * ögonblicksregeln blev följden antingen en rättelsepost per krönika och
 * rättelse — en logg full av poster som inte rättar något läsaren letar efter —
 * eller krönikor som tyst blev osanna. Genereringen pausades 2026-08-06 just
 * därför att ingen väg ur det fanns.
 *
 * Lösningen är att skilja på två sorters innehåll i samma text:
 *
 * - **Redogörelsen** — vad veckan handlade om, vilka partier som lovade vad,
 *   och hur vi såg på det. Den är skriven vid ett tillfälle och ändras aldrig;
 *   det vore att skriva om historien.
 * - **Talen** — summor, gap och antal. De är *påståenden om datat*, inte om
 *   veckan, och ett påstående om datat ska vara sant nu.
 *
 * Därför skrivs talen inte in i texten. De skrivs som platshållare och slås upp
 * när sidan byggs. Det som stod när krönikan skrevs sparas kvar bredvid, så att
 * «Då och nu»-rutan kan visa båda — en läsare ska kunna se att en siffra rört
 * sig, inte bara se den nya.
 *
 * En rättelse behövs fortfarande när **redogörelsen** är fel: har vi skrivit att
 * ett parti lovade något det inte lovade är det ett fel i texten, och texten
 * rättas synligt. Det är den sortens fel en rättelselogg är till för.
 */

/** Vad en krönika kan slå upp. Fler tal läggs till här, inte i texten. */
export interface KronikansUnderlag {
  /** Summan av alla aktiva löften för mandatperioden, i miljoner kronor. */
  total_msek: number;
  /** Summan minus regeringens reformbudget, i miljoner kronor. */
  gap_msek: number;
  /** Antal aktiva löften. */
  antal_loften: number;
  /** Ett enskilt löftes belopp för mandatperioden, per id. */
  belopp: Record<string, number | undefined>;
}

/** En platshållare som inte gick att slå upp — och varför. */
export interface OloststPlatshallare {
  platshallare: string;
  skal: string;
}

/**
 * Platshållarnas form: `{total}`, `{gap}`, `{antal}` och `{belopp:p-2026-0576}`.
 *
 * Klammer är valt därför att markdown inte ger dem någon egen betydelse, så en
 * platshållare som **inte** blir uppslagen syns som skräptext i stället för att
 * försvinna tyst. Det är avsiktligt: ett tal som tappats bort ska vara synligt,
 * inte osynligt.
 */
const PLATSHALLARE = /\{(total|gap|antal|belopp:[a-z0-9-]+)\}/gu;

/**
 * Miljoner kronor som en läsare läser dem: 3 512 858 → "3 513 miljarder kronor".
 *
 * Tusentalsavskiljaren är ett **hårt blanksteg** (U+00A0), vilket är vad
 * `toLocaleString("sv-SE")` ger och vad sajten vill ha: ett tal ska inte kunna
 * brytas mitt itu vid radslut. Att det inte är ett vanligt blanksteg syns inte
 * i en diff, så det står skrivet här.
 */
export function somText(msek: number): string {
  const miljarder = msek / 1000;
  if (Math.abs(miljarder) >= 10) {
    return `${Math.round(miljarder).toLocaleString("sv-SE")} miljarder kronor`;
  }
  if (Math.abs(miljarder) >= 1) {
    return `${miljarder.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} miljarder kronor`;
  }
  return `${Math.round(msek).toLocaleString("sv-SE")} miljoner kronor`;
}

/**
 * Texten med talen uppslagna mot dagens data.
 *
 * Returnerar också de platshållare som inte gick att lösa. En krönika med en
 * olöst platshållare ska inte byggas tyst — hellre ett synligt fel i en
 * förhandsvisning än en publicerad text som saknar sitt tal.
 */
export function losUpp(
  body: string,
  underlag: KronikansUnderlag,
): { text: string; olosta: OloststPlatshallare[] } {
  const olosta: OloststPlatshallare[] = [];
  const text = body.replace(PLATSHALLARE, (hel, namn: string) => {
    if (namn === "total") return somText(underlag.total_msek);
    if (namn === "gap") return somText(underlag.gap_msek);
    if (namn === "antal") return underlag.antal_loften.toLocaleString("sv-SE");
    const id = namn.slice("belopp:".length);
    const belopp = underlag.belopp[id];
    if (belopp === undefined) {
      olosta.push({
        platshallare: hel,
        skal:
          `${id} finns inte bland de aktiva löftena. Är det tillbakadraget bör meningen ` +
          "skrivas om — ett löfte som inte längre är publicerat har inget belopp att visa.",
      });
      return hel;
    }
    return somText(belopp);
  });
  return { text, olosta };
}

/**
 * Bär texten några tal som borde vara platshållare?
 *
 * En hjälp åt den som skriver eller granskar en krönika, inte en grind: den
 * letar efter skrivna belopp i löptexten, alltså precis det som fryser fast en
 * siffra. Den kan ha fel åt båda hållen — «10 miljarder kronor 2026» kan vara
 * regeringens beslutade tillskott, som *ska* stå still — så den fäller inget,
 * den frågar.
 */
export function skrivnaBelopp(body: string): string[] {
  const utan = body.replace(PLATSHALLARE, "");
  return [...utan.matchAll(/\b\d[\d\s ]*(?:,\d+)?\s*(?:miljoner|miljarder)\s+kronor/gu)].map((m) =>
    m[0].replace(/\s+/gu, " ").trim(),
  );
}
