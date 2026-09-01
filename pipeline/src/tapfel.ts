/**
 * Vilka prov föll? — läst ur provsvitens egen utskrift.
 *
 * Node skriver provresultat som TAP: en rad per prov, plus ett indraget block
 * med felet under de som fallit. Sviten har 1 118 prov och utskriften blir
 * omkring tiotusen rader. GitHubs jobblogg går bara att läsa 5 000 rader från
 * slutet, och de raderna täcker de sista sekunderna av körningen — så när
 * något faller mitt i, faller det utom synhåll.
 *
 * Det hände 2026-09-01. `test-pipeline` sa «1 115 prov, 2 fällda» och
 * ingenting mer som gick att nå. Det tog två körningar, en omkörning och sex
 * misslyckade försök att återskapa felet lokalt innan orsaken gick att peka
 * ut — och den pekades ut genom att ta bort den misstänkta konstruktionen,
 * inte genom att läsa felet. En svit som säger ATT något föll men inte VAD är
 * samma tystnad som resten av det passet handlade om.
 *
 * Funktionen nedan plockar ut de fallna proven ur utskriften så att de kan
 * skrivas SIST i loggen, där svansen når dem.
 */

export interface FalltProv {
  /** Provets namn, som det står efter «not ok N - ». */
  namn: string;
  /** Raderna under provet som bär felet — meddelandet, inte hela stacken. */
  detalj: string[];
}

/** Hur många rader ur felblocket som följer med. Nog för meddelandet. */
const DETALJRADER = 12;

/**
 * De fallna proven, i den ordning de föll.
 *
 * Kapslade prov skrivs indragna, så mönstret tillåter inledande blanksteg.
 * En `# Subtest:`-rad är bara en rubrik och räknas inte — bara `not ok`.
 * Rader som redan bär `not ok` för en SVIT tas med de också: en svit som
 * faller utan att något enskilt prov gör det är i sig ett svar.
 */
export function fallda(tap: string): FalltProv[] {
  const rader = tap.split("\n");
  const ut: FalltProv[] = [];
  for (let i = 0; i < rader.length; i += 1) {
    const m = /^\s*not ok\s+\d+\s*-\s*(.*)$/u.exec(rader[i] ?? "");
    if (!m) continue;
    const detalj: string[] = [];
    for (let j = i + 1; j < rader.length && detalj.length < DETALJRADER; j += 1) {
      const rad = rader[j] ?? "";
      // Nästa provrad avslutar blocket — annars svämmar ett fel in i nästa.
      if (/^\s*(not )?ok\s+\d+/u.test(rad) || /^\s*# Subtest:/u.test(rad)) break;
      if (rad.trim() === "" || rad.trim() === "---" || rad.trim() === "...") continue;
      detalj.push(rad.replace(/\s+$/u, ""));
    }
    ut.push({ namn: (m[1] ?? "").trim(), detalj });
  }
  return ut;
}

/**
 * Sammanfattningen som skrivs sist i loggen.
 *
 * Tom sträng när ingenting föll — då ska steget inte säga något alls, så att
 * en grön körning förblir tyst.
 */
export function sammanfattning(tap: string): string {
  const f = fallda(tap);
  if (f.length === 0) return "";
  const rader = [`${f.length} prov föll:`, ""];
  for (const p of f) {
    rader.push(`  ✗ ${p.namn}`);
    for (const d of p.detalj) rader.push(`      ${d.trim()}`);
    rader.push("");
  }
  return rader.join("\n");
}
