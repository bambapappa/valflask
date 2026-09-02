/**
 * Läsliga orsakskoder för rättelseposter.
 *
 * Koderna kommer från genomgången av samtliga rättelser 2026-07–08
 * (handoff: `projekt/utlovat/ANDRINGARNA-ANALYS-2026-09-01.md`): nästan
 * inget fel var ett omdömesfel — de var strukturella, och skillnaden
 * mellan beslutsunderlaget och rättelsetillfället faller på sex återkommande
 * sätt. Koden säger vilket, så att nästa mönsteranalys blir en uppslagning
 * i stället för ett regex-bygge på fritext.
 *
 * Koderna är läsliga med flit — de kan komma att visas för läsaren, och en
 * intern beteckning (\"D2\", \"regel 13\") säger en utomstående ingenting.
 * Schemat (`schemas/rattelser.schema.json`) har samma lista; håll dem jämna.
 */
export const ORSAKKODER = [
  "regel-saknades",
  "käll djup — partiets/länkade källans egen siffra lästes för sent",
  "läsmetod — dubblett i annan lydelse syns bara vid genomläsning",
  "mätaren felade — verktyg/kod på egen sida",
  "tiden — ankare/källa åldrades",
  "konsekvenssvepet uteblev",
  "annat",
] as const;

export type Orsakkod = (typeof ORSAKKODER)[number];

/** Poster från och med detta datum ska bära en orsak (grind: rattelseschema.test.ts).
 *
 * Inte 2026-09-01: fem poster det datumet skrevs av en annan session samma
 * dag, innan fältet fanns, och skrivs inte om i efterhand. Grinden gäller
 * första rättelsen efter det här — ingen glidande start. */
export const ORSAK_FRAN = "2026-09-02";

/**
 * Läser `--orsak <kod>` ur kommandoraden och validerar den.
 *
 * Returnerar koden, eller `null` när flaggan saknas eller inte är en av
 * koderna — skriptet ska då vägra skriva och skriva ut listan. Dela gärna av
 * med `--` precis som övriga flaggor: `pnpm lofte-dra-in -- fil.tsv --skriv
 * --orsak regel-saknades`.
 */
export function lasOrsak(argv: readonly string[]): Orsakkod | null {
  const i = argv.indexOf("--orsak");
  if (i === -1 || i + 1 >= argv.length) return null;
  const kandidat = argv[i + 1];
  if (kandidat === undefined) return null;
  return (ORSAKKODER as readonly string[]).includes(kandidat) ? (kandidat as Orsakkod) : null;
}
