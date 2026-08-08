/**
 * Att dra in en publicerad koppling.
 *
 * Det har gjorts tre gånger i repot — de fem avslå-voteringarna, de 27 klass
 * A-kopplingarna och de sex med bara ramverksyrkanden — och varje gång av ett
 * skript som ägde just den genomgången. Formen är densamma varje gång, och det
 * som gör den svår att göra rätt för hand är detsamma varje gång: statusen och
 * skälet måste sättas ihop, skälet måste vara läsbart för någon utanför
 * projektet, och en indragning som tar målets sista koppling tar en publicerad
 * bedömning ur rutnätet med sig.
 *
 * Reglerna ligger här så att en fjärde genomgång inte behöver hitta på dem igen.
 */
import type { KopplingPost } from "./granskning.ts";

/** En rad i en indragning: kopplingen och skälet, läst av en människa. */
export interface Indragningsrad {
  id: string;
  skal: string;
}

/**
 * Skälets minsta längd.
 *
 * Skälet står på den indragna posten och är det enda en granskare ser om hen
 * frågar varför ett belägg försvann. «Bär inte» är inget svar; skälet ska säga
 * vad som lästes och vad läsningen fann. Golvet är satt lika lågt som
 * citatgrindens eget teckenkrav — det stoppar inte ett dåligt skäl, men det
 * stoppar ett tomt.
 */
export const SKAL_MIN_TECKEN = 40;

export interface Indragningsprovning {
  ok: boolean;
  /** Varför raden inte går att verkställa, i klartext. Tom när den går. */
  fel: string[];
}

/** Prövar en rad innan något skrivs. */
export function provaIndragning(
  koppling: KopplingPost | undefined,
  rad: Indragningsrad,
): Indragningsprovning {
  const fel: string[] = [];
  if (koppling === undefined) fel.push(`${rad.id} finns inte i kopplingar.json`);
  else if (koppling.status === "indragen") fel.push(`${rad.id} är redan indragen`);
  else if (koppling.status !== "aktiv") fel.push(`${rad.id} har status ${koppling.status}, inte aktiv`);
  if (rad.skal.trim().length < SKAL_MIN_TECKEN) {
    fel.push(
      `${rad.id}: skälet är ${rad.skal.trim().length} tecken, minst ${SKAL_MIN_TECKEN} krävs. ` +
        "Skriv vad som lästes och vad läsningen fann.",
    );
  }
  // Interna koder säger ingenting för den som läser sajten, och skälet står på
  // den publicerade posten. Samma regel som gäller all text som möter en läsare.
  const kod = /\bb-\d{4}\b|\bG[1-5]\b|\bH[1-6]\b|\bR\d\b/u.exec(rad.skal);
  if (kod !== null) {
    fel.push(`${rad.id}: skälet bär den interna koden «${kod[0]}». Skriv vad som faktiskt sker i stället.`);
  }
  return { ok: fel.length === 0, fel };
}

/** Kopplingen som indragen, med datum och skäl. */
export function draIn(koppling: KopplingPost, skal: string, datum: string): KopplingPost {
  return { ...koppling, status: "indragen", indragen: { datum, skal: skal.trim() } };
}

/**
 * Målen som mister sin sista aktiva koppling.
 *
 * En indragning som tar den sista tar hela raden ur rutnätet, och med den varje
 * publicerad bedömning som vilade på den. Testet `domar-aktuell` fäller en
 * glömd omräkning men säger inte vilka bedömningar som föll, så de måste
 * plockas fram här och namnges i rättelseposten. Annars försvinner en publicerad
 * dom tyst, och tyst rättelse är förbjuden.
 */
export function malUtanKvarvarandeKoppling(
  kopplingar: KopplingPost[],
  drasIn: Set<string>,
): string[] {
  const kvar = new Map<string, number>();
  for (const k of kopplingar) {
    const mal = k.promise_id;
    if (mal === undefined) continue;
    if (!kvar.has(mal)) kvar.set(mal, 0);
    if (k.status === "aktiv" && !drasIn.has(k.id)) kvar.set(mal, kvar.get(mal)! + 1);
  }
  const berorda = new Set(
    kopplingar.filter((k) => drasIn.has(k.id)).map((k) => k.promise_id).filter((m): m is string => m !== undefined),
  );
  return [...berorda].filter((m) => kvar.get(m) === 0).sort();
}
