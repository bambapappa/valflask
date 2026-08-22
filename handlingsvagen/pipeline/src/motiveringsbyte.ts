/**
 * Byte av MOTIVERING på en redan publicerad koppling.
 *
 * Motiveringen står intill citatet i rutnätet och är det enda en läsare har
 * som säger varför handlingen bär löftet. Att skriva om den är därför en
 * **rättelse**, precis som ett bevisbyte: den kräver en post i
 * `data/rattelser.json`, och den får aldrig ske tyst.
 *
 * Behovet mättes vid genomgången 2026-08-22. Bevisbytet 7–8 augusti bytte
 * citatet på 269 kopplingar men rörde inte meningen som förklarar citatet.
 * Ordtäckningen mellan motiveringens egna ord och dess eget citat föll från
 * 0,342 till 0,186 för de bytta posterna: motiveringen beskriver dokumentet
 * den skrevs mot, medan citatet visar något annat. Det gick inte att rätta
 * med `bevis-byt`, för det är inte beviset som är fel.
 *
 * Ren logik utan fil- och nätverksåtkomst — CLI ligger i
 * `scripts/koppling-motivering.mts`.
 */
import { grundenIProsan } from "./brodtextspar.ts";
import type { KopplingPost } from "./granskning.ts";

/** En rad i listan: vilken koppling, och vilken motivering den ska ha. */
export interface Motiveringsrad {
  id: string;
  motivering: string;
  /** Vad läsningen fann — går in i rättelseposten, inte i motiveringen. */
  skal: string;
}

export interface Motiveringsprovning {
  ok: boolean;
  fel: string[];
}

/** Motiveringen ska säga något, och den ska säga något ANNAT än den redan gör. */
export function provaMotivering(
  koppling: KopplingPost | undefined,
  rad: Motiveringsrad,
): Motiveringsprovning {
  const fel: string[] = [];
  if (!koppling) {
    fel.push(`${rad.id} finns inte i kopplingar.json`);
    return { ok: false, fel };
  }
  if (koppling.status !== "aktiv") {
    fel.push(`${rad.id} har status ${koppling.status} — bara aktiva kopplingar visas för läsaren`);
  }
  if (rad.motivering.trim() === "") fel.push(`${rad.id} saknar ny motivering`);
  if (rad.motivering.trim() === (koppling.method_note ?? "").trim()) {
    fel.push(`${rad.id}: den nya motiveringen är densamma som den nuvarande — det finns inget att rätta`);
  }
  if (rad.skal.trim() === "") {
    fel.push(`${rad.id} saknar skäl. Rättelseloggen ska säga vad läsningen fann, inte bara att något ändrats`);
  }
  // En motivering som nämner ett annat löftes eller en annan kopplings id gör
  // interna beteckningar publika. Samma regel som i valflasks publicerade text.
  const idIProsan = /\b[kp]-20\d\d-\d{4}\b/u.exec(rad.motivering);
  if (idIProsan) {
    fel.push(`${rad.id}: motiveringen innehåller den interna beteckningen ${idIProsan[0]} — skriv ut saken i ord`);
  }
  return { ok: fel.length === 0, fel };
}

/**
 * Kopplingen med den nya motiveringen.
 *
 * Fältet `bevis.brodtext_oppen` räknas om ur den NYA prosan. Skrivs den om så
 * att undantaget inte längre står utskrivet ska fältet försvinna med den —
 * annars påstår fältet en grund som ingen text längre förklarar, och
 * `tests/brodtextspar.test.ts` faller. Att låta provet falla vore ärligt men
 * onödigt: regeln hör hemma här, där ändringen görs.
 */
export function bytMotivering(koppling: KopplingPost, rad: Motiveringsrad): KopplingPost {
  const grund = grundenIProsan(rad.motivering);
  const { brodtext_oppen: _tidigare, ...bevis } = koppling.bevis;
  return {
    ...koppling,
    bevis: grund ? { ...bevis, brodtext_oppen: grund } : bevis,
    method_note: rad.motivering.trim(),
  };
}

/** En rättelsepost för hela genomgången — rättelser samlas, en post per körning. */
export function rattelsePost(
  rader: Motiveringsrad[],
  loften: string[],
  datum: string,
  varfor: string,
): { date: string; affects: string; what: string; why: string; commit: string } {
  return {
    date: datum,
    affects:
      `Handlingsvågens rutnät och löftessidorna för ${loften.join(", ")} — ` +
      `${rader.length} ${rader.length === 1 ? "motivering" : "motiveringar"} omskrivna`,
    what:
      `Texten som förklarar varför handlingen bär löftet är omskriven för ${rader.length} ` +
      `${rader.length === 1 ? "koppling" : "kopplingar"}. Citatet, riktningen, handlingen och ` +
      "bedömningen står stilla — det är förklaringen som är rättad, inte belägget.",
    why: varfor,
    // Backfillas i en andra commit, samma mönster som övriga dataändringar.
    commit: "0000000",
  };
}
