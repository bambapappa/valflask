/**
 * Källröta — vad ett svar från en källa betyder.
 *
 * Frågevågen har haft rötbevakning sedan lanseringen; Fläskvågens 700+ källor
 * har aldrig haft någon. Den 9 augusti 2026 visade sig två publicerade löften
 * peka på en adress som svarar 404, och det hittades av en slump när en
 * arkivkopia skulle sättas. En källa som inte går att öppna är ingen källa —
 * läsaren ska kunna kontrollera oss, och kunde inte det.
 *
 * Bedömningen ligger här och inte i skriptet för att den ska gå att pröva utan
 * att någon rör nätet.
 */
import { normalizeForVerbatim } from "./gates.ts";
import { quoteInSnapshotText } from "./archive-verify.ts";

/**
 * `ok` källan svarar och citatet står kvar ordagrant.
 * `andrad` källan svarar, men citatet står inte längre där.
 * `borttagen` källan svarar 404/410 — sidan är borta.
 * `obestamd` vi vet inte: nätfel, timeout, 429, 5xx.
 *
 * **`obestamd` ändrar aldrig en status.** Vi anklagar ingen för att ha tagit
 * bort en sida på grund av vårt eget nätstrul — samma regel som arkivsvepets
 * `oavgjort`, och samma skäl.
 */
export type Rotutfall = "ok" | "andrad" | "borttagen" | "obestamd";

/** Vad statuskoden ensam säger, innan texten ens hämtats. */
export function utfallAvStatus(status: number): Rotutfall | null {
  if (status === 404 || status === 410) return "borttagen";
  if (status < 200 || status >= 300) return "obestamd";
  return null; // svaret duger — citatet avgör
}

/**
 * Står citatet kvar i källans text? Samma kanon som citatgrinden och
 * arkivkontrollen, inklusive att citatets avslutande skiljetecken inte avgör
 * något (mänskligt beslut 2026-08-09).
 */
export function utfallAvText(text: string, quote: string): Rotutfall {
  if (normalizeForVerbatim(quote) === "") return "obestamd";
  return quoteInSnapshotText(text, quote) ? "ok" : "andrad";
}

/** Ska den här statusen skrivas in? Ett obestämt svar lämnar allt orört. */
export function skaSkrivas(gammal: Rotutfall | undefined, ny: Rotutfall): boolean {
  return ny !== "obestamd" && gammal !== ny;
}

/* ══════════════════════════════════════════════════ vad som faktiskt ändrats ══ */

/**
 * En stämpel är inget bevis.
 *
 * `andrad` säger att citatet inte längre står i källan — inte vad som står där
 * i stället. Ska ett sådant fall kunna läggas fram offentligt måste läsaren se
 * båda leden: vad vi citerade, och vad sidan säger i dag. Annars ber vi läsaren
 * ta vårt ord för att någon annan ändrat sig, och det är precis den sortens
 * anspråk som ska bäras av belägg och inte av förtroende.
 *
 * `hittaPassage` letar upp den längsta sammanhängande ordföljden ur citatet som
 * FORTFARANDE står i sidan, och lämnar tillbaka meningen den sitter i. Det är
 * den formen ett fall får läggas fram i: två stycken bredvid varandra.
 *
 * Hittas ingen ordföljd alls är det inte ett citat som formulerats om — då är
 * sidan en annan sida, och det är ett annat slags fall (se `andringsslag`).
 */

/** Minsta ordföljd som duger som ankare. Kortare än så kan vara en slump. */
const MINSTA_ANKARE_ORD = 5;

/**
 * Den längsta sammanhängande ordföljden ur `quote` som står kvar i `text`.
 * Jämförelsen sker på samma kanon som citatgrinden.
 */
export function langstaKvarvarandeOrdfoljd(text: string, quote: string): string {
  const hostack = normalizeForVerbatim(text);
  const ord = normalizeForVerbatim(quote).split(" ").filter(Boolean);
  let bast = "";
  for (let start = 0; start < ord.length; start++) {
    // Bara längre träffar än den bästa hittills är värda att pröva.
    for (let slut = ord.length; slut > start + bast.split(" ").filter(Boolean).length; slut--) {
      const bit = ord.slice(start, slut).join(" ");
      if (bit.split(" ").length >= MINSTA_ANKARE_ORD && hostack.includes(bit)) {
        bast = bit;
        break;
      }
    }
  }
  return bast;
}

/**
 * Meningen som står på sidan i dag, där citatet stod förut.
 *
 * Fönstret ankras i den kvarvarande ordföljden och sträcks ut till närmaste
 * meningsgräns åt båda håll, så att läsaren får en hel mening och inte en
 * avhuggen rad. Blir det ingen träff är det inte en omformulering — då
 * returneras null och fallet får beskrivas som en utbytt sida i stället.
 */
export function hittaPassage(text: string, quote: string): string | null {
  const ankare = langstaKvarvarandeOrdfoljd(text, quote);
  if (ankare === "") return null;

  const hostack = normalizeForVerbatim(text);
  const i = hostack.indexOf(ankare);
  const langd = normalizeForVerbatim(quote).length;

  // Bakåt till föregående meningsslut, framåt till nästa — men aldrig så långt
  // att passagen blir ett stycke i stället för en mening.
  const golv = Math.max(0, i - 120);
  const fore = hostack.slice(golv, i);
  const borja = golv + Math.max(0, fore.search(/[.!?]\s[^.!?]*$/u) + 2);

  const tak = Math.min(hostack.length, i + ankare.length + langd + 120);
  const efter = hostack.slice(i + ankare.length, tak);
  const slutar = efter.search(/[.!?](\s|$)/u);
  const sluta = slutar === -1 ? tak : i + ankare.length + slutar + 1;

  return hostack.slice(borja, sluta).trim();
}

/**
 * Vilket slags ändring är det?
 *
 * Skillnaden är inte kosmetisk. En omskriven mening och en utbytt sida är två
 * olika påståenden om världen, och bara det ena går att lägga fram med citatet
 * i handen. Slaget avgörs av om något av citatet står kvar — inte av vem som
 * äger sidan och inte av hur allvarligt det ser ut.
 */
export type Andringsslag = "ordalydelse" | "sidan-utbytt" | "sidan-borttagen";

export function andringsslag(utfall: Rotutfall, passage: string | null): Andringsslag | null {
  if (utfall === "borttagen") return "sidan-borttagen";
  if (utfall !== "andrad") return null;
  return passage === null ? "sidan-utbytt" : "ordalydelse";
}
