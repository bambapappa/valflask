export interface Sakreferens {
  id: string;
  slag: "kalla" | "regel";
  adress: string;
  innehall: string;
}
export const SAKMOMENT = {
  teknik: "Är format, identiteter och beräkningar tekniskt giltiga?",
  kallstod: "Står citatet i källan och bär sammanhanget påståendet?",
  loftesregel: "Är detta ett löfte enligt den angivna metodversionen?",
  aktor: "Är rätt parti eller person ansvarig för påståendet?",
  grupper: "Är grupp, ankare och hantering av överlappningar riktiga?",
  ekonomi: "Prissätts rätt åtgärd, används partiets belopp där det finns och är nollor rätt klassade?",
  period: "Avser varje belopp rätt år, period, enhet och jämförelsegrund?",
  journalisten: "Vilken invändning skulle en journalist resa och vad besvarar den?",
  sakkunnig: "Vilken invändning skulle en sakkunnig resa och vad besvarar den?",
  partiet: "Vilken invändning skulle det granskade partiet resa och vad besvarar den?",
} as const;
export type Sakmoment = keyof typeof SAKMOMENT;
export interface Sakbedomning {
  moment: Sakmoment;
  utfall: "styrkt" | "motsagt" | "oavgjort";
  motivering: string;
  belagg: string[];
}
export function ordnaSakreferenser(referenser: readonly Sakreferens[]): Sakreferens[] {
  const ids = new Set<string>();
  for (const r of referenser) {
    if (!r || !r.id?.trim() || ids.has(r.id) || !["kalla", "regel"].includes(r.slag) ||
        !r.adress?.trim() || !r.innehall?.trim() ||
        Object.keys(r).sort().join(",") !== "adress,id,innehall,slag") {
      throw new Error("Referensmaterial saknas, är dubblerat eller har okänt format");
    }
    ids.add(r.id);
  }
  return structuredClone([...referenser].sort((a, b) => a.id.localeCompare(b.id)));
}

/** Samma obligatoriska sakmoment för postförslag och hela publiceringsomgångar. */
export function sakmomentensBeredskap(bedomare: string | null, bedomningar: Sakbedomning[], material: readonly Sakreferens[]): { klar: boolean; hinder: string[] } {
  try {
    const refs = ordnaSakreferenser(material);
    const hinder: string[] = [];
    if (!bedomare?.trim()) hinder.push("Bedömare saknas");
    for (const slag of ["kalla", "regel"] as const) {
      if (!refs.some((r) => r.slag === slag)) hinder.push(`Referensmaterial saknas: ${slag}`);
    }
    const ids = new Set(refs.map((r) => r.id));
    const moment = Object.keys(SAKMOMENT) as Sakmoment[];
    if (!Array.isArray(bedomningar) || bedomningar.length !== moment.length ||
        new Set(bedomningar.map((b) => b.moment)).size !== moment.length) {
      throw new Error("Sakprövningen måste redovisa varje moment exakt en gång");
    }
    for (const b of bedomningar) {
      if (!moment.includes(b.moment) || !["styrkt", "motsagt", "oavgjort"].includes(b.utfall) ||
          Object.keys(b).sort().join(",") !== "belagg,moment,motivering,utfall") {
        throw new Error("Okänt bedömningsformat");
      }
      if (b.utfall !== "styrkt") hinder.push(`${b.moment}: ${b.utfall}`);
      if (!b.motivering?.trim() || !Array.isArray(b.belagg) || !b.belagg.length ||
          b.belagg.some((id) => !ids.has(id))) hinder.push(`${b.moment}: motivering eller spårbara belägg saknas`);
    }
    return { klar: hinder.length === 0, hinder };
  } catch (error) {
    return { klar: false, hinder: [error instanceof Error ? error.message : String(error)] };
  }
}
