/**
 * Riksdagens eget sök — hela mandatperioden, inte bara vårt urval.
 *
 * VARFÖR DEN HÄR FINNS. Vårt nyckelordsregister sparar de fyrtio
 * vanligaste ordstammarna per dokument. Det gör registret bra på vad ett
 * dokument HANDLAR OM, och blint för allt annat som STÅR I det: ett ord
 * som nämns en gång i en lång motion hamnar aldrig i indexet. Mätt
 * 2026-08-10: "NPF" ger 8 motioner hos oss och 57 hos riksdagen — ur
 * samma motioner. Skillnaden är inte att vi saknar dokumenten.
 *
 * Riksdagen söker igenom hela texten och når dessutom dokumentsorter vi
 * aldrig skördar: betänkanden, protokoll, utredningar, EU-handlingar. Att
 * fråga dem är därför både ärligare och fullständigare än att bygga ett
 * andra eget index — vilket skulle kosta hundratals megabyte och ändå
 * aldrig nå lika långt.
 *
 * HEDERLIGHETEN, oförändrad: listan härifrån SÖKER, den dömer aldrig. Vi
 * har inte läst dokumenten och inte kontrollerat dem, och att ett ord står
 * i en text säger ingenting om huruvida ett parti är för eller emot.
 * Riktning kommer även fortsättningsvis bara ur en godkänd koppling.
 *
 * Ingen nätåtkomst i den här filen: den bygger adresser och tolkar svar,
 * inget mer. Samma delning som `pipeline/src/riksdagen.ts` gör med sin
 * injicerade fetch, och av samma skäl — det ska gå att pröva utan nät.
 */

/**
 * Dagen riksdagen samlades efter valet 2022, och därmed mandatperiodens
 * början. Vår egen första skördade handling är daterad 2022-09-30.
 */
export const MANDATPERIODENS_START = "2022-09-26";

const DOKUMENTLISTA = "https://data.riksdagen.se/dokumentlista/";

/**
 * Kortaste ordet som får trunkeras med `*`.
 *
 * Trunkering är vad som motsvarar vår egen stamning hos riksdagen:
 * `vårdplats*` når "vårdplatser", precis som stammen `vårdplats` gör i vårt
 * index. Men på korta ord breddar den fel — mätt 2026-08-10 gav `eu` 2 387
 * motioner och `eu*` 3 356, alltså tusen träffar på "euro", "europeisk" och
 * annat läsaren inte bad om. Förkortningar på tre tecken förlorar ingenting
 * på att stå orörda: `npf` och `npf*` gav båda 57, `lss` och `lss*` båda 175.
 */
export const MINSTA_TRUNKERING = 4;

/** En träff hos riksdagen, skalad till det raden behöver visa. */
export interface RiksdagsTraff {
  /** riksdagens eget dokument-id, t.ex. "HD024041" */
  dok_id: string;
  /** riksdagens kod för sorten, t.ex. "mot" */
  doktyp: string;
  /** riksdagens EGET läsbara namn på sorten, t.ex. "Motion" */
  sort: string;
  datum: string;
  titel: string;
  organ?: string;
  /** partibokstäver ur dokumentets intressenter, gemena och sorterade */
  partier: string[];
  url: string;
}

export interface RiksdagsSvar {
  /** hela antalet träffar hos riksdagen — inte antalet rader i svaret */
  traffar: number;
  dokument: RiksdagsTraff[];
  /** adressen till nästa sida, eller null när listan är slut */
  nastaUrl: string | null;
}

function asArray<T>(x: T | T[] | undefined | null): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

/**
 * Söktermen för ETT ord: den kortaste stammen, trunkerad när den är lång
 * nog att tåla det.
 *
 * Den kortaste stammen väljs för att den är den mest omfattande — `skol`
 * når både "skola" och "skolor", medan `skolan` bara når sig själv.
 */
export function sokterm(stammar: readonly string[]): string {
  const kortast = [...stammar].sort((a, b) => a.length - b.length || a.localeCompare(b, "sv"))[0] ?? "";
  if (kortast === "") return "";
  return kortast.length >= MINSTA_TRUNKERING ? `${kortast}*` : kortast;
}

export interface FragaOpts {
  /** ett stammar-fält per sökord, i den ordning läsaren skrev dem */
  ord: readonly (readonly string[])[];
  /** ikryssade partier; tom lista betyder alla */
  partier?: readonly string[];
  /** sista datum i fönstret — dagens datum när sidan frågar */
  tom: string;
  /** antal rader per sida */
  sz?: number;
  /** "json" för listan i sidan, "html" för länken en läsare kan följa */
  format?: "json" | "html";
}

/**
 * Adressen till riksdagens dokumentlista för en fråga.
 *
 * Flera ord snittas av riksdagen precis som hos oss — mätt 2026-08-10 gav
 * "kärnkraft" 190 motioner, "vårdplatser" 66 och de två tillsammans 9. Ett
 * mellanslag räcker alltså; någon egen och-logik behövs inte.
 */
export function byggFraga(opts: FragaOpts): string {
  const termer = opts.ord.map((stammar) => sokterm(stammar)).filter((t) => t !== "");
  const p = new URLSearchParams({
    sok: termer.join(" "),
    from: MANDATPERIODENS_START,
    tom: opts.tom,
    sort: "datum",
    sortorder: "desc",
    utformat: opts.format ?? "json",
  });
  if (opts.sz !== undefined) p.set("sz", String(opts.sz));
  // Riksdagen filtrerar på dokumentets intressenter. Sorter utan
  // partiavsändare — betänkanden, protokoll, utredningar — faller därmed
  // bort så snart ett kryss är i. Sidan skriver ut det; att tiga om det
  // vore att låta ett filter se ut som en fullständig lista.
  for (const parti of opts.partier ?? []) p.append("parti", parti);
  return `${DOKUMENTLISTA}?${p}`;
}

/**
 * Samma fråga som en sida en läsare kan öppna.
 *
 * Riksdagens vanliga söksida (`riksdagen.se/sv/sok`) vore snyggare, men den
 * bär varken vårt datumfönster eller trunkeringen — läsaren skulle få ett
 * annat antal än det vi just visat, och två tal som inte går ihop är värre
 * än en oputsad sida. Den här adressen ger exakt samma träffmängd.
 */
export function byggSoksidaAdress(opts: Omit<FragaOpts, "format">): string {
  return byggFraga({ ...opts, format: "html" });
}

/**
 * Tolkar ett dokumentlista-svar.
 *
 * Fällan som redan kostat pipelinen tid: `@nasta_sida` kommer som `http:`
 * och måste tvingas till `https:`, annars blockerar sidans egen
 * uppgradering av osäkra anrop hämtningen (jfr `pipeline/src/riksdagen.ts`).
 */
export function tolkaSvar(payload: unknown): RiksdagsSvar {
  const dl = (payload as { dokumentlista?: Record<string, unknown> } | null)?.dokumentlista;
  if (!dl) throw new Error("svar utan dokumentlista");
  const dokument = asArray(
    dl["dokument"] as Record<string, unknown> | Array<Record<string, unknown>> | undefined,
  )
    .map((d): RiksdagsTraff => {
      const intressenter = asArray(
        (d["dokintressent"] as { intressent?: unknown } | undefined)?.intressent as
          | Record<string, unknown>
          | Array<Record<string, unknown>>
          | undefined,
      );
      const doktyp = String(d["doktyp"] ?? "");
      const dokId = String(d["dok_id"] ?? d["id"] ?? "");
      return {
        dok_id: dokId,
        doktyp,
        // Riksdagens EGET namn på sorten. Vi hittar aldrig på ett namn för
        // en sort vi inte känner — då står koden kvar, och läsaren ser att
        // det är riksdagens ord och inte våra.
        sort: String(d["dokumentnamn"] ?? "").trim() || doktyp,
        datum: String(d["datum"] ?? "").slice(0, 10),
        titel: String(d["titel"] ?? ""),
        ...(String(d["organ"] ?? "").trim() ? { organ: String(d["organ"]).trim() } : {}),
        partier: [
          ...new Set(
            intressenter
              .map((i) => String(i["partibet"] ?? "").toLowerCase())
              .filter((p) => p !== ""),
          ),
        ].sort(),
        url: `https://data.riksdagen.se/dokument/${dokId}`,
      };
    })
    .filter((d) => d.dok_id !== "");
  const nasta = dl["@nasta_sida"];
  return {
    traffar: Number(dl["@traffar"] ?? dokument.length) || 0,
    dokument,
    nastaUrl:
      typeof nasta === "string" && nasta.length > 0 ? nasta.replace(/^http:/u, "https:") : null,
  };
}
