/**
 * Anslagstabellen ur en budgetmotion.
 *
 * En anslagsmotions yrkande lyder bara "riksdagen anvisar anslagen för år X
 * inom utgiftsområde Y **enligt tabellen i motionen**". Tabellen ingår i
 * yrkandet genom hänvisningen, och det är där partiets faktiska begäran står:
 * en rad per anslag med avvikelsen mot regeringens förslag.
 *
 * Beslutet b-0039 hänger på just den raden. Ett anslagsyrkande kan bära ett
 * löfte som består i pengar **när tabellen har en rad för saken** — och
 * saknas raden bär motionen inte löftet. Utan det här verktyget går frågan
 * inte att avgöra annat än genom att läsa 103 motioner för hand, och då blir
 * den inte avgjord.
 *
 * Ren parsning utan nätverk: anroparen hämtar HTML:en. Riksdagens dokument bär
 * tabellen som riktig `<table>`, så den läses som rader och celler och inte som
 * text — en utplattad tabell tappar vilken siffra som hör till vilket anslag.
 */

/** En rad i motionens anslagstabell. */
export interface Anslagsrad {
  /** Anslagets beteckning inom utgiftsområdet, t.ex. "12:6". */
  anslag: string;
  /** Anslagets namn så som motionen skriver det. */
  namn: string;
  /**
   * Avvikelsen mot regeringens förslag **i tabellens egen enhet**, inte
   * omräknad. Riksdagens utgiftsområdestabeller anger normalt tusental kronor,
   * men enheten står i tabellens rubrik eller ingress och ska läsas där innan
   * ett tal används — att anta miljoner ger tal tusen gånger för små.
   *
   * `0` betyder att motionen uttryckligen lämnar anslaget orört (`±0`). Det är
   * ett svar och inte ett saknat värde: det säger att partiet inte begärde
   * någon ändring, vilket ofta är precis det man vill veta.
   *
   * `null` betyder att raden inte bar någon läsbar siffra. Då är det okänt, och
   * okänt får varken läsas som noll eller som regeringens förslag.
   */
  avvikelse: number | null;
}

/** Tabellerna i dokumentet, var och en som rader av celltexter. */
export function tabeller(html: string): string[][][] {
  const ut: string[][][] = [];
  for (const tabell of html.match(/<table[\s>][\s\S]*?<\/table>/gi) ?? []) {
    const rader: string[][] = [];
    for (const rad of tabell.match(/<tr[\s>][\s\S]*?<\/tr>/gi) ?? []) {
      const celler = (rad.match(/<t[dh][\s>][\s\S]*?<\/t[dh]>/gi) ?? []).map((c) => cellText(c));
      if (celler.length > 0) rader.push(celler);
    }
    if (rader.length > 0) ut.push(rader);
  }
  return ut;
}

/** Alla rader i alla tabeller, för den som bara vill läsa igenom dokumentet. */
export function tabellrader(html: string): string[][] {
  return tabeller(html).flat();
}

/**
 * Cellens text, med taggar och teckenentiteter upplösta.
 *
 * Riksdagens tabeller blandar rena tecken med entiteter i både decimal- och
 * hexform: samma dokument bär rena minustecken och `&#8722;1&#xa0;900`. Därför
 * avkodas alla numeriska entiteter generellt — en lista över de fem man råkat se
 * går sönder mot nästa dokument. Mjukt bindestreck tas bort helt; det är osynligt
 * i källan och skulle annars dela ett ord mitt itu.
 */
function cellText(cell: string): string {
  return cell
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:shy|#xad|#173);/gi, "")
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/gu, " ")
    .trim();
}

const ANSLAG = /^(\d{1,2}:\d{1,2})$/;

/**
 * Talet i en tabellcell, i tabellens egen enhet.
 *
 * Riksdagens tabeller skriver minus som U+2212 och tusenavskiljare som hårt
 * mellanslag, så `−1 900` är ett tal och inte tre. `±0` är noll på riktigt.
 * Allt annat som inte är ett rent tal ger `null` — en cell med en fotnot eller
 * ett streck är okänd, inte tom.
 */
export function tabelltal(cell: string): number | null {
  const s = cell.replace(/ /g, "").replace(/\s/g, "");
  if (s === "" ) return null;
  if (/^±0$/.test(s)) return 0;
  const m = /^([-−+]?)(\d+(?:[.,]\d+)?)$/.exec(s);
  if (!m) return null;
  const tal = Number(m[2]!.replace(",", "."));
  if (!Number.isFinite(tal)) return null;
  return m[1] === "-" || m[1] === "−" ? -tal : tal;
}

/**
 * Anslagsraderna i en tabell.
 *
 * Avvikelsekolumnen läses ur tabellens **rubrikrad, räknad från slutet**.
 * Riksdagens rubriker har färre celler än dataraderna — rubriken "Anslag"
 * täcker både anslagsnummer och anslagsnamn — så ett index räknat från vänster
 * glider ett steg och landar på regeringens förslag i stället för partiets
 * avvikelse. Mätt på en riktig motion: rubriken har tre celler, raderna fyra,
 * och felet gav regeringens tal presenterat som partiets.
 *
 * Hittas ingen avvikelsekolumn är avvikelsen okänd. Okänt får varken läsas som
 * noll eller som regeringens förslag.
 */
export function parseAnslagstabell(html: string): Anslagsrad[] {
  const ut: Anslagsrad[] = [];
  for (const rader of tabeller(html)) {
    const franSlutet = avvikelsekolumnFranSlutet(rader);
    for (const celler of rader) {
      const i = celler.findIndex((c) => ANSLAG.test(c));
      if (i === -1) continue;
      const anslag = ANSLAG.exec(celler[i]!)![1]!;
      const efter = celler.slice(i + 1);
      const namn = efter.find((c) => c !== "" && tabelltal(c) === null) ?? "";
      const avvikelse =
        franSlutet === null ? null : tabelltal(celler[celler.length - 1 - franSlutet] ?? "");
      ut.push({ anslag, namn, avvikelse });
    }
  }
  return ut;
}

/**
 * Hur många celler från radens slut avvikelsen står, eller `null` om rubriken
 * inte pekar ut någon avvikelsekolumn.
 */
function avvikelsekolumnFranSlutet(rader: string[][]): number | null {
  for (const celler of rader) {
    if (celler.some((c) => ANSLAG.test(c))) break; // rubriken står före första dataraden
    const i = celler.findIndex((c) => /avvikelse|förändring|ändring/i.test(c));
    if (i !== -1) return celler.length - 1 - i;
  }
  return null;
}

/** En kandidatrad med hur många av löftets sakord den delar. */
export interface Radtraff {
  rad: Anslagsrad;
  /** Antal av löftets sakord som återkommer i anslagsnamnet. Alltid minst 1. */
  poang: number;
}

/**
 * Raderna som kan tänkas bära ett löfte, rangordnade efter ordöverlapp, **med
 * överlappet utskrivet som ett tal**.
 *
 * Talet är inte pynt. Ett enda gemensamt ordled är ofta ett sammanträffande:
 * anslaget "Kriminalvården" delar ordstammen "kriminal" med löftet om stöd till
 * barn i riskzon för kriminalitet, och den raden avgör ingenting om det löftet.
 * Skulle en sådan rad skrivas in i en publicerad motivering som den rad som bär
 * löftet vore det ett påstående vi inte kan stå för. Den som väljer rad behöver
 * därför se hur starkt överlappet är, inte bara att det finns.
 *
 * **Rangordningen väljer inte rad.** Den lägger fram kandidaterna så att en
 * människa kan avgöra, precis som lydelserna i `handlingens-egna-ord`. Ett
 * ordöverlapp är ingen sakbedömning: "Bidrag till litteratur" och "Bidrag till
 * regional kulturverksamhet" delar två ord med varandra men avgör olika saker.
 */
export function narmastLoftetMedPoang(rader: Anslagsrad[], loftetext: string): Radtraff[] {
  const ord = nyckelord(loftetext);
  return rader
    .map((rad) => ({ rad, poang: delarSakord(nyckelord(rad.namn), ord) }))
    .filter((x) => x.poang > 0)
    .sort((a, b) => b.poang - a.poang);
}

/** Samma rangordning utan talen, för den som bara vill skriva ut kandidaterna. */
export function narmastLoftet(rader: Anslagsrad[], loftetext: string): Anslagsrad[] {
  return narmastLoftetMedPoang(rader, loftetext).map((x) => x.rad);
}

/**
 * Hur många av löftets sakord som återkommer i anslagsnamnet.
 *
 * Svenska både sätter samman och böjer, så samma sak stavas olika: löftet säger
 * "idrottsanläggningar", ett anslag heter "Stöd till plats för idrott" och ett
 * annat "Stöd till idrotten". Ingen av dem är en delsträng av de andra —
 * "idrotten" ryms inte i "idrottsanläggningar" på grund av ändelsen. Därför
 * jämförs orden på sin **gemensamma början**: delar två ord sina första fem
 * tecken räknas de som samma sak.
 *
 * Mätt: utan det missade rangordningen anslaget med 225 miljoner kronor för
 * idrotten och föreslog indragning på ett löfte om idrottsanläggningar.
 */
function delarSakord(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) {
    for (const y of b) {
      if (gemensamBorjan(x, y) >= 5) {
        n++;
        break;
      }
    }
  }
  return n;
}

/** Antalet tecken två ord delar från början. */
function gemensamBorjan(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/** Ord värda att matcha på: gemena, minst fyra tecken, utan de vanligaste fyllnadsorden. */
function nyckelord(text: string): Set<string> {
  const stopp = new Set([
    "till", "vissa", "övrigt", "andra", "samt", "inom", "statens", "genom",
    "detta", "eller", "kronor", "miljoner", "miljarder", "anslag", "hela",
    "landet", "särskilt", "nationell", "verksamhet", "insatser", "åtgärder",
  ]);
  return new Set(
    (text.toLowerCase().match(/[a-zåäöéü]{4,}/g) ?? []).filter((o) => !stopp.has(o)),
  );
}
