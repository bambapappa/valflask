/**
 * Avvisningsminnet — vad vi redan sagt nej till.
 *
 * En avvisning lämnade förut inget spår. Kandidaten försvann ur kön, issuet
 * stängdes, och nästa skörd hittade samma mening i samma dokument och lade in
 * den på nytt. Det var inte en teori: tre kandidater avvisades 3 augusti och låg
 * tillbaka i kön 4 augusti, två av dem för tredje gången. Kostnaden är
 * dubbelarbete i varje genomgång, och risken är att en post till slut godkänns
 * av misstag för att ingen minns att den redan är prövad.
 *
 * **Mänskligt beslut 2026-08-09**, två delar:
 *
 * 1. **Nyckeln är käll-URL plus normaliserat citat.** Citatet ordagrant är för
 *    känsligt — ett ändrat kommatecken eller ett CMS som byter citattecken ger
 *    en ny post, och då minns minnet ingenting. URL:en ensam är för trubbig: en
 *    sida bär ofta flera löften, och att avvisa ett vore att avvisa alla.
 * 2. **En avvisning ska gå att häva.** Ett löfte som upprepas i valmanifestet
 *    väger tyngre än samma mening i ett tal, och det ska gå att ompröva utan att
 *    historiken skrivs om. Därför raderas ingenting: hävningen läggs till som
 *    en egen uppgift på posten, med sitt eget datum och skäl.
 *
 * Minnet säger aldrig nej åt en människa. Det säger «det här har vi sett förr,
 * och så här löd beslutet» — vilket är skillnaden mellan att slippa
 * dubbelarbete och att låsa in sig i ett gammalt beslut.
 */
import { createHash } from "node:crypto";
import { normalizeForVerbatim } from "./gates.ts";

/** En avvisad kandidat, och beslutet om den. */
export interface Avvisning {
  /** Käll-URL plus normaliserat citat, hashad. Se `avvisningsnyckel`. */
  nyckel: string;
  /** Adressen som den såg ut när beslutet fattades — för en människa att läsa. */
  url: string;
  /** Citatet i sin oputsade form, av samma skäl. */
  citat: string;
  skal: string;
  datum: string;
  /**
   * Hävningen, när beslutet omprövats. Posten ligger kvar med sitt
   * ursprungliga skäl — historik skrivs inte om i efterhand.
   */
  havd?: { datum: string; skal: string };
}

/**
 * Nyckeln: käll-URL plus normaliserat citat.
 *
 * Citatet normaliseras hårdare än citatgrindens jämförelse gör. Grinden ska
 * skilja på innehåll och får därför bara neutralisera typografi; minnet ska
 * känna igen *samma mening igen* efter att ett CMS bytt tecken, en skörd tagit
 * med ett inledande tankstreck eller någon rättat ett kommatecken. Därför fälls
 * också gemener/versaler, skiljetecken och upprepade blanksteg här.
 *
 * Det är avsiktligt en envägsfunktion: minnet ska kunna växa utan att bli en
 * andra kopia av kandidaterna vi sagt nej till.
 */
export function avvisningsnyckel(url: string | null | undefined, citat: string | null | undefined): string {
  const adress = (url ?? "").trim().replace(/\/+$/u, "").toLowerCase();
  const text = normalizeForVerbatim(citat ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return "av:" + createHash("sha256").update(`${adress}\n${text}`, "utf8").digest("hex").slice(0, 16);
}

/** Posten för en kandidat, hävd eller inte — eller `undefined` om den aldrig avvisats. */
export function slaUpp(
  minne: Avvisning[],
  url: string | null | undefined,
  citat: string | null | undefined,
): Avvisning | undefined {
  const n = avvisningsnyckel(url, citat);
  return minne.find((a) => a.nyckel === n);
}

/**
 * Ska kandidaten hållas ute ur kön?
 *
 * En hävd avvisning håller ingen ute — det är hela poängen med att kunna häva.
 */
export function arAvvisad(
  minne: Avvisning[],
  url: string | null | undefined,
  citat: string | null | undefined,
): boolean {
  const post = slaUpp(minne, url, citat);
  return post !== undefined && post.havd === undefined;
}

/**
 * Minnet med kandidaten avvisad.
 *
 * Avvisas något som redan står i minnet skrivs skälet och datumet om, och en
 * eventuell hävning faller bort — det är en ny avvisning av något vi tidigare
 * släppt in igen, och då gäller det nya beslutet.
 */
export function avvisa(
  minne: Avvisning[],
  url: string,
  citat: string,
  skal: string,
  datum: string,
): Avvisning[] {
  const nyckel = avvisningsnyckel(url, citat);
  const post: Avvisning = { nyckel, url, citat, skal, datum };
  const i = minne.findIndex((a) => a.nyckel === nyckel);
  if (i === -1) return [...minne, post];
  const ut = [...minne];
  ut[i] = post;
  return ut;
}

/**
 * Minnet med avvisningen hävd.
 *
 * Returnerar `undefined` när nyckeln inte finns — anroparen ska säga ifrån i
 * stället för att tyst skapa en hävning av ingenting.
 */
export function hav(
  minne: Avvisning[],
  nyckel: string,
  skal: string,
  datum: string,
): Avvisning[] | undefined {
  const i = minne.findIndex((a) => a.nyckel === nyckel);
  if (i === -1) return undefined;
  const ut = [...minne];
  ut[i] = { ...ut[i]!, havd: { datum, skal } };
  return ut;
}
