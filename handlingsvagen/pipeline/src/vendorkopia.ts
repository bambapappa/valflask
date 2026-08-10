/**
 * Läskopian av Fläskvågens löften, som Handlingsvågens sajt bygger sitt rutnät
 * ur. Reglerna ligger här och inte i skriptet av samma skäl som `domar-bygg.ts`
 * finns skilt från `domar.mts`: BÅDE skrivvägen och kontrollen ska gå genom
 * exakt samma kod. Står regeln på två ställen är den en regel man ändrar två
 * gånger — eller glömmer att ändra på det ena stället.
 *
 * Kopian har legat inaktuell två gånger — 65 löften den 7 augusti 2026, 29 den
 * 9 augusti — utan att något sade ifrån. Rättelsen båda gångerna var ett
 * åtagande att köra om kommandot varje gång Fläskvågens data ändras, och båda
 * gångerna glömdes det. Ett åtagande är inte en kontroll.
 *
 * **Det här är ordning i vårt eget material, inte en spärr mot fel hos
 * läsaren.** Sajtbygget skriver om kopian ur `promises.json` innan
 * Handlingsvågen byggs (steget "Läs in löftena ur samma träd" i `build.yml`,
 * infört 6 augusti), så det som publiceras är alltid dagens löften hur gammal
 * den incheckade filen än är. Skälet att ändå vakta den är att en fil i
 * förrådet som inte stämmer med sin källa är en andra sanning: den läses av
 * proven, av den som felsöker, och av nästa verktyg någon skriver mot den —
 * och den dagen byggsteget flyttas eller tas bort blir glidningen synlig
 * utåt utan att något ändrats i den här filen.
 *
 * Den 10 augusti skrevs en rättelsepost som sade att de 29 löftena saknats i
 * rutnätet. Det var fel av just det skälet ovan, och posten är rättad i
 * `data/rattelser.json`.
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
      `  ${g.saknas.length} publicerade löften saknas i kopian: ${g.saknas.join(", ")}`,
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
    "Sajten är inte fel så länge byggsteget står kvar — det skriver om kopian\n" +
    "innan Handlingsvågen byggs. Ändrar omräkningen ändå något en läsare sett,\n" +
    "till exempel ett utslag ur domar.json, är det en synlig rättelse: rättelsenot\n" +
    "och post i data/rattelser.json, aldrig en tyst omräkning."
  );
}
