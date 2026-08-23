/**
 * Rubrikkravet: två löften från samma parti får inte bära samma rubrik när
 * deras citat säger olika saker.
 *
 * VARFÖR. Rubriken är det läsaren ser i listan, i jämförelsen och i sökningen;
 * citatet är det partiet faktiskt sagt. Står samma rubrik två gånger hos samma
 * parti med olika pris under sig ser läsaren ett parti som lovat samma sak till
 * två priser. Så var det inte — det var två olika löften, och ett av dem har
 * fått fel rubrik.
 *
 * Fyndet kom ur ankarpasset 2026-08-23. «Förbjuda skadlig trålning» (M, 5 mkr)
 * fanns två gånger. Det ena citatet säger att skadlig trålning bör förbjudas.
 * Det andra säger att trålgränsen ska flyttas längre ut från kusten — en annan
 * åtgärd, med samma rubrik. Kandidatsökningen efter ankaren tog dem för
 * varandras jämförelse, och det var de inte.
 *
 * VARFÖR CITATLIKHET OCH INTE BARA DUBBLETTRUBRIK. Samma parti kan mycket väl
 * upprepa ett löfte i två dokument, och då är samma rubrik rätt: det ÄR samma
 * sak sagd två gånger. Kravet gäller därför bara när citaten dessutom skiljer
 * sig åt, och tröskeln är satt lågt — likheten ska vara under en tredjedel
 * innan grinden fäller. Ett omskrivet men likalydande citat passerar.
 *
 * VAD DET INTE FÅNGAR: en rubrik som beskriver sitt citat dåligt utan att någon
 * annan post råkar bära samma rubrik. Det är en läsning, och den ligger i H5.
 */

/** Löftesfälten kravet läser. Delmängd av promises.json. */
export interface Rubrikpost {
  id: string;
  status?: string;
  title?: string | null;
  quote?: string | null;
  parties?: readonly string[] | null;
}

const normalisera = (t: string | null | undefined): string =>
  (t ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();

/** Orden i texten, för måttet på hur lika två citat är. */
const orden = (t: string | null | undefined): Set<string> =>
  new Set(normalisera(t).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));

/**
 * Andelen ord två citat delar, av alla ord de tillsammans bär.
 *
 * Måttet är avsiktligt grovt. Det ska skilja «samma löfte i två dokument» från
 * «två skilda åtgärder under en rubrik», inte gradera prosa.
 */
export function citatlikhet(a: string | null | undefined, b: string | null | undefined): number {
  const x = orden(a);
  const y = orden(b);
  if (x.size === 0 || y.size === 0) return 0;
  let delade = 0;
  for (const w of x) if (y.has(w)) delade += 1;
  return delade / (x.size + y.size - delade);
}

/** Under den här likheten är citaten två skilda saker. */
export const LIKHETSGRANS = 1 / 3;

export interface Rubrikbrott {
  /** Rubriken de delar, i sitt ursprungliga skick. */
  rubrik: string;
  parti: string;
  ids: [string, string];
  likhet: number;
}

/**
 * Alla par av aktiva löften som delar parti och rubrik men inte sak.
 *
 * Stabil ordning: efter rubrik, sedan efter id-paret.
 */
export function rubrikbrott(poster: readonly Rubrikpost[]): Rubrikbrott[] {
  const aktiva = poster.filter((p) => p.status === "aktiv" && normalisera(p.title) !== "");
  const hogar = new Map<string, Rubrikpost[]>();
  for (const p of aktiva) {
    const nyckel = normalisera(p.title);
    const hog = hogar.get(nyckel);
    if (hog) hog.push(p);
    else hogar.set(nyckel, [p]);
  }

  const brott: Rubrikbrott[] = [];
  for (const hog of hogar.values()) {
    if (hog.length < 2) continue;
    for (let i = 0; i < hog.length; i += 1) {
      for (let j = i + 1; j < hog.length; j += 1) {
        const a = hog[i]!;
        const b = hog[j]!;
        const delade = (a.parties ?? []).filter((x) => (b.parties ?? []).includes(x));
        if (delade.length === 0) continue;
        const likhet = citatlikhet(a.quote, b.quote);
        if (likhet >= LIKHETSGRANS) continue;
        const [x, y] = [a.id, b.id].sort() as [string, string];
        brott.push({ rubrik: a.title ?? "", parti: delade.sort()[0]!, ids: [x, y], likhet });
      }
    }
  }
  return brott.sort((p, q) =>
    p.rubrik.localeCompare(q.rubrik, "sv") || p.ids[0].localeCompare(q.ids[0]),
  );
}
