/**
 * Läskopian av Fläskvågens löften, som Handlingsvågens sajt bygger sitt rutnät
 * ur. Reglerna ligger här och inte i skriptet av samma skäl som `domar-bygg.ts`
 * finns skilt från `domar.mts`: BÅDE skrivvägen och kontrollen ska gå genom
 * exakt samma kod. Står regeln på två ställen är den en regel man ändrar två
 * gånger — eller glömmer att ändra på det ena stället.
 *
 * Kopian har legat inaktuell två gånger. Den 7 augusti 2026 saknades 65
 * publicerade löften i rutnätet och två tillbakadragna låg kvar som om de
 * fanns; rättelsen skrev om kopian och slog fast att den ska skrivas om varje
 * gång Fläskvågens data ändras. Två dagar senare hade den glidit igen — 29
 * löften saknades och de tre centerpartistiska dubbletter som drogs in den 9
 * augusti stod kvar. Löftet att köra ett kommando är inte en kontroll, och
 * ingenting sade ifrån någon av gångerna.
 *
 * Ett löfte som saknas i rutnätet ser för läsaren ut som ett löfte partiet
 * aldrig gett. Det är därför den här filen finns.
 */

/** Ett löfte som det ser ut i Fläskvågens `promises.json`. */
export interface RaLoftesuppgift {
  id: string;
  title: string;
  parties?: string[];
  category?: string;
  quote?: string;
  date_stated?: string;
  source?: { url?: string; archive_url?: string | null };
  status?: string;
}

/** En rad i läskopian: det rutnätet, detaljhuvudet och sökningen behöver. */
export interface LoftesradIKopian {
  id: string;
  titel: string;
  kategori: string;
  parties: string[];
  citat: string;
  datum: string;
  kalla_url: string;
  arkiv_url: string | null;
}

/**
 * Kopian räknad ur Fläskvågens löften.
 *
 * Bara publicerade löften följer med. Ett tillbakadraget löfte har ett
 * mänskligt beslut bakom sig och ska inte kunna visas som om det stod kvar —
 * men märk att kopian är det ENDA stället den regeln får verkan på sajten:
 * kopplingarna och utslagen känner den inte, och därför finns `malgrind.ts`.
 */
export function byggKopia(loften: readonly RaLoftesuppgift[]): LoftesradIKopian[] {
  return loften
    .filter((p) => (p.status ?? "aktiv") === "aktiv")
    .map((p) => ({
      id: p.id,
      titel: p.title,
      kategori: p.category ?? "",
      parties: p.parties ?? [],
      citat: p.quote ?? "",
      datum: p.date_stated ?? "",
      kalla_url: p.source?.url ?? "",
      arkiv_url: p.source?.archive_url ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Vad som skiljer den incheckade kopian från en omräkning. */
export interface Kopieglidning {
  /** Publicerade löften som saknas i kopian — osynliga i rutnätet. */
  saknas: string[];
  /** Löften i kopian som inte längre är publicerade — visas som om de fanns. */
  kvarblivna: string[];
  /** Löften som finns i båda men vars innehåll skiljer sig (citat, källa, titel). */
  andrade: string[];
}

export function jamforKopia(
  incheckad: readonly LoftesradIKopian[],
  omraknad: readonly LoftesradIKopian[],
): Kopieglidning {
  const har = new Map(incheckad.map((l) => [l.id, l]));
  const ska = new Map(omraknad.map((l) => [l.id, l]));
  const saknas = [...ska.keys()].filter((id) => !har.has(id)).sort();
  const kvarblivna = [...har.keys()].filter((id) => !ska.has(id)).sort();
  const andrade = [...ska.keys()]
    .filter((id) => har.has(id) && JSON.stringify(har.get(id)) !== JSON.stringify(ska.get(id)))
    .sort();
  return { saknas, kvarblivna, andrade };
}

export function arSamstammig(g: Kopieglidning): boolean {
  return g.saknas.length === 0 && g.kvarblivna.length === 0 && g.andrade.length === 0;
}

/** Glidningen i klartext, med det som drabbar läsaren först. */
export function glidningstext(g: Kopieglidning): string {
  if (arSamstammig(g)) return "Läskopian stämmer med Fläskvågens löften.";
  const rader: string[] = [];
  if (g.saknas.length > 0) {
    rader.push(
      `  ${g.saknas.length} publicerade löften saknas i kopian och syns inte i rutnätet — ` +
        `för läsaren ser de ut som löften partiet aldrig gett: ${g.saknas.join(", ")}`,
    );
  }
  if (g.kvarblivna.length > 0) {
    rader.push(
      `  ${g.kvarblivna.length} löften ligger kvar i kopian trots att de inte är publicerade ` +
        `längre: ${g.kvarblivna.join(", ")}`,
    );
  }
  if (g.andrade.length > 0) {
    rader.push(
      `  ${g.andrade.length} löften visar ett äldre citat, en äldre titel eller en gammal ` +
        `länk: ${g.andrade.join(", ")}`,
    );
  }
  return (
    "Läskopian har glidit från Fläskvågens löften:\n" +
    `${rader.join("\n")}\n\n` +
    "Skriv om den och committa resultatet:\n" +
    "  npm run vendor -- --promises ../../data/promises.json --parties ../../data/parties.json\n" +
    "  npm run domar  -- --promises ../../data/promises.json\n\n" +
    "Ändrar omräkningen vad en läsare redan sett är det en synlig rättelse —\n" +
    "rättelsenot och post i data/rattelser.json, aldrig en tyst omräkning."
  );
}
