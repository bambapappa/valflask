/**
 * Vilken dag det är, svensk tid.
 *
 * `new Date().toISOString().slice(0, 10)` ger dagen i UTC. Sverige ligger en
 * eller två timmar före, så varje datum projektet stämplar mellan midnatt och
 * gryningen blir **gårdagens**: rättelseposter, historikrader, indragningar,
 * prövningsdatum, körloggar.
 *
 * Det upptäcktes 2026-08-23 klockan 00:28 svensk tid, när en rättelsepost för
 * sex omskrivna motiveringar skrevs med datumet 2026-08-22. Rättelsen fanns,
 * loggen var fullständig — och den sa att den skedde dagen före den skedde.
 *
 * För en sajt vars hela värde är att gå att kontrollera är det inte en
 * skönhetsfläck. En läsare som jämför rättelseloggen med en commit-tidsstämpel
 * ska inte hitta en dags glapp, och en granskning som säger vilken dag den
 * lästes ska säga rätt dag.
 *
 * Mönstret var på 29 ställen i 24 filer när det mättes. Grinden
 * `pnpm test:dagen` hindrar att det kommer tillbaka — en regel utan grind är
 * en påminnelse, och påminnelser åldras.
 */

/** Tidszonen allt i projektet daterar i. Sajten är svensk; dagen är svensk. */
export const TIDSZON = "Europe/Stockholm";

const FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TIDSZON,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Dagens datum som `ÅÅÅÅ-MM-DD`, svensk tid.
 *
 * `nu` finns för proven. Ingen anropare utanför dem ska ge den — en dag som
 * går att skicka in är en dag som går att skicka in fel.
 */
export function svenskDag(nu: Date = new Date()): string {
  return FORMAT.format(nu);
}

/**
 * Tidsstämpel i svensk tid, `ÅÅÅÅ-MM-DDTHH:MM:SS+HH:MM`.
 *
 * För de fält som bär en tidpunkt och inte bara en dag. Samma skäl: en
 * körlogg som säger 22:28 när klockan var 00:28 är inte fel med två timmar,
 * den är fel med en dag för den som läser bara datumet.
 */
export function nuIStockholm(nu: Date = new Date()): string {
  const delar = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIDSZON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(nu);
  const d = Object.fromEntries(delar.map((p) => [p.type, p.value]));
  const forskjutning = offset(nu);
  return `${d["year"]}-${d["month"]}-${d["day"]}T${d["hour"]}:${d["minute"]}:${d["second"]}${forskjutning}`;
}

/** Sveriges avvikelse från UTC vid en given tidpunkt, som `+02:00`. */
function offset(nu: Date): string {
  const namn = new Intl.DateTimeFormat("en-US", { timeZone: TIDSZON, timeZoneName: "longOffset" })
    .formatToParts(nu)
    .find((p) => p.type === "timeZoneName")?.value;
  // `longOffset` ger "GMT+02:00"; vid UTC±0 ger den bara "GMT".
  const träff = /GMT([+-]\d{2}:\d{2})/u.exec(namn ?? "");
  return träff?.[1] ?? "+00:00";
}
