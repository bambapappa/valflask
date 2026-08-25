/**
 * Besluten från Avgörandets review-spår, prövade innan något verkställs.
 *
 * Kön i `needs_review.json` är 503 poster lång, och 495 av dem har inte fällts
 * av EN ENDA grind. Den ligger alltså inte kvar för att den är felaktig utan
 * för att ett maskinutvunnet löfte aldrig publiceras utan en människas ja — och
 * den vägen har gått via ett GitHub-issue per post. 270 av posterna har inte
 * ens fått sitt issue än.
 *
 * Avgörandet skriver ner beslutet; det här prövar det. Modulen avgör aldrig om
 * ett löfte ska publiceras — den prövar att beslutet går att verkställa:
 *
 *   · att posten fortfarande ligger i kön,
 *   · att CITATET är detsamma som när beslutet togs — annars gällde beslutet
 *     en annan text, och det är samma fälla som `sammanstall.mjs` varnar för,
 *   · att ett belopp satt för hand bär en uträkning,
 *   · att en avvisning bär ett skäl som går att läsa av någon annan,
 *   · att en gruppering pekar på ett löfte som lever.
 */

/** Vad Avgörandet kan svara i review-spåret. */
export const VAL = [
  "godkann",
  "godkann_belopp",
  "delat",
  "dubblett",
  "dubblett_kalkyl",
  "ejlofte",
  "gallande",
  "oklart",
] as const;
export type Val = (typeof VAL)[number];

/** De val som avvisar posten. De andra publicerar den, utom `oklart`. */
export const AVVISAR: readonly Val[] = ["dubblett", "dubblett_kalkyl", "ejlofte", "gallande"];

export const SKAL_MIN_TECKEN = 25;

export interface Beslut {
  id: string;
  spar?: string;
  val: Val | null;
  not?: string;
  citat_da?: string;
  /** Kö-postens basbelopp när beslutet togs. `null` = tom cell. */
  bas_da?: number | null;
  belopp?: { low: number; bas: number; high: number } | null;
  grupp_id?: string | null;
  narmast_da?: string | null;
  /** `dubblett_kalkyl`: det publicerade löfte som ska ta över kandidatens kostnad. */
  kalkyl_till?: string | null;
  /** Kandidatens kostnad, som den såg ut när beslutet togs. */
  kostnad_da?: Record<string, unknown> | null;
  tid?: string;
}

export interface Kopost {
  id: string;
  citat: string;
  harKostnad: boolean;
  /** Kö-postens basbelopp just nu. Jämförs med det beslutet såg. */
  bas?: number | null;
}

export interface Lofteslage {
  id: string;
  aktiv: boolean;
}

export interface Provning {
  ok: boolean;
  fel: string[];
  /** Satt när beslutet inte går att verkställa men heller inte är fel. */
  hoppas?: string;
}

/**
 * Sista beslutet per id, i filens ordning.
 *
 * Loggen är append-only och ett ändrat svar skrivs som en ny rad — den sista
 * gäller. Ett `val: null` är en ångring och tar bort posten ur högen.
 */
export function senaste(rader: readonly Beslut[]): Beslut[] {
  const karta = new Map<string, Beslut>();
  for (const b of rader) {
    if (!b?.id) continue;
    if (b.val === null || b.val === undefined) karta.delete(b.id);
    else karta.set(b.id, b);
  }
  return [...karta.values()];
}

export function provaBeslut(
  b: Beslut,
  ko: ReadonlyMap<string, Kopost>,
  loften: ReadonlyMap<string, Lofteslage>,
): Provning {
  const fel: string[] = [];
  const namn = `${b.id}`;

  if (!VAL.includes(b.val as Val)) {
    return { ok: false, fel: [`${namn}: «${b.val}» är inget val i review-spåret`] };
  }
  if (b.val === "oklart") return { ok: true, fel: [] };

  // En post som lämnat kön är varken ett fel eller något att göra. Den är
  // avgjord — av en tidigare körning, eller av någon annan som satt samma dom.
  // Att fälla hela passet för den vore att kräva att beslutsfilen städas för
  // hand efter varje verkställighet, och filen är append-only med flit.
  const post = ko.get(b.id);
  if (!post) return { ok: true, fel: [], hoppas: `${namn}: finns inte i kön längre — redan avgjord` };

  // Beslutet bär citatet som det såg ut då. Har texten ändrats sedan dess
  // gällde beslutet något annat, och då ska raden läsas om — inte verkställas.
  if (typeof b.citat_da === "string" && b.citat_da !== "" && b.citat_da !== post.citat) {
    fel.push(`${namn}: citatet har ändrats sedan beslutet togs — läs om posten`);
  }

  // «Som föreslaget» betyder det förslag människan SÅG. Har prissättningen
  // hunnit skriva ett annat belopp sedan dess är det inte längre samma ja.
  // Fällan är inte hypotetisk: kö-prissättningen satte belopp på 241 poster
  // 2026-08-24, och beslut fattade före den körningen avsåg tomma celler.
  if (b.val === "godkann" && b.bas_da !== undefined && post.bas !== undefined) {
    const da = b.bas_da ?? null;
    const nu = post.bas ?? null;
    if (da !== nu) {
      fel.push(
        `${namn}: beloppet var ${da === null ? "tomt" : da} när beslutet togs och är ${nu === null ? "tomt" : nu} nu. ` +
          "«Godkänn som föreslaget» gäller det förslag som lästes — läs om posten.",
      );
    }
  }

  if (b.val === "godkann" && !post.harKostnad) {
    fel.push(
      `${namn}: posten saknar föreslagen kostnad, så «godkänn som föreslaget» har ingenting att godkänna. ` +
        "Sätt ett belopp, eller kör pnpm ko:prissatt först.",
    );
  }

  if (b.val === "godkann_belopp") {
    const t = b.belopp;
    if (!t) fel.push(`${namn}: valet är «annat belopp» men inget spann följde med`);
    else if (!(t.low <= t.bas && t.bas <= t.high)) {
      fel.push(`${namn}: spannet ${t.low}–${t.bas}–${t.high} är inte i ordning`);
    }
    if ((b.not ?? "").trim().length < SKAL_MIN_TECKEN) {
      fel.push(
        `${namn}: ett belopp satt för hand måste bära sin uträkning. Anteckningen blir den texten, ` +
          `och den är ${(b.not ?? "").trim().length} tecken.`,
      );
    }
  }

  // Flytten ändrar ett PUBLICERAT belopp. Att målet lever prövas här; att
  // kostnaden håller prövas av `kalkylflytt.ts`, som äger den frågan.
  if (b.val === "dubblett_kalkyl") {
    if (!b.kalkyl_till) fel.push(`${namn}: valet flyttar en kalkyl men inget publicerat löfte pekades ut`);
    else if (!loften.get(b.kalkyl_till)?.aktiv) {
      fel.push(`${namn}: ${b.kalkyl_till} finns inte eller är inte aktivt — en indragen post publicerar ingenting`);
    }
    if (!post.harKostnad && !b.kostnad_da) {
      fel.push(`${namn}: kandidaten har ingen kostnad att flytta`);
    }
  }

  if (b.val === "delat") {
    if (!b.grupp_id) fel.push(`${namn}: valet är «gruppera» men inget löfte pekades ut`);
    else if (!loften.get(b.grupp_id)?.aktiv) {
      fel.push(`${namn}: ${b.grupp_id} finns inte eller är inte aktivt — en grupp kan inte peka på ett indraget löfte`);
    }
  }

  if (AVVISAR.includes(b.val as Val)) {
    const skal = avvisningsskal(b);
    if (skal.trim().length < SKAL_MIN_TECKEN) {
      fel.push(
        `${namn}: avvisningen måste bära ett skäl som går att läsa av någon annan. ` +
          "Skälet sparas i avvisade.json och hindrar att skörden tar in samma mening igen.",
      );
    }
  }

  return { ok: fel.length === 0, fel };
}

/**
 * Skälet som följer med en avvisning: en genererad kärna plus människans not.
 *
 * VARFÖR KÄRNAN GENERERAS. Skälet hamnar i `avvisade.json` och läses av nästa
 * människa som möter samma mening i skörden. Ett skäl som bara lyder «retorik»
 * säger ingenting till den läsaren. Men att kräva en lång not av den som avgör
 * är fel väg: den som betat av trehundra rader skriver «retorik» därför att det
 * ÄR skälet, och resten är ord som går att generera.
 *
 * Så varje val bär sin egen kärnmening, och noten läggs till. En dubblett får
 * dessutom det publicerade löftets id inskrivet — utan det måste nästa läsare
 * göra om uppslaget.
 *
 * Mätt 2026-08-25: nio av 338 beslut föll på ett notkrav på 25 tecken, med
 * noter som «utförligare kalkyl» och «tydligare kalkyl». Kravet mätte fel sak.
 */
const KARNA: Partial<Record<Val, (b: Beslut) => string>> = {
  dubblett: (b) => {
    const id = (b.narmast_da ?? "").split(":")[0];
    return id
      ? `Samma parti har redan åtagandet publicerat, i ${id}.`
      : "Samma parti har redan åtagandet publicerat.";
  },
  dubblett_kalkyl: (b) =>
    `Samma parti har redan åtagandet publicerat, i ${b.kalkyl_till}. Kö-postens uträkning var ` +
    "bättre grundad än den som stod där, och är flyttad dit i stället för att kastas med posten.",
  ejlofte: () =>
    "Citatet bär ingen utfästelse: det är retorik, en problembeskrivning eller någon annans ord, " +
    "och inte ett åtagande partiet gör.",
  gallande: () =>
    "Beskriver politik som redan gäller, alltså inget nytt åtagande för mandatperioden.",
};

export function avvisningsskal(b: Beslut): string {
  const not = (b.not ?? "").trim();
  const karna = KARNA[b.val as Val]?.(b) ?? "";
  if (karna === "") return not;
  return not === "" ? karna : `${karna} ${not}`;
}

/** Argumenten `approve()` ska ha för ett godkännande. */
export function godkannandeArgument(b: Beslut): string[] {
  if (b.val === "godkann") return [b.id];
  if (b.val === "delat") return [b.id, "--group", b.grupp_id!];
  if (b.val === "godkann_belopp") {
    const t = b.belopp!;
    return [b.id, String(t.low), String(t.bas), String(t.high), "--calc", (b.not ?? "").trim()];
  }
  throw new Error(`${b.id}: ${b.val} är inget godkännande`);
}
