/**
 * Ankaret och uträkningen på en kö-post, satta före godkännandet.
 *
 * VARFÖR. Ankarkravet (`ankarkravet.ts`) säger att ett lånat belopp ska gå att
 * följa: antingen genom `group_id`, när det är samma reform, eller genom
 * `cost.anchor_ids`, när det är ett annat löfte vars belopp lånas som
 * riktmärke. `harledAnkare` fyller fältet av sig själv när kö-prissättningen
 * hade EN jämförbar post vars belopp står i texten. Den ger upp — med flit —
 * när flera matchar eller ingen gör det, och då blir posten liggande.
 *
 * Här tar en människa vid. Två slags rader, och de löser olika fel:
 *
 *  · **Ankaret.** Beloppet ÄR lånat, och läsningen har fastställt varifrån.
 *    Raden namnger löftet, och kravet är uppfyllt av ett strukturerat fält som
 *    sajten renderar som en länk.
 *
 *  · **Omskrivningen.** Beloppet är INTE lånat — det står på egen aritmetik, och
 *    meningen om «jämförbara löften» är utsmyckning som texten råkade dra på
 *    sig. Då är ankaret fel lagning: att peka ut ett löfte talet inte kommer
 *    ifrån vore att uppfinna en härkomst. Raden skriver om uträkningen så att
 *    den inte längre påstår ett lån.
 *
 * SPÄRREN SOM GÖR DET TILL BOKFÖRING: ett ankare godtas bara om ankarets
 * basbelopp FAKTISKT STÅR i uträkningen. Är talet inte där kommer beloppet inte
 * därifrån, och hänvisningen vore en gissning. Det är samma prov `harledAnkare`
 * gör automatiskt; skillnaden är att en människa får peka ut vilket av flera
 * löften som avses, inte att provet faller bort.
 */
import { LANAR_BELOPP, type Jamforbar } from "./ankarkravet.ts";
import { UTRAKNING_MAX_TECKEN } from "./kalkylflytt.ts";
import { INTERN_BETECKNING } from "./publicerad-text.ts";

export const SKAL_MIN_TECKEN = 25;

export interface Ankarmal extends Jamforbar {
  status?: string;
  type?: string | null;
  title?: string;
}

/** Kö-postens kostnad, så mycket av den som ankarsättningen rör. */
export interface Kokostnadslage {
  type?: string | null;
  period?: string | null;
  msek_base?: number | null;
  calculation?: string | null;
  anchor_ids?: readonly string[] | null;
}

export interface Koankarrad {
  id: string;
  /**
   * Löftena beloppet lånas av, kommaåtskilda. Tomt när raden bara skriver om
   * uträkningen.
   *
   * FLERA ANKARE ÄR TILLÅTET, och det är ingen uppluckring. En uträkning som
   * säger «jämförbara löften om ny kärnkraft (kd, sd) ligger på ~2 000 mkr/år»
   * lånar av allihop, och tre av dem står faktiskt på 2 000. Att peka ut ETT av
   * dem vore att välja godtyckligt; att peka ut alla tre är vad meningen säger.
   * Varje ankare prövas för sig, så priset för att namnge fler är att fler
   * måste hålla.
   */
  ankare: string;
  /** Ny uträkning. Tom när raden bara sätter ankaret. */
  utrakning: string;
  skal: string;
}

export interface Koankarprovning {
  ok: boolean;
  fel: string[];
  hoppas?: string;
}

/**
 * Talen i en uträkning, normaliserade till miljoner kronor.
 *
 * «8 mdkr» och «8 000 mkr» är samma tal. Samma läsning som `harledAnkare` gör,
 * och delad med den så att de två inte kan säga olika saker om samma text.
 */
export function beloppITexten(text: string | null | undefined): Set<number> {
  const tal = new Set<number>();
  for (const m of (text ?? "").matchAll(/(\d[\d\s ]*(?:[.,]\d+)?)\s*(mdkr|miljard\w*|mkr|msek|miljon\w*)/giu)) {
    const rå = Number(m[1]!.replace(/[\s ]/gu, "").replace(",", "."));
    if (!Number.isFinite(rå)) continue;
    tal.add(/^m(d|iljard)/iu.test(m[2]!) ? rå * 1000 : rå);
  }
  return tal;
}

/** Uträkningen som posten kommer att bära när raden är körd. */
export function nyUtrakning(fore: Kokostnadslage, rad: Koankarrad): string {
  return rad.utrakning.trim() === "" ? (fore.calculation ?? "") : rad.utrakning.trim();
}

/** Ankarraden uppdelad, tomma fält bortsorterade. */
export function ankarlista(rad: Koankarrad): string[] {
  return rad.ankare.split(",").map((s) => s.trim()).filter((s) => s !== "");
}

export function provaKoankarrad(
  rad: Koankarrad,
  post: Kokostnadslage | undefined,
  malen: ReadonlyMap<string, Ankarmal>,
): Koankarprovning {
  const fel: string[] = [];
  const namn = rad.id;

  if (post === undefined) {
    return { ok: true, fel: [], hoppas: `${namn}: finns inte i kön längre — redan avgjord` };
  }
  if (rad.ankare.trim() === "" && rad.utrakning.trim() === "") {
    fel.push(`${namn}: raden varken sätter ett ankare eller skriver om uträkningen`);
    return { ok: false, fel };
  }
  if (rad.skal.trim().length < SKAL_MIN_TECKEN) {
    fel.push(
      `${namn}: skälet är ${rad.skal.trim().length} tecken, minst ${SKAL_MIN_TECKEN} krävs. ` +
        "Skriv varför beloppet kommer därifrån, eller varför det inte är lånat.",
    );
  }

  const text = nyUtrakning(post, rad);
  if (text.trim() === "") fel.push(`${namn}: uträkningen är tom, och den visas publikt`);
  if (text.length > UTRAKNING_MAX_TECKEN) {
    fel.push(`${namn}: uträkningen är ${text.length} tecken, taket är ${UTRAKNING_MAX_TECKEN}`);
  }
  if (INTERN_BETECKNING.test(text)) {
    fel.push(`${namn}: uträkningen bär en intern beteckning, och den möter läsaren. Skriv hänvisningen i ord.`);
  }
  if (INTERN_BETECKNING.test(rad.skal)) {
    fel.push(`${namn}: skälet bär en intern beteckning. Skriv vad som faktiskt sker i stället.`);
  }

  const ankaren = ankarlista(rad);
  if (ankaren.length > 0) {
    const tal = beloppITexten(text);
    for (const a of ankaren) {
      const mal = malen.get(a);
      if (mal === undefined) {
        fel.push(`${namn}: ankaret ${a} finns inte i promises.json`);
        continue;
      }
      if ((mal.status ?? "aktiv") !== "aktiv") {
        fel.push(`${namn}: ankaret ${a} har status ${mal.status} — ett indraget löfte belägger ingenting`);
      }
      if ((mal.msek_base ?? 0) === 0) {
        fel.push(`${namn}: ankaret ${a} bär inget belopp, så det finns inget att låna`);
      }
      if (mal.period !== undefined && post.period !== undefined && mal.period !== post.period) {
        fel.push(
          `${namn}: ankaret ${a} räknas ${mal.period} och posten ${post.period}. ` +
            "Ett lån över olika perioder är inte samma tal.",
        );
      }
      // Spärren. Se modulhuvudet: står inte ankarets tal i texten kommer
      // beloppet inte därifrån.
      if ((mal.msek_base ?? 0) !== 0 && !tal.has(mal.msek_base)) {
        fel.push(
          `${namn}: ankaret ${a} står på ${mal.msek_base} mkr, och det talet finns inte i uträkningen. ` +
            "Kommer beloppet därifrån ska det synas i texten; gör det inte är hänvisningen en gissning.",
        );
      }
    }
  } else if (LANAR_BELOPP.test(text) && (post.msek_base ?? 0) !== 0) {
    // Omskrivningsraden ska ta bort lånepåståendet. Gör den inte det står
    // posten kvar med exakt det fel den skulle laga.
    fel.push(
      `${namn}: uträkningen påstår fortfarande ett lån från ett jämförbart löfte, men inget ankare pekas ut. ` +
        "Antingen namnge löftet, eller skriv om meningen så att den inte påstår ett lån.",
    );
  }

  return { ok: fel.length === 0, fel };
}

/** Kostnaden som raden ger posten. */
export function sattAnkare(fore: Kokostnadslage, rad: Koankarrad): Kokostnadslage {
  const ut: Kokostnadslage = { ...fore, calculation: nyUtrakning(fore, rad) };
  const ankaren = ankarlista(rad);
  if (ankaren.length > 0) ut.anchor_ids = ankaren;
  return ut;
}
