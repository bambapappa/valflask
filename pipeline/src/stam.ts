/**
 * Ordstamsreducering för svenska — Snowballs svenska algoritm (3.1.1),
 * skriven i kod i stället för hämtad som beroende.
 *
 * Varför i egen kod: nyckelordsindexet ska vara reproducerbart och
 * granskningsbart i git-historiken (b-0014). En stammare som ligger i
 * repot går att läsa, testa och versionera tillsammans med datat; ett
 * paket som byts ut i tysthet skulle kunna ändra indexet utan att någon
 * ser det i diffen. Algoritmen är liten och stabil.
 *
 * Vad den löser: svensk böjning gör att "bygga" och "byggas", "höja" och
 * "höjas", "bilen" och "bilar" annars räknas som skilda termer. Ett löfte
 * i en böjningsform mötte då inte ett dokument i en annan.
 *
 * Utfallet är kontrollerat ord för ord mot referensimplementationen
 * (snowballstemmer 3.1.1) — se tests/stam.test.ts.
 *
 * ALGORITMENS EGNA LUCKOR, värda att känna till: Snowball stryker inte
 * bestämd ändelse på a-ord, så "skola"/"skolan" och "flicka"/"flickan"
 * möts inte (plural gör det: "skolor" och "skolorna" ger båda "skol").
 * Den övertolkar också ibland — "försvar" blir "försv" medan "försvaret"
 * blir "försvar", så de två möts inte heller. Följden är alltid en missad
 * kandidat, aldrig en felaktig koppling: en tom cell är ärlig.
 *
 * Referens: https://snowballstem.org/algorithms/swedish/stemmer.html
 */

export const VOKALER = new Set(["a", "e", "i", "o", "u", "y", "ä", "å", "ö"]);

/** Konsonanter som ett böjnings-s får följa. */
const S_ANDELSE = new Set([
  "b", "c", "d", "f", "g", "h", "j", "k", "l", "m",
  "n", "o", "p", "r", "t", "v", "y",
]);

/** Bokstäver som "öst" får följa för att reduceras till "ös" (löst → lös). */
const OST_ANDELSE = new Set(["i", "k", "l", "n", "p", "r", "t", "u", "v"]);

/**
 * Undantag som skyddar "-et" från att strykas. Utan dem skulle ord som
 * "kriminalitet" och "enighet" stympas — ändelsen är där en del av
 * ordstammen, inte en bestämd form.
 */
const ET_UNDANTAG = [
  "ivit", "kvit", "alit", "ilit", "stak",
  "iet", "cit", "dit", "mit", "nit", "pit", "rit", "sit", "tit", "uit",
  "xit", "fab", "pak", "rak", "kom",
  "h",
];

type Steg1Atgard = "stryk" | "s" | "et";

/**
 * Steg 1 — böjningsändelser. Längsta träff vinner, därför sorterad efter
 * fallande längd. "s" och "et" har egna villkor (se nedan).
 */
const STEG1: Array<[string, Steg1Atgard]> = [
  ["heterna", "stryk"],
  ["hetens", "stryk"],
  ["anden", "stryk"], ["arens", "stryk"], ["andes", "stryk"], ["andet", "stryk"],
  ["arnas", "stryk"], ["ernas", "stryk"], ["ornas", "stryk"], ["heten", "stryk"],
  ["heter", "stryk"],
  ["arna", "stryk"], ["erna", "stryk"], ["orna", "stryk"], ["ande", "stryk"],
  ["arne", "stryk"], ["aste", "stryk"], ["aren", "stryk"], ["ades", "stryk"],
  ["erns", "stryk"],
  ["ade", "stryk"], ["are", "stryk"], ["ern", "stryk"], ["ens", "stryk"],
  ["het", "stryk"], ["ast", "stryk"],
  ["ad", "stryk"], ["en", "stryk"], ["ar", "stryk"], ["er", "stryk"],
  ["or", "stryk"], ["as", "stryk"], ["es", "stryk"], ["at", "stryk"],
  ["et", "et"],
  ["a", "stryk"], ["e", "stryk"], ["s", "s"],
];

/** Steg 2 — konsonantpar där sista bokstaven stryks. */
const STEG2 = ["dd", "gd", "nn", "dt", "gt", "kt", "tt"];

/** Steg 3 — avledningsändelser. Längsta träff vinner. */
const STEG3: Array<[string, "stryk" | "ost" | "full"]> = [
  ["fullt", "full"],
  ["els", "stryk"], ["lig", "stryk"], ["öst", "ost"],
  ["ig", "stryk"],
];

/**
 * R1: läget efter första konsonanten som följer på en vokal, dock aldrig
 * före tecken 3 — annars skulle korta ord stympas till oigenkännlighet.
 */
function r1Start(ord: string): number {
  if (ord.length < 3) return ord.length;
  let p1 = ord.length;
  for (let i = 1; i < ord.length; i += 1) {
    if (!VOKALER.has(ord[i]!) && VOKALER.has(ord[i - 1]!)) {
      p1 = i + 1;
      break;
    }
  }
  return Math.max(p1, 3);
}

/**
 * Får "-et" strykas från den här stammen? Kravet är att stammen slutar på
 * vokal + konsonant och har något före det, och att den inte slutar med
 * något av undantagen (som skyddar "-itet"-ord).
 */
function etVillkor(stam: string): boolean {
  if (stam.length < 3) return false;
  const sist = stam[stam.length - 1]!;
  const nastSist = stam[stam.length - 2]!;
  if (VOKALER.has(sist)) return false; // sista tecknet ska vara konsonant
  if (!VOKALER.has(nastSist)) return false; // näst sista ska vara vokal
  return !ET_UNDANTAG.some((u) => stam.endsWith(u));
}

function steg1(s: string, r1: number): string {
  for (const [andelse, atgard] of STEG1) {
    if (!s.endsWith(andelse)) continue;
    const pos = s.length - andelse.length;
    if (pos < r1) continue; // ändelsen måste ligga i R1
    const stam = s.slice(0, pos);

    if (atgard === "stryk") return stam;

    if (atgard === "et") {
      // "et" stryks bara när villkoret håller; annars lämnas ordet orört.
      return etVillkor(stam) ? stam : s;
    }

    // "s": först provas "ets" som helhet, annars krävs en konsonant som
    // ett böjnings-s får följa.
    if (stam.endsWith("et") && etVillkor(stam.slice(0, -2))) {
      return stam.slice(0, -2);
    }
    const fore = stam[stam.length - 1];
    return fore && S_ANDELSE.has(fore) ? stam : s;
  }
  return s;
}

function steg2(s: string, r1: number): string {
  for (const par of STEG2) {
    if (!s.endsWith(par)) continue;
    if (s.length - par.length < r1) continue;
    if (s.length <= r1) continue;
    return s.slice(0, -1);
  }
  return s;
}

function steg3(s: string, r1: number): string {
  for (const [andelse, atgard] of STEG3) {
    if (!s.endsWith(andelse)) continue;
    const pos = s.length - andelse.length;
    if (pos < r1) continue;
    if (atgard === "stryk") return s.slice(0, pos);
    if (atgard === "full") return s.slice(0, pos) + "full";
    // "öst" → "ös", men bara efter vissa bokstäver (löst → lös).
    const fore = s[pos - 1];
    return fore && OST_ANDELSE.has(fore) ? s.slice(0, pos) + "ös" : s;
  }
  return s;
}

/**
 * Reducerar ett ord till sin stam. Ord kortare än tre tecken, och ord med
 * tecken utanför det svenska alfabetet, lämnas orörda — stammaren är
 * byggd för gemena svenska ord, och att gissa på annat vore att hitta på.
 */
export function stamma(ord: string): string {
  if (ord.length < 3) return ord;
  if (!/^[a-zåäöéü0-9-]+$/u.test(ord)) return ord;
  const r1 = r1Start(ord);
  return steg3(steg2(steg1(ord, r1), r1), r1);
}
