/**
 * Vad arkivkontrollen ska öppna: en post per publicerat citat.
 *
 * Läsningen ligger här och inte i skriptet därför att den en gång läste fel.
 * Ståndpunkternas källa ligger i ett eget objekt — `source.url` och
 * `source.archive_url` — men typen i svepet sade `source_url` och
 * `archive_url` rakt på beskedet. Fälten fanns inte, båda lästes som
 * undefined, och svepet rapporterade «saknar arkivkopia» för **varje**
 * publicerad ståndpunkt. Talet 48 av 48 såg ut som en lucka i beläggen och var
 * en lucka i mätaren; 46 av dem hade en arkivkopia som ingen öppnade.
 *
 * En läsare som pekar på ett fält som inte finns säger inte ifrån. Den
 * rapporterar tomt, och tomt är ett giltigt svar i det här datat. Därför
 * prövas läsningen mot den riktiga filen i `tests/arkiv-poster.test.ts`.
 */

/** En sak arkivkontrollen kan öppna en ögonblicksbild för. */
export interface ArkivPost {
  id: string;
  slag: "löfte" | "ståndpunkt";
  quote: string;
  kalla: string;
  arkiv: string | null;
}

export interface StanceCell {
  subquestion_id: string;
  party: string;
  current?: { statement_id?: string | null };
  statements?: {
    id: string;
    quote?: string;
    source?: { url?: string; archive_url?: string | null };
  }[];
}

/**
 * Ståndpunkterna som faktiskt är publicerade med ett belägg.
 *
 * En tom cell är ärlig och har ingen arkivkopia att pröva, så den utelämnas —
 * skillnaden mot «har en kopia som inte bär citatet» är hela poängen med
 * svepet.
 */
export function standpunkterUrCeller(celler: StanceCell[]): ArkivPost[] {
  const ut: ArkivPost[] = [];
  for (const c of celler) {
    const id = c.current?.statement_id;
    if (!id) continue;
    const st = (c.statements ?? []).find((s) => s.id === id);
    if (!st) continue;
    ut.push({
      id: `${c.subquestion_id}/${c.party}`,
      slag: "ståndpunkt",
      quote: st.quote ?? "",
      kalla: st.source?.url ?? "",
      arkiv: st.source?.archive_url ?? null,
    });
  }
  return ut;
}
