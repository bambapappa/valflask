/**
 * Talen om väntan på arkivet, slagna upp vid varje bygge.
 *
 * Samma skäl som `prosans-tal.ts`: en siffra inskriven i löptexten blir en
 * tyst osanning den dag datat rör sig. Raden på metodsidan ska försvinna av
 * sig själv när väntan är över — inte stå kvar tills någon minns att ta bort
 * den.
 *
 * Regeln som avgör om väntan godtas ligger i `pipeline/src/arkivvantan.ts`
 * och importeras därifrån. Den kopieras aldrig hit: grinden och sidan måste
 * säga samma sak, och två kopior av en regel glider isär tyst.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { provaVantan, TOM_VANTAN, type Vantan } from "../../../pipeline/src/arkivvantan.ts";

const ROT = resolve(import.meta.dirname, "../../..");

export interface Vantanstal {
  /** Hur många käll-URL:er som väntar på ett arkiv som inte svarat. */
  antal: number;
  /** Äldsta väntans datum, ISO utan tid. Null när ingen väntar. */
  sedan: string | null;
}

export function arkivvantansTal(): Vantanstal {
  let vantan: Vantan = TOM_VANTAN;
  try {
    vantan = JSON.parse(readFileSync(resolve(ROT, "data/arkivvantan.json"), "utf8")) as Vantan;
  } catch {
    return { antal: 0, sedan: null };
  }
  const besked = provaVantan(vantan, new Date().toISOString());
  return {
    antal: besked.vantande.length,
    sedan: besked.sedan ? besked.sedan.slice(0, 10) : null,
  };
}
