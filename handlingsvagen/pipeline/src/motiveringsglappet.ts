/**
 * Mäter hur många motiveringar som inte talar om sitt eget citat.
 *
 * Bakgrund: bevisbytet 7–8 augusti 2026 bytte citatet på 269 publicerade
 * kopplingar mot handlingens egen lydelse, men rörde inte meningen som
 * FÖRKLARAR citatet. Motiveringen beskrev därför i många fall det dokument
 * den en gång skrevs mot, medan citatet visar något annat. Vid den oberoende
 * genomgången 2026-08-22 mättes det: ordtäckningen mellan motiveringens egna
 * ord och dess eget citat var 0,186 för bevisbytta poster mot 0,342 för
 * obytta. Bytet nästan halverade överensstämmelsen.
 *
 * Måttet är trubbigt med flit och ska läsas som en LÄSLISTA, inte som en dom.
 * En motivering får beskriva löftet med andra ord än citatets, och gör det
 * ofta med rätta. Talet finns för att skulden ska gå att se och krympa, inte
 * för att peka ut enskilda poster som fel.
 *
 * Jämförelsen görs på ordstammar med `stam.ts` och ordindelning med `taOrd`
 * ur `nyckelord.ts` — samma två funktioner som resten av registret använder.
 * Den första mätningen gjordes med en egen tokenisering utan stamning och
 * räknade därför «punktmarkera» och «punktmarkering» som skilda ord: 269
 * poster i stället för de 178 samma tröskel ger med registrets egna regler.
 * Ett mått som mäter något annat än koden gör är ett mått man inte kan följa.
 */
import { stamma } from "./stam.ts";
import { taOrd } from "./nyckelord.ts";
import type { KopplingPost } from "./granskning.ts";

/** Under den här andelen gemensamma ordstammar hamnar posten på läslistan. */
export const GLAPPTROSKEL = 0.2;

/**
 * Ord som inte skiljer en motivering från en annan: allmänsvenska,
 * riksdagens formelspråk och granskningens egen vokabulär. Utan dem räknas
 * «Riksdagen ställer sig bakom» som innehåll och varje post ser besläktad ut.
 */
const STOPPSTAMMAR = new Set(
  ("och det som för med till att ska skall inte den de man har kan bör från om en ett är av på " +
    "eller samt vår våra alla mer fler detta denna sig sina vara blir genom under över efter innan " +
    "sedan även också andra annat sådan sådana samma varje vilket vilka vilken dessa deras sitt " +
    "något några ingen inget inga mycket många flera därför eftersom medan utan mellan både finns " +
    "gäller göra gör ligger kommer skulle kunna måste behöver vill vilja bland hela helt olika " +
    "stor stort stora större mindre enligt inom redan ännu alltid aldrig riksdagen motionen " +
    "motionens tillkännager anförs bakom ställer regeringen regeringens utskottet utskottets " +
    "betänkandet förslag citatet visar direkt vilket löftet motsvarar stödjer stöder samma sak " +
    "sakfråga konkret konkreta åtgärd åtgärder föreslår vill yrkar linje dokumentet handlingen " +
    "handlar punkten interpellationen frågan ledamoten motionären parti partiet yrkandet begär")
    .split(" ")
    .map(stamma),
);

function stammar(text: string): Set<string> {
  const ut = new Set<string>();
  for (const ord of taOrd(text ?? "")) {
    const s = stamma(ord);
    if (s.length >= 4 && !STOPPSTAMMAR.has(s)) ut.add(s);
  }
  return ut;
}

/**
 * Motiveringens EGNA ord.
 *
 * Noterna som verktygen skriver — bevisbytets, anslagsbärarens,
 * inkomstbärarens — är formelspråk. Räknas de som innehåll döljer de glappet:
 * de innehåller alltid orden ur citatets närhet.
 */
export function egnaOrd(motivering: string | undefined): string {
  const utanBytesnot = (motivering ?? "").split(/\(?\s*[Bb]evis(?:et)? (?:byttes|utbytt|rättat)/u)[0]!;
  return utanBytesnot.split(/Motionens (?:anslags)?yrkande|Motionens yrkanden fastställer/u)[0]!;
}

/** Andelen av motiveringens egna ordstammar som också står i citatet. */
export function tackning(koppling: Pick<KopplingPost, "method_note" | "bevis">): number | null {
  const egna = stammar(egnaOrd(koppling.method_note));
  if (egna.size < 3) return null; // för kort för att mäta
  const iCitatet = stammar(koppling.bevis?.citat ?? "");
  return [...egna].filter((w) => iCitatet.has(w)).length / egna.size;
}

/** Aktiva kopplingar vars motivering inte talar om sitt eget citat. */
export function laslistan(kopplingar: readonly KopplingPost[]): string[] {
  return kopplingar
    .filter((k) => k.status === "aktiv")
    .filter((k) => {
      const t = tackning(k);
      return t !== null && t < GLAPPTROSKEL;
    })
    .map((k) => k.id)
    .sort();
}
