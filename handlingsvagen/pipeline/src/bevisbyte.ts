/**
 * Byte av bevis på en REDAN PUBLICERAD koppling.
 *
 * `godkann-lista` når bara kön. Är kopplingen godkänd är citatet publicerat
 * intill den, och ett byte är därför en **rättelse** — inte en omvägning.
 * Tyst rättelse är förbjuden: bytet kräver en post i `data/rattelser.json`
 * och lämnar spår i kopplingens motivering.
 *
 * De 111 bevisrättningarna 2026-08-06 gjordes med engångsskript som ingen
 * testsvit nådde, och 663 motioner plus 110 frågor väntar fortfarande. Den
 * här modulen är samma kontroll, men i pipelinen där testerna når den.
 *
 * Ren logik utan fil- och nätverksåtkomst — källtexten hämtas av anroparen
 * (scripts/bevis-byt.mts), precis som `provaNyttBevis` kräver.
 */
import { CITAT_MIN_TECKEN, normalizeForVerbatim } from "./grindar.ts";
import type { GrindKontext } from "./grindar.ts";
import type { KopplingPost } from "./granskning.ts";

/** En rad i bytesfilen: vilken koppling, vilket nytt citat, och ett eventuellt undantag. */
export interface Byte {
  id: string;
  citat: string;
  /**
   * Skälet till att ett citat som INTE står i handlingens egen del ändå får
   * bytas in — anslagsmotionens yrkande anvisar bara medel enligt en tabell
   * och visar mindre än brödtexten gör.
   *
   * Krävs som utskriven text, aldrig som en flagga. Vid genomgången
   * 2026-08-06 gick elva kopplingar in på just det undantaget, var och en med
   * sitt skäl nedskrivet. Ett undantag som inte behöver motiveras blir ett
   * undantag man tar av vana.
   */
  brodtextSkal?: string;
}

/** Vad kontrollen fann. `iHandlingen` är odefinierad när lydelserna inte gick att hämta. */
export interface Bytesprovning {
  ok: boolean;
  skal: string[];
  iHandlingen: boolean | undefined;
  /** Sant när bytet gick igenom på ett utskrivet undantag i stället för på grinden. */
  paUndantag: boolean;
}

/**
 * Prövar ett bevisbyte lika hårt som ett godkännande gör, plus en kontroll
 * till: att citatet står i handlingens EGEN del.
 *
 * Ordagrannheten är absolut och lossas aldrig. Att citatet står i handlingens
 * egen del är däremot en bedömning en människa får göra om — men bara med
 * skälet utskrivet, och då säger utfallet det.
 */
export function provaByte(
  byte: Byte,
  nuvarandeCitat: string,
  kalltext: string,
  handlingstext: GrindKontext["handlingstext"] | undefined,
): Bytesprovning {
  const skal: string[] = [];
  const c = normalizeForVerbatim(byte.citat);

  // Ett byte till samma citat rättar ingenting, men skulle ändå skriva en post
  // i rättelseloggen och en not i motiveringen. En rättelselogg full av
  // rättelser som inte rättade något är svårare att lita på än en kort.
  if (c === normalizeForVerbatim(nuvarandeCitat)) {
    skal.push("det nya citatet är detsamma som det nuvarande — det finns ingenting att rätta");
  }

  if (c.length < CITAT_MIN_TECKEN) {
    skal.push(`citatet har ${c.length} tecken — minst ${CITAT_MIN_TECKEN} krävs`);
  }
  if (c !== "" && !normalizeForVerbatim(kalltext).includes(c)) {
    skal.push(
      "citatet står inte ordagrant i riksdagsdokumentet. Skriv aldrig av det för hand — " +
        "hämta lydelsen ur riksdagens egna data. Står det ändå inte där kan det vara " +
        "textutvinningen som klippt sönder ett avstavat ord",
    );
  }

  let iHandlingen: boolean | undefined;
  let paUndantag = false;
  if (c !== "" && handlingstext && handlingstext.delar.length > 0) {
    iHandlingen = handlingstext.delar.some((del) => normalizeForVerbatim(del).includes(c));
    if (!iHandlingen) {
      if (byte.brodtextSkal) {
        paUndantag = true;
      } else {
        skal.push(
          handlingstext.sort === "yrkanden"
            ? `citatet står inte i något av handlingens ${handlingstext.delar.length} yrkanden — ` +
              "det är brödtext, och brödtexten argumenterar för handlingen i stället för att vara den. " +
              "Visar yrkandet mindre än citatet gör: skriv skälet efter citatet, åtskilt med tabb"
            : "citatet står varken i voteringspunktens beslutstext eller i utskottets sammanfattning " +
              "av det punkten antar. Skriv skälet efter citatet, åtskilt med tabb, om bytet ändå ska göras",
        );
      }
    }
  }

  return { ok: skal.length === 0, skal, iHandlingen, paUndantag };
}

/** Spåret bytet lämnar i kopplingens motivering — bytet får aldrig vara osynligt. */
export function bytesnot(byte: Byte, datum: string): string {
  return byte.brodtextSkal
    ? `Beviset byttes ${datum} mot handlingens egen lydelse, hämtad ur riksdagens data och ` +
        `kontrollerad ord för ord. Citatet står inte bland handlingens egna lydelser, och togs ` +
        `in på ett mänskligt beslut: ${byte.brodtextSkal}`
    : `Beviset byttes ${datum} mot handlingens egen lydelse, hämtad ur riksdagens data och ` +
        `kontrollerad ord för ord.`;
}

/**
 * Kopplingen med det nya beviset.
 *
 * Bara `bevis.citat` och `method_note` rör sig. Riktningen, målet och
 * handlingen står stilla — det är samma dom, buren av ett annat stycke ur
 * samma dokument. Därför behöver domarna inte räknas om efter ett byte.
 */
export function bytBevis(koppling: KopplingPost, byte: Byte, datum: string): KopplingPost {
  return {
    ...koppling,
    bevis: { ...koppling.bevis, citat: byte.citat },
    method_note: `${koppling.method_note} ${bytesnot(byte, datum)}`.trim(),
  };
}

/**
 * En rättelsepost för hela genomgången — inte en per koppling.
 *
 * "Rättelser samlas": en systematisk kvalitetshöjning blir EN post. `affects`
 * måste namnge varje berört löfte, för rättelsenoten på löftessidan väljs
 * genom att söka löftets id i just det fältet.
 */
export function rattelsePost(
  byten: { koppling: KopplingPost; byte: Byte }[],
  datum: string,
): { date: string; affects: string; what: string; why: string; commit: string } {
  const loften = [...new Set(byten.map((b) => b.koppling.promise_id).filter((x): x is string => !!x))].sort();
  const undantag = byten.filter((b) => b.byte.brodtextSkal).length;

  const påUndantagText =
    undantag > 0
      ? ` ${undantag} av dem står inte bland handlingens egna lydelser och togs in på ett ` +
        "mänskligt beslut, med skälet utskrivet i varje enskild motivering."
      : "";

  return {
    date: datum,
    affects:
      `Handlingsvågens rutnät och löftessidorna för ${loften.join(", ")} — ` +
      `${byten.length} ${byten.length === 1 ? "bevis" : "bevis"} utbytta`,
    what:
      `Vi visar nu en annan del av samma riksdagsdokument som belägg för ${byten.length} ` +
      `${byten.length === 1 ? "koppling" : "kopplingar"} mellan ett löfte och en handling. ` +
      "Det gamla citatet stod ordagrant i dokumentet, men det visade argumenten för handlingen " +
      "i stället för handlingen själv — motionens brödtext i stället för dess yrkande, frågans " +
      "bakgrund i stället för frågan. Varje nytt citat är hämtat ur riksdagens egna data och " +
      `kontrollerat ord för ord mot källan.${påUndantagText}`,
    why:
      "Ett belägg ska visa vad ledamoten eller partiet faktiskt gjorde. En motions handling är " +
      "dess yrkande; brödtexten argumenterar för yrkandet och är inte i sig en handling. " +
      "Bedömningen av kopplingen är oförändrad — det är belägget som bytt stycke, inte domen.",
    // Backfillas i en andra commit, samma mönster som övriga dataändringar.
    commit: "0000000",
  };
}
