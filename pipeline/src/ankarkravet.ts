/**
 * Ankarkravet: lånar en uträkning ett belopp ur ett annat löfte ska kopplingen
 * gå att följa.
 *
 * VARFÖR. Den oberoende granskningen läste hela beståndet och fann att den
 * vanligaste kalkylbristen inte var räknefel utan ett ankare ingen kan följa:
 * «beloppet läggs där jämförbara löften ligger», «30–60 procent av ett
 * jämförbart löfte», «skala ankaret 1–6 gånger». För läsaren är det ett tal
 * utan grund. För en granskare är det värre — ett ankare utan koppling går
 * inte att pröva alls, och ankarregistret som byggdes under granskningen fick
 * 420 rader som samtliga var strukturella `group_id`-kopplingar.
 *
 * VARFÖR KOPPLINGEN INTE FÅR STÅ I TEXTEN. Det naturliga svaret vore att
 * skriva ut `p-2026-xxxx` i uträkningen. Det är förbjudet, och av goda skäl:
 * `publicerad-text` spärrar interna beteckningar i text som möter läsaren,
 * dels för att numren inte säger en utomstående något, dels för att en mening
 * som pekar på ett nummer tyst slutar stämma när det löftets belopp rör sig.
 * Kopplingen hör därför hemma i ett strukturerat fält — i dag `group_id`, som
 * summeringen redan använder för att inte räkna samma reform två gånger.
 *
 * Det gör kravet strängare än det ser ut: ett lånat belopp ska antingen sitta
 * i en grupp med det löfte det lånar från, eller räknas om på egen grund, eller
 * nollas med skäl. Att bara namnge ankaret i prosan räcker inte.
 *
 * VARFÖR PROVET ÄR EN SPÄRRHAKE. 146 publicerade löften bröt mot kravet när
 * det skrevs. Att rätta dem kräver att någon läser varje uträkning och avgör
 * vilket löfte som avsågs; det går inte att maskinera, och att gissa vore att
 * uppfinna en koppling. Skulden är fryst i `facit/ankarskulden.json` och får
 * bara krympa.
 *
 * VAD DET INTE FÅNGAR: om gruppen som posten sitter i är RÄTT grupp, eller om
 * beloppet som lånas är rimligt. Det är en läsning, inte en grind.
 */

/** Uträkningen säger att beloppet kommer från ett annat löfte. */
const LANAR_BELOPP =
  /jämförbar\w*\s+(?:löfte|löften|investering|reform|post|åtgärd|satsning|strategiuppdrag)|liknande löfte|motsvarande löfte|annat löfte|andra löften|jämförbara löften/iu;

export interface AnkarPost {
  id: string;
  group_id?: string | null;
  status?: string;
  cost: { calculation?: string | null };
}

/** Sant om posten lånar ett belopp utan en spårbar koppling till källan. */
export function lanarUtanSparbartAnkare(post: AnkarPost): boolean {
  if (!LANAR_BELOPP.test(post.cost.calculation ?? "")) return false;
  return !post.group_id;
}

/** Alla aktiva löften som bryter mot ankarkravet, i stabil id-ordning. */
export function ankarbrott(poster: readonly AnkarPost[]): string[] {
  return poster
    .filter((p) => p.status === "aktiv" && lanarUtanSparbartAnkare(p))
    .map((p) => p.id)
    .sort();
}
