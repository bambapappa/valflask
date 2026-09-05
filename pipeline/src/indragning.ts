/**
 * Att dra tillbaka ett publicerat löfte.
 *
 * 35 löften bär statusen `tillbakadragen`, och **ingenting i repot skriver
 * den** — statusen läses av sex ställen och sätts av noll. Varje
 * tillbakadragning har alltså gjorts genom att någon redigerat JSON för hand,
 * utan att något krävt ett skäl, kontrollerat att skälet går att läsa för en
 * utomstående, eller mätt vad summan gjorde.
 *
 * Handlingsvågen har haft reglerna i kod sedan 2026-08-11. Det här är samma
 * sak för Fläskvågen, med den skillnad som betyder något: **en tillbakadragning
 * flyttar nästan alltid en publicerad siffra.** Partiets summa och rikssumman
 * sjunker, och bar löftet sin grupps belopp byter gruppen bärare. Därför är en
 * tillbakadragning alltid en rättelse — post i `data/rattelser.json` och en
 * egen historikpost på löftet. Tyst rättelse är förbjuden.
 *
 * Ren logik: talen mäts av anroparen med sajtens egen `aggregates.ts`, aldrig
 * med en andra uträkning här.
 */

/** En rad i en tillbakadragning: löftet och skälet, läst av en människa. */
export interface Indragningsrad {
  id: string;
  skal: string;
}

/**
 * Skälets minsta längd.
 *
 * Skälet står på den tillbakadragna posten och är det enda en läsare ser om hen
 * frågar varför ett löfte försvann ur en partisumma. «Dubblett» är inget svar;
 * skälet ska säga vad som lästes och vad läsningen fann.
 */
export const SKAL_MIN_TECKEN = 40;

export interface Indragningsprovning {
  ok: boolean;
  /** Varför raden inte går att verkställa, i klartext. Tom när den går. */
  fel: string[];
}

interface Lofte {
  id: string;
  status?: string;
  group_id?: string | null;
  quote?: string;
  source?: { url?: string };
  history?: unknown[];
}

/** Prövar en rad innan något skrivs. */
export function provaIndragning(lofte: Lofte | undefined, rad: Indragningsrad): Indragningsprovning {
  const fel: string[] = [];
  if (lofte === undefined) fel.push(`${rad.id} finns inte i promises.json`);
  else if (lofte.status === "tillbakadragen") fel.push(`${rad.id} är redan tillbakadragen`);
  else if (lofte.status !== "aktiv") fel.push(`${rad.id} har status ${lofte.status}, inte aktiv`);

  const skal = rad.skal.trim();
  if (skal.length < SKAL_MIN_TECKEN) {
    fel.push(
      `${rad.id}: skälet är ${skal.length} tecken, minst ${SKAL_MIN_TECKEN} krävs. ` +
        "Skriv vad som lästes och vad läsningen fann.",
    );
  }

  // Interna koder säger ingenting för den som läser sajten, och skälet står på
  // den publicerade posten. Samma regel som gäller all text som möter en läsare.
  const kod = /\bb-\d{4}\b|\bG[1-5]\b|\bH[1-6]\b|\bR\d\b|\bC\d\b/u.exec(skal);
  if (kod !== null) {
    fel.push(`${rad.id}: skälet bär den interna koden «${kod[0]}». Skriv vad som faktiskt sker i stället.`);
  }
  return { ok: fel.length === 0, fel };
}

/** Löftet som tillbakadraget, med datum och skäl i en egen historikpost. */
export function draIn<T extends Lofte>(lofte: T, skal: string, datum: string): T {
  return {
    ...lofte,
    status: "tillbakadragen",
    history: [
      ...(lofte.history ?? []),
      // Backfillas i en andra commit, samma mönster som övriga dataändringar.
      {
        date: datum,
        commit: "0000000",
        change: `Löftet är tillbakadraget: ${skal.trim()}`,
      },
    ],
  };
}

/**
 * Grupperna som mister den medlem som bär deras belopp.
 *
 * Ett delat löfte räknas en gång, och gruppen representeras av medlemmen med
 * det högsta beloppet för mandatperioden. Dras just den medlemmen tillbaka
 * byter gruppen bärare, och gruppens bidrag till rikssumman ändras — en
 * publicerad siffra rör sig utan att något annat löfte rörts. Det måste
 * namnges i rättelseposten, annars ändras en summa tyst.
 *
 * Bärarregeln läses av anroparen ur sajtens egen `aggregates.ts` och skickas in
 * som `bararePerGrupp`, så att den aldrig räknas på två ställen.
 */
export function grupperSomByterBarare(
  loften: Array<{ id: string; group_id?: string | null }>,
  drasIn: Set<string>,
  bararePerGrupp: Map<string, string>,
): string[] {
  const grupper = new Set<string>();
  for (const l of loften) {
    if (!drasIn.has(l.id) || !l.group_id) continue;
    if (bararePerGrupp.get(l.group_id) === l.id) grupper.add(l.group_id);
  }
  return [...grupper].sort();
}

/** En rad i genomgången: löftet, skälet, och vad tillbakadragningen gör med summan. */
export interface Indragningsrad_ {
  lofte: { id: string; parties?: string[]; group_id?: string | null };
  skal: string;
}

/**
 * En rättelsepost för hela genomgången — inte en per löfte.
 *
 * Talen kommer utifrån, mätta med sajtens egen uträkning. Skriv dem i hela
 * miljoner kronor för mandatperioden, som allt annat läsaren ser.
 */
export function rattelsePost(
  rader: Indragningsrad_[],
  datum: string,
  summor: { partier: Map<string, number>; riket: number; grupperSomBytteBarare: string[] },
  orsak: string,
): { date: string; affects: string; what: string; why: string; orsak: string; commit: string } {
  const ider = [...new Set(rader.map((r) => r.lofte.id))].sort();
  const partitext = [...summor.partier.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([parti, mkr]) => `${parti.toUpperCase()} minskar med ${mkr.toLocaleString("sv-SE")} miljoner kronor`)
    .join(", ");

  const grupptext =
    summor.grupperSomBytteBarare.length > 0
      ? ` ${summor.grupperSomBytteBarare.length} delat löfte bytte den medlem vars belopp räknas, ` +
        "eftersom det tillbakadragna löftet var den som bar gruppens belopp."
      : "";

  return {
    date: datum,
    affects: `${ider.join(", ")} — ${ider.length} ${ider.length === 1 ? "löfte" : "löften"} tillbakadragna`,
    what:
      `${ider.length} ${ider.length === 1 ? "löfte är tillbakadraget" : "löften är tillbakadragna"} ` +
      `och räknas inte längre in i någon summa. ${partitext ? `${partitext}. ` : ""}` +
      `Summan för alla partier minskar med ${summor.riket.toLocaleString("sv-SE")} miljoner kronor ` +
      `för mandatperioden.${grupptext} Skälet står på varje löfte.`,
    why:
      "Ett löfte dras tillbaka när det inte borde ha publicerats som ett eget löfte — samma parti " +
      "har lovat samma sak en gång till, eller citatet visade sig inte bära det åtagande vi läste " +
      "in i det. Politiken försvinner inte ur granskningen om den står kvar någon annanstans; det " +
      "är dubbelräkningen som försvinner.",
    orsak,

    // Backfillas i en andra commit, samma mönster som övriga dataändringar.
    commit: "0000000",
  };
}


/**
 * Indragningen som poster i avvisningsminnet.
 *
 * **Varför den finns.** En avvisad köpost lämnar ett spår — `review.ts` skriver
 * i `avvisade.json`, och nästa skörd hittar meningen och lägger den inte
 * tillbaka. En INDRAGNING gjorde inte det. Löftet försvann ur beståndet, men
 * meningen stod kvar på partiets sida, och skörden hade ingenting som sa att vi
 * redan läst och förkastat den.
 *
 * Kostnaden är mätt två gånger. Kön 2026-09-04 bar 138 poster som var ordagrant
 * återkomster av indragna löften — spärren hade hållit ute var fjärde post i
 * hela kön. Kön 2026-09-05 bar tre till, två av dem ordagrant samma citat som
 * det indragna löftet.
 *
 * Skälet som skrivs in är indragningens eget, med en inledning som säger vad
 * som hände: den som slår upp posten om ett halvår ska se att meningen en gång
 * var publicerad, inte tro att den avvisades direkt ur kön.
 *
 * Ren logik: minnet läses och skrivs av anroparen.
 */
export function avvisningarForIndragna(
  loften: Lofte[],
  rader: Indragningsrad[],
): Array<{ url: string; citat: string; skal: string }> {
  const byId = new Map(loften.map((l) => [l.id, l]));
  const ut: Array<{ url: string; citat: string; skal: string }> = [];
  for (const rad of rader) {
    const lofte = byId.get(rad.id);
    const url = lofte?.source?.url?.trim() ?? "";
    const citat = lofte?.quote?.trim() ?? "";
    // Utan adress eller citat finns ingen nyckel att minnas posten på. Det är
    // inte ett fel som ska stoppa indragningen — löftet dras in ändå — men
    // spärren kan då inte hålla meningen ute, och anroparen säger det.
    if (url === "" || citat === "") continue;
    ut.push({
      url,
      citat,
      skal: `Löftet publicerades och drogs sedan tillbaka: ${rad.skal.trim()}`,
    });
  }
  return ut;
}
