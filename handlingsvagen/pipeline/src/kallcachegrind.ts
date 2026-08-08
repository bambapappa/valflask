/**
 * Spärren mot att lägga ett svarsobjekt i källcachen.
 *
 * Cachen tar emot vad den får och skriver ned det som JSON. Ett svarsobjekt
 * från en hämtning har inga egna uppräkningsbara fält, så det blir `{}` — en
 * post som ser ut som ett hämtat dokument utan innehåll. Nästa körning läser
 * den posten i stället för att fråga källan igen, och felet blir permanent utan
 * att någonsin se ut som ett nätfel.
 *
 * Det har hänt: verktyget som skulle avgöra budgetmotionernas anslagstabeller
 * lade svarsobjektet i cachen och kunde därför aldrig läsa en enda tabell. Felet
 * visade sig som «ingen dokumenttext», alltså som ett tomt dokument hos
 * riksdagen, och inte som en hämtning som aldrig gjorts.
 *
 * Spärren ligger i en egen modul för att testsviten ska nå den. Skripten under
 * `scripts/` läser filsystemet när de laddas.
 */

/**
 * Är värdet ett svar från en hämtning i stället för data ur svaret?
 *
 * Prövas på formen och inte på klassnamnet: `instanceof Response` gäller bara
 * den ena av flera hämtare (`node-fetch`, `undici` och en egen stubb ger olika
 * klasser), medan `status` plus en `text`-metod är vad de alla har gemensamt.
 * Ett vanligt dataobjekt bär aldrig en funktion i `text`.
 */
export function arSvarsobjekt(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const o = v as { status?: unknown; text?: unknown; json?: unknown };
  return typeof o.status === "number" && (typeof o.text === "function" || typeof o.json === "function");
}
