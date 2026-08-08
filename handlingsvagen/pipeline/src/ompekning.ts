/**
 * Att peka om en publicerad koppling till ett annat löfte.
 *
 * Behovet uppstår när ett löfte dras in som ett annat löftes dubblett. Beviset
 * på den indragna posten är inte fel — handlingen finns, citatet står ordagrant
 * i den, och riktningen är läst. Det enda som är fel är vilken post den hänger
 * på. Drar man in kopplingen i stället för att flytta den slutar en riktig
 * riksdagshandling räknas som att partiet agerat på sin egen politik, och
 * sajten visar partiet som mindre aktivt än det är. Det är en neutralitetsfråga
 * och inte bara en datafråga: städningen får inte kosta ett parti dess belägg.
 *
 * **Grupplåset är hela skälet till att det här är bokföring och inte påhitt.**
 * En ompekning tillåts bara till ett löfte i samma grupp. Gruppen är projektets
 * egen utsaga om att två poster gäller samma politik — den är satt vid
 * godkännandet och bär redan kostnadssidans räkning om att de kostar en gång.
 * Flyttas beviset dit ändras inte vad handlingen betyder, bara vilken av två
 * poster om samma sak den bokförs på. Utan låset vore ompekningen ett sätt att
 * flytta belägg dit de passar bättre, vilket är motsatsen till hela metoden.
 *
 * Det som ändå inte får flyttas är en koppling vars handling redan är belagd på
 * målet. Två kopplingar från samma handling till samma löfte är en dubblett i
 * rutnätet, och den ska dras in — inte flyttas.
 */
import type { KopplingPost } from "./granskning.ts";
import { SKAL_MIN_TECKEN } from "./indragning.ts";

/** En rad i en ompekning: kopplingen, målet och skälet, läst av en människa. */
export interface Ompekningsrad {
  id: string;
  /** Löftet kopplingen ska bokföras på i stället. */
  till: string;
  skal: string;
}

/** Det ompekningen behöver veta om ett löfte för att kunna pröva raden. */
export interface LoftesUppgift {
  id: string;
  status: string;
  group_id?: string | null;
}

export interface Ompekningsprovning {
  ok: boolean;
  /** Varför raden inte går att verkställa, i klartext. Tom när den går. */
  fel: string[];
}

/**
 * Prövar en rad innan något skrivs.
 *
 * Ordningen är vald så att det mest upplysande felet kommer först: finns inte
 * posten spelar gruppen ingen roll.
 */
export function provaOmpekning(
  koppling: KopplingPost | undefined,
  fran: LoftesUppgift | undefined,
  till: LoftesUppgift | undefined,
  alla: KopplingPost[],
  rad: Ompekningsrad,
): Ompekningsprovning {
  const fel: string[] = [];

  if (koppling === undefined) {
    fel.push(`${rad.id} finns inte i kopplingar.json`);
    return { ok: false, fel };
  }
  if (koppling.status !== "aktiv") {
    fel.push(`${rad.id} har status ${koppling.status}, inte aktiv`);
  }
  if (koppling.promise_id === undefined) {
    fel.push(`${rad.id} pekar inte på något löfte — en ståndpunktskoppling flyttas inte så här`);
  }
  if (till === undefined) {
    fel.push(`${rad.id}: målet ${rad.till} finns inte i promises.json`);
  } else if (till.status !== "aktiv") {
    fel.push(
      `${rad.id}: målet ${rad.till} har status ${till.status}. ` +
        "Ett belägg flyttas bara till ett löfte som står kvar publicerat.",
    );
  }
  if (koppling.promise_id === rad.till) {
    fel.push(`${rad.id} pekar redan på ${rad.till}`);
  }

  // Grupplåset. Se modulens huvud — utan det är ompekningen inte bokföring.
  if (fran !== undefined && till !== undefined) {
    const g1 = fran.group_id ?? null;
    const g2 = till.group_id ?? null;
    if (g1 === null || g2 === null || g1 !== g2) {
      fel.push(
        `${rad.id}: ${fran.id} och ${rad.till} ligger inte i samma grupp ` +
          `(${g1 ?? "ingen"} respektive ${g2 ?? "ingen"}). ` +
          "Ett belägg flyttas bara mellan löften projektet redan sagt gäller samma politik.",
      );
    }
  }

  // Samma handling två gånger på samma löfte är en dubblett i rutnätet.
  const krock = alla.find(
    (k) =>
      k.id !== rad.id &&
      k.status === "aktiv" &&
      k.promise_id === rad.till &&
      k.handling_id === koppling.handling_id,
  );
  if (krock !== undefined) {
    fel.push(
      `${rad.id}: ${rad.till} är redan belagt med handling ${koppling.handling_id} av ${krock.id}. ` +
        "Den här kopplingen ska dras in, inte flyttas.",
    );
  }

  if (rad.skal.trim().length < SKAL_MIN_TECKEN) {
    fel.push(
      `${rad.id}: skälet är ${rad.skal.trim().length} tecken, minst ${SKAL_MIN_TECKEN} krävs. ` +
        "Skriv varför beviset hör hemma på det andra löftet.",
    );
  }
  const kod = /\bb-\d{4}\b|\bG[1-5]\b|\bH[1-6]\b|\bR\d\b/u.exec(rad.skal);
  if (kod !== null) {
    fel.push(`${rad.id}: skälet bär den interna koden «${kod[0]}». Skriv vad som faktiskt sker i stället.`);
  }

  return { ok: fel.length === 0, fel };
}

/**
 * Kopplingen bokförd på det andra löftet.
 *
 * Spåret sparas på posten. Beviset, handlingen och riktningen står stilla — det
 * är bara bokföringen som flyttar — men en granskare som ser kopplingen på ett
 * annat löfte än i går ska kunna läsa varför utan att gräva i historiken.
 */
export function pekaOm(
  koppling: KopplingPost,
  till: string,
  skal: string,
  datum: string,
): KopplingPost {
  return {
    ...koppling,
    promise_id: till,
    ompekad: { datum, fran: koppling.promise_id ?? "", till, skal: skal.trim() },
  };
}

/**
 * Målen som mister sin sista aktiva koppling av en ompekning.
 *
 * Samma fråga som indragningen ställer, och samma skäl: flyttas den sista
 * kopplingen från ett löfte försvinner löftets rad ur rutnätet och varje
 * publicerad bedömning som vilade på den. Här är svaret oftast ofarligt — det
 * löfte kopplingarna lämnar är på väg att dras in ändå — men det ska stå
 * utskrivet och inte antas.
 */
export function malUtanKvarvarandeKoppling(
  kopplingar: KopplingPost[],
  flyttas: Map<string, string>,
): string[] {
  const kvar = new Map<string, number>();
  const berorda = new Set<string>();
  for (const k of kopplingar) {
    const nyttMal = flyttas.get(k.id) ?? k.promise_id;
    if (k.promise_id !== undefined && flyttas.has(k.id)) berorda.add(k.promise_id);
    if (nyttMal === undefined) continue;
    if (!kvar.has(nyttMal)) kvar.set(nyttMal, 0);
    if (k.status === "aktiv") kvar.set(nyttMal, kvar.get(nyttMal)! + 1);
  }
  for (const k of kopplingar) {
    if (k.promise_id !== undefined && !kvar.has(k.promise_id)) kvar.set(k.promise_id, 0);
  }
  return [...berorda].filter((m) => (kvar.get(m) ?? 0) === 0).sort();
}
