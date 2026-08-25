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
 * Kopplingen hör därför hemma i ett strukturerat fält. Det finns två: `group_id`
 * när det är SAMMA reform och beloppet ska räknas en gång, och
 * `cost.anchor_ids` när det är ett ANNAT löfte vars belopp lånas som
 * riktmärke — det senare är vad A5-regel 7 uttryckligen tillåter. Sajten
 * renderar ankaren som länkar med löftets rubrik, så läsaren ser en mening
 * och inte ett nummer.
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
 * VAD KRAVET INTE GÄLLER: en post vars hela publicerade kostnad är noll.
 * Kravet handlar om ett LÅNAT BELOPP som läsaren inte kan följa till sin källa.
 * Är låg, bas och hög alla noll finns inget sådant belopp. Meningen som nämner
 * ett annat löfte gör då något annat — den visar ett PREJUDIKAT FÖR NOLLAN:
 * «ett jämförbart löfte om en rättssäker migrationspolitik är prissatt till
 * 0 mkr på samma grund». Det är den styrkning kostnadsreglerna uttryckligen ber
 * om, och grinden fällde den praxis den borde belöna.
 *
 * Avgränsningen är hela kostnaden och inte bara basbeloppet, och skillnaden är
 * inte akademisk. Av de 68 nollade posterna i skulden 2026-08-23 bär 17 ett
 * nollskilt spann, och i två av dem — «jämförbara löften ligger 0–15 mkr … bas
 * 0, osäkerhet upp till 15 mkr» — är det TAKET som är lånat. Hade avgränsningen
 * läst basbeloppet ensamt hade de två sluppit ut på en teknikalitet. Nu blir de
 * kvar, tillsammans med de femton vars tak kommer ur den egna texten; att skilja
 * dem åt kräver en läsning, och den läsningen är just vad skulden står för.
 *
 * VAD DET INTE FÅNGAR: om gruppen som posten sitter i är RÄTT grupp, eller om
 * beloppet som lånas är rimligt. Det är en läsning, inte en grind.
 */

/** Uträkningen säger att beloppet kommer från ett annat löfte. */
export const LANAR_BELOPP =
  /jämförbar\w*\s+(?:löfte|löften|investering|reform|post|åtgärd|satsning|strategiuppdrag)|liknande löfte|motsvarande löfte|annat löfte|andra löften|jämförbara löften/iu;

export interface AnkarPost {
  id: string;
  group_id?: string | null;
  status?: string;
  cost: {
    calculation?: string | null;
    anchor_ids?: readonly string[] | null;
    msek_low?: number | null;
    msek_base?: number | null;
    msek_high?: number | null;
  };
}

/** Publicerar posten över huvud taget något belopp? */
export function barBelopp(post: AnkarPost): boolean {
  const { msek_low, msek_base, msek_high } = post.cost;
  return [msek_low, msek_base, msek_high].some((v) => (v ?? 0) !== 0);
}

/** Sant om posten lånar ett belopp utan en spårbar koppling till källan. */
export function lanarUtanSparbartAnkare(post: AnkarPost): boolean {
  if (!LANAR_BELOPP.test(post.cost.calculation ?? "")) return false;
  // En nolla lånar ingenting. Se docstringen ovan.
  if (!barBelopp(post)) return false;
  if (post.cost.anchor_ids && post.cost.anchor_ids.length > 0) return false;
  return !post.group_id;
}

/** Alla aktiva löften som bryter mot ankarkravet, i stabil id-ordning. */
export function ankarbrott(poster: readonly AnkarPost[]): string[] {
  return poster
    .filter((p) => p.status === "aktiv" && lanarUtanSparbartAnkare(p))
    .map((p) => p.id)
    .sort();
}


/** Ett jämförbart löfte som prissättningen hade framför sig. */
export interface Jamforbar {
  id: string;
  msek_base: number;
  period?: string;
}

/**
 * Vilket jämförbart löfte uträkningen faktiskt lånade av — om det går att veta.
 *
 * VARFÖR DEN BEHÖVS. Kö-prissättningen ger modellen upp till fem jämförbara
 * löften och modellen skriver «jämförbart löfte anger 8 mdkr/år» utan att säga
 * VILKET. Skriver den ut numret fälls den av spärren mot interna beteckningar i
 * publicerad text; skriver den inte ut det bryter posten mot ankarkravet så
 * fort den publiceras. Kön kunde alltså inte producera ett lånat belopp som
 * klarade båda grinderna — 45 löften publicerades 2026-08-25 rakt in i
 * ankarskulden.
 *
 * Fältet `anchor_ids` är vägen ut: det är en maskinläsbar hänvisning som sajten
 * renderar som en länk, och det är inte publicerad prosa.
 *
 * HUR ANKARET HITTAS. Beloppet. Står ett av de jämforbara löftenas basbelopp
 * utskrivet i uträkningen är det det löftet talet kommer från. Matchar FLERA
 * eller INGET returneras en tom lista — och då ska posten inte få någon
 * kostnad alls. Att gissa vilket av fem löften ett tal kom från vore att
 * skriva en hänvisning läsaren inte kan lita på, och en falsk härkomst är
 * sämre än ingen.
 */
export function harledAnkare(
  calculation: string | null | undefined,
  jamforbara: readonly Jamforbar[],
): string[] {
  const text = calculation ?? "";
  if (!LANAR_BELOPP.test(text)) return [];

  // Talen som står i texten, normaliserade till miljoner kronor. «8 mdkr» och
  // «8 000 mkr» är samma tal och ska matcha samma ankare.
  const tal = new Set<number>();
  for (const m of text.matchAll(/(\d[\d\s\u00a0]*(?:[.,]\d+)?)\s*(mdkr|miljard\w*|mkr|miljon\w*)/giu)) {
    const rå = Number(m[1]!.replace(/[\s\u00a0]/gu, "").replace(",", "."));
    if (!Number.isFinite(rå)) continue;
    tal.add(/^m(d|iljard)/iu.test(m[2]!) ? rå * 1000 : rå);
  }
  if (tal.size === 0) return [];

  const traffar = jamforbara.filter((j) => tal.has(j.msek_base));
  const unika = [...new Set(traffar.map((t) => t.id))];
  return unika.length === 1 ? unika : [];
}
