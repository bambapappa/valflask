/**
 * Ämnessök och ordtrender (b-0014) — byggtidsmodellen bakom `/amnen`.
 *
 * Nyckelordsindexet (`data/nyckelord/`) bär dokumentens utvunna ordstammar.
 * Här skivas det till nyttolaster sajten kan hämta på begäran: ett
 * inverterat index (ordstam → handlingar) skärvat på ordets två första
 * tecken, och handlingarnas visningsdata skärvat på handling-id. 23 600
 * handlingar får aldrig plats i en enda nyttolast — budgetgrinden mäter.
 *
 * HEDERLIGHETEN: indexet SÖKER, det dömer aldrig. Att ett ord står i en
 * motion säger ingenting om huruvida partiet är för eller emot ett löfte.
 * "För/mot" kommer bara ur en godkänd koppling (som bär riktning) eller ur
 * en votering (som bär faktiska röster) — aldrig ur ordförekomst.
 *
 * Saknas indexet (workflowen inte körd än) returnerar allt tomt, och sidan
 * säger det rent ut i stället för att låtsas.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { aktorsPartier } from "../../../pipeline/src/handlingar.ts";
import { type DokumentTermer, type Skarva } from "../../../pipeline/src/nyckelord.ts";
import { getHandlingMap, getKopplingar, getParties } from "./data.ts";

function indexKatalog(): string {
  return resolve(process.cwd(), "../data/nyckelord");
}

let _index: Map<string, DokumentTermer> | undefined;

/** Läser in nyckelordsindexets alla skärvor (en gång per bygge). */
export function getTermIndex(): Map<string, DokumentTermer> {
  if (_index) return _index;
  const katalog = indexKatalog();
  const index = new Map<string, DokumentTermer>();
  if (existsSync(katalog)) {
    for (const fil of readdirSync(katalog)) {
      if (!fil.endsWith(".json")) continue;
      const skarva = JSON.parse(readFileSync(resolve(katalog, fil), "utf8")) as Skarva;
      for (const [id, termer] of Object.entries(skarva.handlingar)) index.set(id, termer);
    }
  }
  _index = index;
  return index;
}

export function indexFinns(): boolean {
  return getTermIndex().size > 0;
}

/** Skärvnyckel för en ordstam: två första tecknen, så varje hämtning blir liten. */
export function ordSkarva(stam: string): string {
  return stam.slice(0, 2) || "_";
}

/**
 * Alla ordskärvor som ska byggas (en JSON-fil per nyckel). Listan skickas
 * också med till sidan, så sökrutan kan låta bli att hämta skärvor som
 * inte finns — annars ger varje sökning på ett okänt ord ett 404 i
 * webbläsarkonsolen.
 */
export function ordSkarvor(): string[] {
  const nycklar = new Set<string>();
  for (const { t } of getTermIndex().values()) for (const stam of t) nycklar.add(ordSkarva(stam));
  return [...nycklar].sort();
}

/**
 * Hur många handlingar en ordstam som mest bär med sig i nyttolasten.
 * Ett ord som står i tiotusen dokument är ändå för brett för att bläddra
 * igenom — och listan skulle ensam spränga skärvan. Antalet redovisas
 * alltid i sin helhet, så läsaren ser att urvalet är ett urval.
 */
export const MAX_PER_ORD = 400;

/** En ordstams förekomster: hela antalet, och de senaste handlingarna. */
export interface OrdPost {
  /** totalt antal handlingar med ordet */ n: number;
  /** handling-id, de senaste först */ i: string[];
}

/** Inverterat index för EN ordskärva: ordstam → förekomster. */
export function byggOrdSkarva(nyckel: string): Record<string, OrdPost> {
  const ut = new Map<string, string[]>();
  for (const [id, { t }] of getTermIndex()) {
    for (const stam of new Set(t)) {
      if (ordSkarva(stam) !== nyckel) continue;
      const lista = ut.get(stam) ?? [];
      lista.push(id);
      ut.set(stam, lista);
    }
  }
  const sorterat: Record<string, OrdPost> = {};
  for (const stam of [...ut.keys()].sort()) {
    // Id:n delas ut i skördeordning (stigande datum), så de sista är de
    // färskaste. Sorteras fallande och kapas — nyast är mest intressant.
    const alla = ut.get(stam)!.sort().reverse();
    sorterat[stam] = { n: alla.length, i: alla.slice(0, MAX_PER_ORD) };
  }
  return sorterat;
}

/** Handlingens visningsdata i sökträffen — kort, för nyttolasten är stor. */
export interface HandlingKort {
  /** titel */ t: string;
  /** sort */ k: string;
  /** datum */ d: string;
  /** aktörspartier */ p: string[];
  /** utskott */ o?: string;
  /** riksdagens webbadress */ u: string;
}

/** Skärvnyckel för en handling — samma tusentalsindelning som indexet. */
export function handlingSkarva(id: string): string {
  const m = id.match(/^h-\d{4}-(\d+)$/u);
  if (!m) return "ovrigt";
  return String(Math.floor(Number(m[1]) / 1000)).padStart(2, "0");
}

export function handlingSkarvor(): string[] {
  const nycklar = new Set<string>();
  for (const id of getTermIndex().keys()) nycklar.add(handlingSkarva(id));
  return [...nycklar].sort();
}

export function byggHandlingSkarva(nyckel: string): Record<string, HandlingKort> {
  const handlingar = getHandlingMap();
  const ut: Record<string, HandlingKort> = {};
  for (const id of [...getTermIndex().keys()].sort()) {
    if (handlingSkarva(id) !== nyckel) continue;
    const h = handlingar.get(id);
    if (!h) continue;
    ut[id] = {
      t: h.titel,
      k: h.kind,
      d: h.datum,
      p: aktorsPartier(h),
      ...(h.organ ? { o: h.organ } : {}),
      u: h.url,
    };
  }
  return ut;
}

/**
 * De handlingar som HAR ett vägt utslag, och åt vilket håll. Bara dessa får
 * visa "stödjer/motverkar" i sökträffen — resten är dokument som råkar
 * innehålla ordet, ingenting annat.
 */
export function byggVagda(): Record<string, { riktning: string; lofte: string }> {
  const ut: Record<string, { riktning: string; lofte: string }> = {};
  for (const k of getKopplingar()) {
    if (k.status && k.status !== "aktiv") continue;
    ut[k.handling_id] = {
      riktning: k.riktning,
      lofte: k.promise_id ?? k.stance_id ?? "",
    };
  }
  return ut;
}

/** En parti-term i ordtrenden. */
export interface PartiOrd {
  stam: string;
  /** läsbar form — stammar som "vårdplat" säger en läsare ingenting */
  ord: string;
  /** antal handlingar från partiet där ordet står */
  antal: number;
  /**
   * Övervikt: hur många gånger oftare partiet använder ordet än de övriga
   * partierna tillsammans. 3 betyder tre gånger så ofta.
   */
  vikt: number;
}

export interface PartiTrend {
  kod: string;
  namn: string;
  /** antal handlingar med utvunna termer */
  handlingar: number;
  ord: PartiOrd[];
}

/**
 * Ordtrender per parti (b-0014): vilka ord ett parti använder MER än de
 * andra. Ingen modell, ingen tolkning — partiernas egna ord, räknade.
 *
 * Måttet är en ren jämförelse: andelen av partiets egna handlingar där
 * ordet står, delat med andelen av DE ÖVRIGA partiernas handlingar där det
 * står. Tre betyder att partiet använder ordet tre gånger så ofta som de
 * andra tillsammans.
 *
 * Att jämföra mot de övriga och inte mot hela materialet är avgörande för
 * att partierna ska gå att jämföra med varandra. S står för en tredjedel av
 * allt material, så S:s egna handlingar drar upp "snittet" och gör att S
 * knappt kan avvika från det — mot hela materialet toppade S på 2,8 gånger
 * medan KD nådde 18,7, vilket sade mer om partiernas storlek än om deras
 * politik. Mot övriga försvinner den snedvridningen.
 *
 * Ord som står i färre än `minAntal` av partiets handlingar utelämnas — de
 * säger mer om slumpen än om partiet. Nämnaren får ett påslag på ett så att
 * ett ord ingen annan använt ger ett stort men ändligt tal.
 */
export function byggPartiTrender(maxOrd = 18, minAntal = 15): PartiTrend[] {
  const index = getTermIndex();
  const handlingar = getHandlingMap();
  const partinamn = new Map(getParties().map((p) => [p.code, p.namn]));

  // Hur många handlingar varje ord står i, totalt och per parti.
  const globalDf = new Map<string, number>();
  const perParti = new Map<string, Map<string, number>>();
  const antalPerParti = new Map<string, number>();
  // Vanligaste visningsformen per stam, räknad över hela materialet.
  const formRakning = new Map<string, Map<string, number>>();

  for (const [id, { t, y }] of index) {
    const h = handlingar.get(id);
    if (!h) continue;
    const stammar = new Set(t);
    t.forEach((stam, i) => {
      const form = y?.[i];
      if (!form) return;
      const k = formRakning.get(stam) ?? new Map<string, number>();
      k.set(form, (k.get(form) ?? 0) + 1);
      formRakning.set(stam, k);
    });
    for (const stam of stammar) globalDf.set(stam, (globalDf.get(stam) ?? 0) + 1);
    for (const parti of aktorsPartier(h)) {
      if (!partinamn.has(parti)) continue;
      antalPerParti.set(parti, (antalPerParti.get(parti) ?? 0) + 1);
      const karta = perParti.get(parti) ?? new Map<string, number>();
      for (const stam of stammar) karta.set(stam, (karta.get(stam) ?? 0) + 1);
      perParti.set(parti, karta);
    }
  }

  const antalDok = index.size;
  const trender: PartiTrend[] = [];
  for (const [kod, namn] of partinamn) {
    const karta = perParti.get(kod);
    const partiTotalt = antalPerParti.get(kod) ?? 0;
    if (!karta || partiTotalt === 0) {
      trender.push({ kod, namn, handlingar: 0, ord: [] });
      continue;
    }
    const ord: PartiOrd[] = [];
    const ovrigaTotalt = antalDok - partiTotalt;
    for (const [stam, antal] of karta) {
      if (antal < minAntal) continue;
      // Partiets andel delat med de övrigas andel av samma ord.
      const iOvriga = (globalDf.get(stam) ?? antal) - antal;
      const andel = antal / partiTotalt;
      const andelOvriga = (iOvriga + 1) / (ovrigaTotalt + 1);
      const vikt = andel / andelOvriga;
      const former = formRakning.get(stam);
      const visning = former
        ? [...former.entries()].sort(
            (a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0], "sv"),
          )[0]![0]
        : stam;
      ord.push({ stam, ord: visning, antal, vikt });
    }
    ord.sort((a, b) => b.vikt - a.vikt || a.stam.localeCompare(b.stam, "sv"));
    trender.push({ kod, namn, handlingar: partiTotalt, ord: ord.slice(0, maxOrd) });
  }
  trender.sort((a, b) => a.kod.localeCompare(b.kod, "sv"));
  return trender;
}
