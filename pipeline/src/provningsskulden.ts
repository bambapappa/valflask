/**
 * Prövningar som beskriver en annan version än den som står publicerad.
 *
 * `provningsGrind()` fäller redan en sak vars underlag ändrats sedan
 * prövningen skrevs — men grinden sitter bara i godkännandevägen. Det som är
 * publicerat och sedan glider isär från sin prövning möter ingen kontroll
 * alls, och `provningar:status --tak` räknade bara det OPRÖVADE. Skulden gick
 * därför att öka utan att någonting sa ifrån: mätt 2026-08-23 stod den på 390
 * saker, varav 367 löften.
 *
 * Formen är densamma som ankarskulden: **en namngiven lista, inte ett tal.**
 * Ett tal går att hålla oförändrat medan en post rättas och en annan går
 * sönder, och då mäter taket ingenting. Med id i listan måste den rättade
 * posten tas bort, och den nya kan inte gömma sig bakom den.
 *
 * Skulden får bara krympa. Att lägga till ett id i facit är inte att lösa
 * något — det är att flytta felet in i den fil som ska bevisa att det inte
 * finns.
 */
import { identiteter, kanon, type Provning, type Slag } from "./provningar.ts";

export interface Sak {
  /** Alla identiteter prövningen kan ha skrivits under. */
  nycklar: string[];
  slag: Slag;
  /** Den publicerade posten, som `kanon()` räknar på. */
  obj: Record<string, unknown>;
}

/** `slag:id` — slaget ingår för att två slag kan bära samma id-form. */
export function skuldnyckel(slag: Slag, ident: string): string {
  return `${slag}:${ident}`;
}

/**
 * Aktiva löften, som `provningar-status` räknar dem.
 *
 * Listorna ligger här och inte i skriptet, så att provet och mätningen läser
 * samma befolkning. Räknades de på två ställen skulle de glida isär — det har
 * hänt en gång redan, se `provningar.ts`.
 */
export function loftesSaker(loften: Record<string, unknown>[]): Sak[] {
  return loften
    .filter((p) => p["status"] !== "tillbakadragen")
    .map((p) => ({
      nycklar: identiteter("lofte", String(p["id"]), p),
      slag: "lofte" as const,
      obj: p,
    }));
}

export function kopplingsSaker(kopplingar: Record<string, unknown>[]): Sak[] {
  return kopplingar
    .filter((k) => k["status"] !== "indragen")
    .map((k) => ({
      nycklar: identiteter("koppling", String(k["id"]), k),
      slag: "koppling" as const,
      obj: k,
    }));
}

export function standpunktsSaker(standpunkter: Record<string, unknown>[]): Sak[] {
  return standpunkter
    .filter((s) => {
      const pos = (s["current"] as { position?: string } | undefined)?.position;
      return pos !== undefined && pos !== null && pos !== "inget_tydligt_besked";
    })
    .map((s) => ({
      nycklar: identiteter("standpunkt", `${s["subquestion_id"]}::${s["party"]}`, s),
      slag: "standpunkt" as const,
      obj: s,
    }));
}

export interface Rakning {
  aktuella: number;
  gamla: string[];
  oprovade: number;
  summa: number;
}

/**
 * Vad som är aktuellt, gammalt och oprövat i en befolkning.
 *
 * `gamla` bär nycklar och inte bara ett antal — det är hela skillnaden mellan
 * ett tak som mäter och ett som bokför.
 */
export function rakna(saker: Sak[], provningar: Map<string, Provning>): Rakning {
  let aktuella = 0;
  const gamla: string[] = [];
  let oprovade = 0;
  for (const sak of saker) {
    const p = sak.nycklar.map((n) => provningar.get(n)).find((x) => x !== undefined);
    if (!p) {
      oprovade++;
      continue;
    }
    if (p.underlag_hash === kanon(sak.slag, sak.obj)) aktuella++;
    else gamla.push(skuldnyckel(sak.slag, sak.nycklar[0]!));
  }
  return { aktuella, gamla: gamla.sort(), oprovade, summa: saker.length };
}

export interface Skuldfacit {
  count: number;
  ids: string[];
}

export interface Skulddom {
  /** Gamla prövningar som inte står i facit — skulden har vuxit. */
  nya: string[];
  /** Id i facit som inte längre är gamla — ska strykas ur facit. */
  rattade: string[];
}

/**
 * Facit mot verkligheten.
 *
 * Båda leden behövs. Utan `nya` kan skulden växa tyst; utan `rattade` kan
 * listan stå kvar full medan arbetet är gjort, och då syns aldrig att det
 * går framåt.
 */
export function domSkulden(gamla: readonly string[], facit: Skuldfacit): Skulddom {
  const frysta = new Set(facit.ids);
  const kvar = new Set(gamla);
  return {
    nya: gamla.filter((id) => !frysta.has(id)).sort(),
    rattade: facit.ids.filter((id) => !kvar.has(id)).sort(),
  };
}
