/**
 * Byter rubrik på redan publicerade löften.
 *
 * Rubriken är redaktionell — den är vår text om partiets ord, inte partiets
 * egna. Därför får den bytas, till skillnad från citatet. Men den möter läsaren
 * överallt där löftet nämns, så bytet är en **rättelse** och skrivs som en.
 *
 * FÄLLAN. `reviewNyckel(url, title)` bygger prövningens uppslagsnyckel av
 * URL och rubrik. Byter rubriken blir löftet **oprövat** — inte inaktuellt,
 * utan oprövat, som om ingen läst det. Provningsstatusens tak fäller det i
 * nästa körning. Ett rubrikbyte är alltså aldrig färdigt förrän en ny prövning
 * är skriven, och den här modulen vägrar låtsas något annat: varje verkställt
 * byte skriver ut vilka löften som nu saknar prövning.
 *
 * VAD SOM PRÖVAS. Att posten finns och är aktiv, att den nya rubriken är ny,
 * inte tom och inte orimligt lång, att den inte bär en intern beteckning, och
 * — det som är hela poängen — att den nya rubriken har täckning i citatet.
 * En rubrik som lovar mer än citatet är just felet vi rättar.
 */

/** Ord som bär sak. Korta ord och bindeord säger inget om täckningen. */
const SAKORD = (t: string): string[] =>
  t
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3);

/** Grammatiska ändelser som skiljer «vården» från «vård». */
const stam = (w: string): string => w.replace(/(?:arna|erna|orna|ande|ande|ade|arnas|ens|ets|en|et|er|ar|or|na|as|s)$/u, "");

/**
 * Andelen sakord i rubriken som går att finna i citatet.
 *
 * Jämförelsen sker på stam, inte på exakt form: en rubrik får skriva «vård»
 * där citatet skriver «vården». Måttet är grovt med flit — det ska fånga en
 * rubrik som talar om något helt annat än citatet, inte betygsätta ordvalet.
 *
 * **DET HÄR ÄR EN GRIND, INTE ETT SVEP.** Måttet duger för att pröva en rubrik
 * NÅGON JUST SKRIVIT, där formuleringen är fri och kan anpassas. Det duger inte
 * för att leta felaktiga rubriker i beståndet. Körd över alla 2 713 aktiva
 * löften 2026-08-23 gav den 58 poster under 20 procent, och de flesta var
 * måttets fel och inte rubrikens: «Bygg ut läkar- och sjuksköterskeutbildning»
 * mot «utbyggnad av … grundutbildning till läkare och sjuksköterska» får noll,
 * liksom «Indexering» mot «indexeras» och «personaloptionsregler» mot
 * «personaloptioner». Svensk sammansättning och avledning går inte att stamma
 * bort med en ändelselista.
 *
 * Det är samma fälla som fällde tre andra mätningar i samma session: mönstret
 * mäter det egna ordförrådet och inte ett fel. Vill man svepa beståndet efter
 * rubriker som lovar mer än sitt citat får det bli en läsning — det är H5.
 */
export function tackning(rubrik: string, citat: string): number {
  const ord = SAKORD(rubrik).map(stam);
  if (ord.length === 0) return 0;
  const i = new Set(SAKORD(citat).map(stam));
  return ord.filter((w) => i.has(w)).length / ord.length;
}

/** Under den här täckningen talar rubriken om något annat än citatet. */
export const TACKNINGSKRAV = 0.4;

const INTERN_BETECKNING = /\b[kp]-20\d\d-\d{4}\b/u;
const MAXLANGD = 120;

export interface Rubrikrad {
  id: string;
  /** Den nya rubriken, som den ska möta läsaren. */
  rubrik: string;
  /** Vad läsningen fann. Går i rättelseloggen. */
  skal: string;
}

export interface Rubrikpost {
  id: string;
  status?: string;
  title?: string | null;
  quote?: string | null;
  [k: string]: unknown;
}

export function provaRad(
  rad: Rubrikrad,
  loften: ReadonlyMap<string, Rubrikpost>,
): { ok: boolean; fel: string[] } {
  const fel: string[] = [];
  const p = loften.get(rad.id);
  if (!p) return { ok: false, fel: [`${rad.id} finns inte i promises.json`] };
  if ((p.status ?? "aktiv") !== "aktiv") fel.push(`${rad.id} har status ${p.status}`);
  if (rad.skal.trim() === "") fel.push(`${rad.id} saknar skäl — rättelseloggen ska säga vad läsningen fann`);

  const ny = rad.rubrik.trim();
  if (ny === "") fel.push(`${rad.id}: den nya rubriken är tom`);
  if (ny.length > MAXLANGD) fel.push(`${rad.id}: rubriken är ${ny.length} tecken, taket är ${MAXLANGD}`);
  if (INTERN_BETECKNING.test(ny)) fel.push(`${rad.id}: rubriken bär en intern beteckning — den möter läsaren`);
  if (ny === (p.title ?? "").trim()) fel.push(`${rad.id}: rubriken är oförändrad`);

  const t = tackning(ny, p.quote ?? "");
  if (ny !== "" && t < TACKNINGSKRAV) {
    fel.push(
      `${rad.id}: bara ${Math.round(t * 100)} % av rubrikens sakord finns i citatet (krav ${Math.round(TACKNINGSKRAV * 100)} %) — ` +
        `en rubrik som lovar mer än citatet är felet vi rättar`,
    );
  }
  return { ok: fel.length === 0, fel };
}

/** Löftet efter bytet. Allt utom rubriken står stilla. */
export function tillampa(lofte: Rubrikpost, rad: Rubrikrad): Rubrikpost {
  return { ...lofte, title: rad.rubrik.trim() };
}
